import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { verifyPassword, signToken, UserSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { PASSWORD_POLICY, isPasswordExpired } from '@/lib/password-policy';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' }, { status: 400 });
    }

    const db = getDatabase();
    const trimmed = username.trim();

    // 1. Tìm user
    let user = db.prepare(`
      SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.unit_id, u.status, u.token_version,
             u.must_change_password, u.failed_attempts, u.locked_until, u.password_changed_at,
             un.unit_code, un.unit_name
      FROM users u
      LEFT JOIN units un ON u.unit_id = un.id
      WHERE LOWER(u.username) = LOWER(?)
    `).get(trimmed) as any;

    if (!user && !trimmed.includes('_')) {
      user = db.prepare(`
        SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.unit_id, u.status, u.token_version,
               u.must_change_password, u.failed_attempts, u.locked_until, u.password_changed_at,
               un.unit_code, un.unit_name
        FROM users u
        LEFT JOIN units un ON u.unit_id = un.id
        WHERE LOWER(u.username) = LOWER(?) || '_admin'
      `).get(trimmed) as any;
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('host');

    // Nếu không tìm thấy user hoặc user INACTIVE
    if (!user || user.status !== 'ACTIVE') {
      logAudit({
        username: trimmed,
        action: 'LOGIN_FAILED',
        details: { reason: 'User not found or inactive' },
        ipAddress
      });
      // Giữ thông báo đồng nhất để không lộ tài khoản có tồn tại hay không
      return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' }, { status: 401 });
    }

    const now = new Date();

    // 2. Kiểm tra xem tài khoản có đang bị khóa tạm thời không (locked_until)
    if (user.locked_until) {
      const lockUntilDate = new Date(user.locked_until);
      if (now < lockUntilDate) {
        const remainingMinutes = Math.ceil((lockUntilDate.getTime() - now.getTime()) / (1000 * 60));
        return NextResponse.json({
          error: `Tài khoản tạm thời bị khóa do nhập sai mật khẩu quá 5 lần liên tiếp. Vui lòng thử lại sau ${remainingMinutes} phút.`
        }, { status: 423 });
      } else {
        // Đã hết thời gian khóa tạm -> mở lại
        db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
        user.failed_attempts = 0;
        user.locked_until = null;
      }
    }

    // 3. Xác thực mật khẩu
    const isValidPassword = verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      const newFailedAttempts = (user.failed_attempts || 0) + 1;
      let newLockUntil: string | null = null;

      if (newFailedAttempts >= PASSWORD_POLICY.MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date(now.getTime() + PASSWORD_POLICY.LOCK_TIME_MINUTES * 60 * 1000);
        newLockUntil = lockUntil.toISOString();
        db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(newFailedAttempts, newLockUntil, user.id);

        logAudit({
          userId: user.id,
          username: user.username,
          unitId: user.unit_id,
          action: 'ACCOUNT_LOCKED',
          details: { failedAttempts: newFailedAttempts, lockDurationMinutes: PASSWORD_POLICY.LOCK_TIME_MINUTES },
          ipAddress
        });

        return NextResponse.json({
          error: `Tài khoản đã bị tạm khóa 15 phút do nhập sai mật khẩu ${PASSWORD_POLICY.MAX_FAILED_ATTEMPTS} lần liên tiếp.`
        }, { status: 423 });
      } else {
        db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(newFailedAttempts, user.id);

        logAudit({
          userId: user.id,
          username: user.username,
          unitId: user.unit_id,
          action: 'LOGIN_FAILED',
          details: { failedAttempts: newFailedAttempts, remainingAttempts: PASSWORD_POLICY.MAX_FAILED_ATTEMPTS - newFailedAttempts },
          ipAddress
        });

        return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' }, { status: 401 });
      }
    }

    // 4. Đăng nhập thành công -> Reset failed_attempts và locked_until
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

    // Kiểm tra chính sách bắt buộc đổi mật khẩu hoặc hết hạn 90 ngày
    const expired = isPasswordExpired(user.password_changed_at);
    const requireChangePassword = Boolean(user.must_change_password) || expired;

    const sessionPayload: UserSession = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      unitId: user.unit_id,
      unitCode: user.unit_code,
      unitName: user.unit_name,
      tokenVersion: user.token_version || 1,
      mustChangePassword: requireChangePassword
    };

    const token = signToken(sessionPayload);

    // Ghi audit log đăng nhập thành công
    logAudit({
      userId: user.id,
      username: user.username,
      unitId: user.unit_id,
      action: 'LOGIN',
      details: { role: user.role, mustChangePassword: requireChangePassword, expired },
      ipAddress
    });

    const response = NextResponse.json({
      success: true,
      user: sessionPayload,
      token,
      mustChangePassword: requireChangePassword,
      message: requireChangePassword ? 'Yêu cầu đổi mật khẩu trước khi tiếp tục thao tác.' : undefined
    });

    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Đã có lỗi xảy ra trong quá trình đăng nhập.' }, { status: 500 });
  }
}
