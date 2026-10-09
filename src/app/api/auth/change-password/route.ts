import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hashPassword, verifyPassword, signToken, UserSession } from '@/lib/auth';
import { validatePasswordPolicy } from '@/lib/password-policy';
import { getDatabase } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
    }

    const { currentPassword, newPassword, confirmPassword } = await req.json();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ error: 'Vui lòng điền đầy đủ tất cả các trường mật khẩu.' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'Mật khẩu mới và xác nhận mật khẩu không khớp nhau.' }, { status: 400 });
    }

    const db = getDatabase();
    const user = db.prepare('SELECT id, username, password_hash, role, token_version FROM users WHERE id = ?').get(session.id) as any;
    if (!user) {
      return NextResponse.json({ error: 'Không tìm thấy thông tin tài khoản.' }, { status: 404 });
    }

    // 0.1: Kiểm tra mật khẩu hiện tại bằng bcrypt hash thuần túy, không backdoor
    const isValidCurrent = verifyPassword(currentPassword, user.password_hash);
    if (!isValidCurrent) {
      return NextResponse.json({ error: 'Mật khẩu hiện tại không chính xác.' }, { status: 400 });
    }

    // 1.3: Áp dụng đầy đủ Password Policy (min 8 ký tự, hoa, thường, số, không trùng username, không trùng mật khẩu cũ)
    const policyCheck = validatePasswordPolicy(newPassword, user.username, user.password_hash);
    if (!policyCheck.valid) {
      return NextResponse.json({ error: policyCheck.message || 'Mật khẩu mới không thỏa mãn chính sách bảo mật.' }, { status: 400 });
    }

    const newHash = hashPassword(newPassword);
    // 0.3 & 1.3: Tăng token_version khi đổi mật khẩu để hủy tất cả phiên làm việc cũ, xóa must_change_password, cập nhật password_changed_at
    const nextTokenVersion = (user.token_version || 1) + 1;
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE users 
      SET password_hash = ?, 
          token_version = ?, 
          must_change_password = 0, 
          password_changed_at = ?,
          failed_attempts = 0,
          locked_until = NULL
      WHERE id = ?
    `).run(newHash, nextTokenVersion, nowIso, session.id);

    logAudit({
      userId: session.id,
      username: session.username,
      unitId: session.unitId,
      action: 'CHANGE_PASSWORD',
      details: { role: session.role, tokenVersionInvalidated: true }
    });

    const updatedSessionPayload: UserSession = {
      ...session,
      tokenVersion: nextTokenVersion,
      mustChangePassword: false
    };
    const newToken = signToken(updatedSessionPayload);

    const response = NextResponse.json({
      success: true,
      message: 'Đổi mật khẩu thành công!'
    });

    response.cookies.set({
      name: 'auth_token',
      value: newToken,
      httpOnly: true,
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    console.error('Error changing password:', error);
    return NextResponse.json({ error: 'Đã có lỗi xảy ra khi đổi mật khẩu.' }, { status: 500 });
  }
}
