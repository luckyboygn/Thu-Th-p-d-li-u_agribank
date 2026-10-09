import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// GET: Lấy danh sách người dùng (hỗ trợ tìm kiếm, lọc theo đơn vị, vai trò, trạng thái)
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền truy cập.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const unitId = searchParams.get('unitId') ? parseInt(searchParams.get('unitId')!) : null;
  const role = searchParams.get('role') || 'ALL';
  const status = searchParams.get('status') || 'ALL';

  const db = getDatabase();
  let query = `
    SELECT u.id, u.username, u.full_name, u.role, u.unit_id, u.status, u.token_version, u.created_at,
           un.unit_code, un.unit_name
    FROM users u
    LEFT JOIN units un ON u.unit_id = un.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (q.trim()) {
    query += ` AND (LOWER(u.username) LIKE ? OR LOWER(u.full_name) LIKE ?)`;
    const term = `%${q.trim().toLowerCase()}%`;
    params.push(term, term);
  }

  if (unitId) {
    query += ` AND u.unit_id = ?`;
    params.push(unitId);
  }

  if (role !== 'ALL') {
    query += ` AND u.role = ?`;
    params.push(role);
  }

  if (status !== 'ALL') {
    query += ` AND u.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY u.id DESC`;

  const users = db.prepare(query).all(...params);
  return NextResponse.json({ users });
}

// POST: Tạo tài khoản người dùng mới
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền tạo người dùng.' }, { status: 403 });
  }

  try {
    const { username, fullName, role, unitId, password } = await req.json();

    if (!username || !fullName || !role) {
      return NextResponse.json({ error: 'Vui lòng điền đầy đủ Tên đăng nhập, Họ và tên, và Vai trò.' }, { status: 400 });
    }

    const validRoles = ['SUPER_ADMIN', 'UNIT_ADMIN', 'UNIT_PREPARER', 'UNIT_APPROVER', 'VIEWER'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Vai trò "${role}" không hợp lệ. Các vai trò được chấp nhận: ${validRoles.join(', ')}` }, { status: 400 });
    }

    const isUnitRole = ['UNIT_ADMIN', 'UNIT_PREPARER', 'UNIT_APPROVER'].includes(role);
    if (isUnitRole && !unitId) {
      return NextResponse.json({ error: 'Tài khoản thuộc Đơn vị bắt buộc phải gán với một đơn vị cụ thể.' }, { status: 400 });
    }

    const trimmedUser = username.trim();
    const initialPassword = password?.trim() || 'Unit@123456';
    if (initialPassword.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 6 ký tự.' }, { status: 400 });
    }

    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(trimmedUser);
    if (existing) {
      return NextResponse.json({ error: `Tên đăng nhập "${trimmedUser}" đã tồn tại trên hệ thống.` }, { status: 400 });
    }

    const pwdHash = hashPassword(initialPassword);

    const res = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, unit_id, status, token_version)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1)
    `).run(trimmedUser, pwdHash, fullName.trim(), role, unitId || null);

    logAudit({
      userId: session.id,
      username: session.username,
      unitId: unitId || null,
      action: 'CREATE_USER',
      details: { newUserId: res.lastInsertRowid, username: trimmedUser, fullName: fullName.trim(), role, unitId },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      userId: res.lastInsertRowid,
      message: `Đã tạo người dùng "${trimmedUser}" thành công!`
    });
  } catch (error: any) {
    console.error('Lỗi tạo người dùng:', error);
    return NextResponse.json({ error: 'Lỗi khi tạo người dùng: ' + error.message }, { status: 500 });
  }
}

// PUT: Cập nhật thông tin người dùng / Khóa / Mở khóa
export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền cập nhật người dùng.' }, { status: 403 });
  }

  try {
    const { id, fullName, role, unitId, status } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID người dùng.' }, { status: 400 });
    }

    const db = getDatabase();
    const oldUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!oldUser) {
      return NextResponse.json({ error: 'Không tìm thấy người dùng trong hệ thống.' }, { status: 404 });
    }

    // Không cho phép tự khóa tài khoản của chính mình
    if (oldUser.id === session.id && status === 'INACTIVE') {
      return NextResponse.json({ error: 'Bạn không thể tự khóa tài khoản của chính mình.' }, { status: 400 });
    }

    // Nếu khóa tài khoản hoặc thay đổi vai trò -> Tăng token_version để thu hồi token cũ ngay tức khắc
    const isStatusChanged = status && status !== oldUser.status;
    const isRoleChanged = role && role !== oldUser.role;
    let nextTokenVersion = oldUser.token_version || 1;
    if (status === 'INACTIVE' || isRoleChanged) {
      nextTokenVersion += 1;
    }

    db.prepare(`
      UPDATE users
      SET full_name = COALESCE(?, full_name),
          role = COALESCE(?, role),
          unit_id = COALESCE(?, unit_id),
          status = COALESCE(?, status),
          token_version = ?
      WHERE id = ?
    `).run(
      fullName ? fullName.trim() : null,
      role || null,
      unitId !== undefined ? unitId : null,
      status || null,
      nextTokenVersion,
      id
    );

    // Ghi audit logs chi tiết
    if (isStatusChanged) {
      const actionName = status === 'INACTIVE' ? 'LOCK_USER' : 'UNLOCK_USER';
      logAudit({
        userId: session.id,
        username: session.username,
        unitId: oldUser.unit_id,
        action: actionName,
        details: { targetUserId: id, targetUsername: oldUser.username, oldStatus: oldUser.status, newStatus: status },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
      });
    }

    logAudit({
      userId: session.id,
      username: session.username,
      unitId: unitId !== undefined ? unitId : oldUser.unit_id,
      action: 'UPDATE_USER',
      details: {
        targetUserId: id,
        targetUsername: oldUser.username,
        changes: { fullName, role, unitId, status }
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      message: 'Cập nhật thông tin người dùng thành công!'
    });
  } catch (error: any) {
    console.error('Lỗi cập nhật người dùng:', error);
    return NextResponse.json({ error: 'Lỗi khi cập nhật người dùng: ' + error.message }, { status: 500 });
  }
}
