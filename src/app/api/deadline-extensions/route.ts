import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// GET: Lấy danh sách gia hạn của một kỳ thi hoặc đợt khảo sát
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const targetType = searchParams.get('targetType'); // 'EXAM' | 'COLLECTION'
  const targetId = searchParams.get('targetId') ? parseInt(searchParams.get('targetId')!) : null;

  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'Thiếu thông tin targetType hoặc targetId.' }, { status: 400 });
  }

  const db = getDatabase();
  let query = `
    SELECT de.id, de.unit_id, de.target_type, de.target_id, de.new_end_at, de.reason, de.created_at,
           u.unit_code, u.unit_name, usr.username as created_by_username
    FROM deadline_extensions de
    JOIN units u ON de.unit_id = u.id
    LEFT JOIN users usr ON de.created_by = usr.id
    WHERE de.target_type = ? AND de.target_id = ?
  `;
  const params: any[] = [targetType, targetId];

  if (session.role === 'UNIT_ADMIN') {
    query += ' AND de.unit_id = ?';
    params.push(session.unitId);
  }

  query += ' ORDER BY de.id DESC';

  const extensions = db.prepare(query).all(...params);
  return NextResponse.json({ extensions });
}

// POST: Super Admin cấp gia hạn cho riêng một đơn vị
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền cấp gia hạn.' }, { status: 403 });
  }

  try {
    const { unitId, targetType, targetId, newEndAt, reason } = await req.json();

    if (!unitId || !targetType || !targetId || !newEndAt || !reason) {
      return NextResponse.json({ error: 'Vui lòng điền đầy đủ: Đơn vị, Loại đợt, ID đợt, Hạn chót mới và Lý do gia hạn.' }, { status: 400 });
    }

    if (reason.trim().length < 5) {
      return NextResponse.json({ error: 'Lý do gia hạn phải có ít nhất 5 ký tự.' }, { status: 400 });
    }

    const db = getDatabase();

    // Kiểm tra đơn vị tồn tại
    const unit = db.prepare('SELECT id, unit_code, unit_name FROM units WHERE id = ?').get(unitId) as any;
    if (!unit) {
      return NextResponse.json({ error: 'Đơn vị không tồn tại.' }, { status: 404 });
    }

    // Upsert gia hạn: INSERT or REPLACE
    db.prepare(`
      INSERT INTO deadline_extensions (unit_id, target_type, target_id, new_end_at, reason, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(unit_id, target_type, target_id) DO UPDATE SET
        new_end_at = excluded.new_end_at,
        reason = excluded.reason,
        created_by = excluded.created_by,
        created_at = CURRENT_TIMESTAMP
    `).run(unitId, targetType, targetId, newEndAt, reason.trim(), session.id);

    logAudit({
      userId: session.id,
      username: session.username,
      unitId,
      action: 'GRANT_EXTENSION',
      details: {
        unitCode: unit.unit_code,
        unitName: unit.unit_name,
        targetType,
        targetId,
        newEndAt,
        reason: reason.trim()
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      message: `Đã cấp gia hạn thành công cho đơn vị ${unit.unit_name} đến ${newEndAt}`
    });
  } catch (error: any) {
    console.error('Lỗi cấp gia hạn:', error);
    return NextResponse.json({ error: 'Lỗi máy chủ khi cấp gia hạn: ' + error.message }, { status: 500 });
  }
}
