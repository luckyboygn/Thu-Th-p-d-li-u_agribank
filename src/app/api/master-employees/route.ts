import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import * as xlsx from 'xlsx';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền xem Database gốc.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const statusParam = searchParams.get('status') || 'ALL';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;

  const db = getDatabase();

  let countQuery = 'SELECT COUNT(*) as total FROM employees WHERE 1=1';
  let dataQuery = 'SELECT id, employee_code, elearning_account, full_name, unit_code, unit_name, status, created_at, updated_at FROM employees WHERE 1=1';
  const params: any[] = [];

  if (statusParam !== 'ALL') {
    countQuery += ' AND status = ?';
    dataQuery += ' AND status = ?';
    params.push(statusParam);
  }

  if (q.trim()) {
    const term = `%${q.trim()}%`;
    countQuery += ' AND (employee_code LIKE ? OR elearning_account LIKE ? OR full_name LIKE ? OR unit_code LIKE ?)';
    dataQuery += ' AND (employee_code LIKE ? OR elearning_account LIKE ? OR full_name LIKE ? OR unit_code LIKE ?)';
    params.push(term, term, term, term);
  }

  dataQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';

  const total = (db.prepare(countQuery).get(...params) as any).total;
  const employees = db.prepare(dataQuery).all(...params, limit, offset);

  // Thống kê số lượng active / inactive
  const statusStats = db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count,
      SUM(CASE WHEN status = 'INACTIVE' THEN 1 ELSE 0 END) as inactive_count
    FROM employees
  `).get() as any;

  return NextResponse.json({
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    employees,
    activeCount: statusStats?.active_count || 0,
    inactiveCount: statusStats?.inactive_count || 0
  });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền nạp Database gốc.' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Vui lòng chọn file Excel.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows: any[] = xlsx.utils.sheet_to_json(ws);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File Excel không có dữ liệu.' }, { status: 400 });
    }

    // Nhận diện cột trong file gốc
    const firstRow = rows[0];
    const codeKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('mã cán bộ') || k.toLowerCase().includes('mã cb') || k.toLowerCase() === 'macb');
    const elearnKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('tên đăng nhập') || k.toLowerCase().includes('e-learning') || k.toLowerCase().includes('elearning'));
    const nameKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('họ') || k.toLowerCase().includes('tên'));
    const unitKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('đơn vị') || k.toLowerCase().includes('chi nhánh'));

    if (!codeKey || !elearnKey) {
      return NextResponse.json({ 
        error: `Không tìm thấy cột bắt buộc trong file. Cần có cột Mã cán bộ và Tên đăng nhập/eLearning. (Tìm thấy: ${Object.keys(firstRow).join(', ')})` 
      }, { status: 400 });
    }

    // Kiểm tra tính toàn vẹn 1-1 trong file trước khi nạp
    const seenCodes = new Map<string, string>(); // code -> elearn
    const seenElearns = new Map<string, string>(); // elearn -> code
    const qualityErrors: string[] = [];

    const validItems: Array<{ code: string; elearn: string; name: string; unit: string; raw: any }> = [];

    rows.forEach((r, idx) => {
      const code = String(r[codeKey] || '').trim();
      const elearn = String(r[elearnKey] || '').trim().toLowerCase();
      const name = nameKey ? String(r[nameKey] || '').trim() : '';
      const unit = unitKey ? String(r[unitKey] || '').trim() : '';

      if (!code || !elearn) return;

      // 1. Kiểm tra 1 mã cán bộ có nhiều eLearning không
      if (seenCodes.has(code) && seenCodes.get(code) !== elearn) {
        qualityErrors.push(`Dòng ${idx + 2}: Mã cán bộ ${code} được gán cho nhiều tài khoản eLearning khác nhau (${seenCodes.get(code)} và ${elearn}).`);
      }
      // 2. Kiểm tra 1 eLearning thuộc nhiều mã cán bộ không
      if (seenElearns.has(elearn) && seenElearns.get(elearn) !== code) {
        qualityErrors.push(`Dòng ${idx + 2}: Tài khoản eLearning ${elearn} được gán cho nhiều Mã cán bộ khác nhau (${seenElearns.get(elearn)} và ${code}).`);
      }

      seenCodes.set(code, elearn);
      seenElearns.set(elearn, code);
      validItems.push({ code, elearn, name, unit, raw: r });
    });

    if (qualityErrors.length > 0) {
      return NextResponse.json({
        error: 'File vi phạm nguyên tắc quan hệ 1-1 giữa Mã cán bộ và Tài khoản eLearning!',
        qualityErrors: qualityErrors.slice(0, 20),
        totalErrors: qualityErrors.length
      }, { status: 422 });
    }

    // Nạp vào Database trung tâm bằng transaction
    const db = getDatabase();
    const insertOrUpdate = db.prepare(`
      INSERT INTO employees (employee_code, elearning_account, full_name, unit_code, raw_info)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(employee_code) DO UPDATE SET
        elearning_account = excluded.elearning_account,
        full_name = excluded.full_name,
        unit_code = excluded.unit_code,
        raw_info = excluded.raw_info,
        updated_at = CURRENT_TIMESTAMP
    `);

    db.exec('BEGIN TRANSACTION;');
    let count = 0;
    try {
      for (const item of validItems) {
        insertOrUpdate.run(item.code, item.elearn, item.name, item.unit, JSON.stringify(item.raw));
        count++;
      }
      db.exec('COMMIT;');
    } catch (err: any) {
      db.exec('ROLLBACK;');
      return NextResponse.json({ error: 'Lỗi ghi dữ liệu Database: ' + err.message }, { status: 500 });
    }

    logAudit({
      userId: session.id,
      username: session.username,
      action: 'IMPORT_MASTER_DATABASE',
      details: { totalImported: count, fileName: file.name },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      message: `Đã nạp và cập nhật thành công ${count} cán bộ vào Database trung tâm.`,
      count
    });

  } catch (error: any) {
    console.error('Import master error:', error);
    return NextResponse.json({ error: 'Lỗi xử lý file: ' + error.message }, { status: 500 });
  }
}
