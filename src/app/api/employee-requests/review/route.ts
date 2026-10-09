import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  // Chỉ SUPER_ADMIN mới có quyền duyệt yêu cầu bổ sung cán bộ
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên cấp cao mới có quyền phê duyệt đề nghị bổ sung cán bộ.' }, { status: 403 });
  }

  try {
    const { requestId, action, reviewNote } = await req.json();

    if (!requestId || !action || !['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ. Vui lòng cung cấp requestId và action (APPROVE hoặc REJECT).' }, { status: 400 });
    }

    const db = getDatabase();
    const request = db.prepare(`
      SELECT r.*, u.unit_code
      FROM employee_add_requests r
      JOIN units u ON r.unit_id = u.id
      WHERE r.id = ?
    `).get(requestId) as any;

    if (!request) {
      return NextResponse.json({ error: 'Không tìm thấy yêu cầu bổ sung cán bộ.' }, { status: 404 });
    }

    if (request.status !== 'PENDING') {
      return NextResponse.json({
        error: `Yêu cầu này đã được xử lý trước đó với trạng thái: ${request.status}.`
      }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    if (action === 'REJECT') {
      const note = reviewNote ? String(reviewNote).trim() : '';
      if (note.length < 5) {
        return NextResponse.json({ error: 'Khi từ chối, bắt buộc phải nhập lý do từ chối rõ ràng (tối thiểu 5 ký tự).' }, { status: 400 });
      }

      db.prepare(`
        UPDATE employee_add_requests
        SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ?, review_note = ?
        WHERE id = ?
      `).run(session.id, nowIso, note, requestId);

      logAudit({
        userId: session.id,
        username: session.username,
        unitId: request.unit_id,
        action: 'REJECT_ADD_EMPLOYEE',
        details: { requestId, employeeCode: request.employee_code, reviewNote: note },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
      });

      // Gửi thông báo trong ứng dụng cho Đơn vị
      const { notifyEmployeeRequestUpdated } = await import('@/lib/notification');
      await notifyEmployeeRequestUpdated({
        unitId: request.unit_id,
        employeeCode: request.employee_code,
        status: 'REJECTED',
        reviewNote: note
      });

      return NextResponse.json({
        success: true,
        message: 'Đã từ chối đề nghị bổ sung cán bộ thành công.'
      });
    }

    // Hành động APPROVE: Kiểm tra trùng lặp trong bảng employees và thêm mới
    db.exec('BEGIN TRANSACTION;');
    try {
      const existingEmp = db.prepare(`
        SELECT id, employee_code, elearning_account FROM employees
        WHERE employee_code = ? OR elearning_account = ?
      `).get(request.employee_code, request.elearning_account) as any;

      if (existingEmp) {
        // Cán bộ đã có trong DB
        db.prepare(`
          UPDATE employee_add_requests
          SET status = 'APPROVED', reviewed_by = ?, reviewed_at = ?, review_note = 'Cán bộ đã tồn tại trong Master DB'
          WHERE id = ?
        `).run(session.id, nowIso, requestId);
      } else {
        // Thêm mới vào employees
        db.prepare(`
          INSERT INTO employees (
            employee_code, elearning_account, full_name, unit_code, position
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          request.employee_code,
          request.elearning_account,
          request.full_name,
          request.unit_code,
          request.position || ''
        );

        db.prepare(`
          UPDATE employee_add_requests
          SET status = 'APPROVED', reviewed_by = ?, reviewed_at = ?, review_note = ?
          WHERE id = ?
        `).run(session.id, nowIso, reviewNote || 'Đã duyệt bổ sung vào CSDL Master', requestId);
      }

      logAudit({
        userId: session.id,
        username: session.username,
        unitId: request.unit_id,
        action: 'APPROVE_ADD_EMPLOYEE',
        details: {
          requestId,
          employeeCode: request.employee_code,
          elearningAccount: request.elearning_account,
          fullName: request.full_name
        },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
      });

      db.exec('COMMIT;');

      // Gửi thông báo trong ứng dụng cho Đơn vị
      const { notifyEmployeeRequestUpdated } = await import('@/lib/notification');
      await notifyEmployeeRequestUpdated({
        unitId: request.unit_id,
        employeeCode: request.employee_code,
        status: 'APPROVED',
        reviewNote: reviewNote || 'Đã duyệt bổ sung vào CSDL Master'
      });

      return NextResponse.json({
        success: true,
        message: `Đã phê duyệt đề nghị bổ sung cán bộ [${request.employee_code}] thành công và đồng bộ vào CSDL Master!`
      });
    } catch (err: any) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } catch (err: any) {
    console.error('Error reviewing employee request:', err);
    return NextResponse.json({ error: err.message || 'Lỗi khi xử lý phê duyệt đề nghị.' }, { status: 500 });
  }
}
