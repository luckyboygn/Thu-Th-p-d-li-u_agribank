import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// 1. GET: Lấy danh sách yêu cầu bổ sung cán bộ
// - Đơn vị: Chỉ lấy yêu cầu của đơn vị mình (session.unitId)
// - Super Admin: Có thể xem toàn bộ hoặc lọc theo unitId, examId, status
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  const { searchParams } = new URL(req.url);
  const examIdParam = searchParams.get('examId');
  const statusParam = searchParams.get('status');
  const unitIdParam = searchParams.get('unitId');

  const db = getDatabase();

  let query = `
    SELECT r.*, 
           u.unit_code, u.unit_name,
           e.title as exam_title,
           req_user.full_name as requested_by_name,
           rev_user.full_name as reviewed_by_name
    FROM employee_add_requests r
    JOIN units u ON r.unit_id = u.id
    JOIN exams e ON r.exam_id = e.id
    LEFT JOIN users req_user ON r.requested_by = req_user.id
    LEFT JOIN users rev_user ON r.reviewed_by = rev_user.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (session.role === 'UNIT_ADMIN') {
    // Đơn vị chỉ được xem yêu cầu của chính mình
    query += ` AND r.unit_id = ? `;
    params.push(session.unitId);
  } else if (session.role === 'SUPER_ADMIN' || session.role === 'VIEWER') {
    if (unitIdParam) {
      query += ` AND r.unit_id = ? `;
      params.push(parseInt(unitIdParam));
    }
  }

  if (examIdParam) {
    query += ` AND r.exam_id = ? `;
    params.push(parseInt(examIdParam));
  }

  if (statusParam && ['PENDING', 'APPROVED', 'REJECTED'].includes(statusParam)) {
    query += ` AND r.status = ? `;
    params.push(statusParam);
  }

  query += ` ORDER BY r.id DESC LIMIT 200 `;

  try {
    const requests = db.prepare(query).all(...params);
    return NextResponse.json({ requests });
  } catch (err: any) {
    console.error('Error fetching employee requests:', err);
    return NextResponse.json({ error: 'Lỗi khi tải danh sách yêu cầu bổ sung cán bộ.' }, { status: 500 });
  }
}

// 2. POST: Đơn vị gửi yêu cầu đề nghị bổ sung cán bộ
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  try {
    const body = await req.json();
    const { examId, employeeCode, elearningAccount, fullName, position, reason } = body;

    if (!examId || !employeeCode || !elearningAccount || !fullName || !reason) {
      return NextResponse.json({
        error: 'Vui lòng điền đầy đủ các thông tin: Kỳ thi, Mã cán bộ, Tài khoản eLearning, Họ tên và Lý do đề nghị.'
      }, { status: 400 });
    }

    const trimmedCode = String(employeeCode).trim();
    const trimmedElearning = String(elearningAccount).trim();
    const trimmedName = String(fullName).trim();
    const trimmedReason = String(reason).trim();
    const trimmedPos = position ? String(position).trim() : '';

    if (trimmedReason.length < 5) {
      return NextResponse.json({ error: 'Lý do đề nghị bổ sung phải rõ ràng (tối thiểu 5 ký tự).' }, { status: 400 });
    }

    const db = getDatabase();

    // Xác định unitId
    let unitId = session.unitId;
    if (session.role === 'SUPER_ADMIN' && body.unitId) {
      unitId = Number(body.unitId);
    }

    if (!unitId) {
      return NextResponse.json({ error: 'Không xác định được đơn vị của người gửi.' }, { status: 400 });
    }

    // Kiểm tra xem đã có yêu cầu PENDING tương tự chưa
    const existing = db.prepare(`
      SELECT id FROM employee_add_requests
      WHERE exam_id = ? AND unit_id = ? AND employee_code = ? AND status = 'PENDING'
    `).get(examId, unitId, trimmedCode) as any;

    if (existing) {
      return NextResponse.json({
        error: `Đã có yêu cầu bổ sung cán bộ mã [${trimmedCode}] đang chờ duyệt cho kỳ thi này.`
      }, { status: 409 });
    }

    const res = db.prepare(`
      INSERT INTO employee_add_requests (
        exam_id, unit_id, employee_code, elearning_account, full_name, position, reason, status, requested_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).run(examId, unitId, trimmedCode, trimmedElearning, trimmedName, trimmedPos, trimmedReason, session.id);

    const requestId = Number(res.lastInsertRowid);

    logAudit({
      userId: session.id,
      username: session.username,
      unitId,
      action: 'REQUEST_ADD_EMPLOYEE',
      details: { requestId, examId, employeeCode: trimmedCode, elearningAccount: trimmedElearning, fullName: trimmedName, reason: trimmedReason },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    // Gửi thông báo trong ứng dụng cho Super Admin
    const unitRow = db.prepare('SELECT unit_code, unit_name FROM units WHERE id = ?').get(unitId) as any;
    const { notifyNewEmployeeRequest } = await import('@/lib/notification');
    await notifyNewEmployeeRequest({
      unitCode: unitRow?.unit_code || String(unitId),
      unitName: unitRow?.unit_name,
      employeeCode: trimmedCode,
      fullName: trimmedName,
      link: '/admin/employee-requests'
    });

    return NextResponse.json({
      success: true,
      message: 'Gửi đề nghị bổ sung cán bộ thành công! Ban Quản trị sẽ xem xét phê duyệt.',
      requestId
    });
  } catch (err: any) {
    console.error('Error creating employee request:', err);
    return NextResponse.json({ error: err.message || 'Lỗi khi gửi yêu cầu bổ sung cán bộ.' }, { status: 500 });
  }
}
