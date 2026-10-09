import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hashPassword } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

// Hàm sinh mật khẩu tạm thời ngẫu nhiên có chữ hoa, thường, số, ký tự đặc biệt
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let randomStr = '';
  for (let i = 0; i < 6; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Agr@${randomStr}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    // BẢO MẬT SERVER-SIDE: Chỉ SUPER_ADMIN mới được reset password
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm (SUPER_ADMIN) mới có quyền đặt lại mật khẩu.' }, { status: 403 });
    }

    const { userId, customPassword } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'Thiếu thông tin người dùng cần đặt lại mật khẩu.' }, { status: 400 });
    }

    const db = getDatabase();
    const targetUser = db.prepare('SELECT id, username, full_name, unit_id, token_version FROM users WHERE id = ?').get(userId) as any;
    if (!targetUser) {
      return NextResponse.json({ error: 'Không tìm thấy người dùng trong hệ thống.' }, { status: 404 });
    }

    // Sinh mật khẩu tạm ngẫu nhiên hiển thị đúng 1 lần nếu không truyền customPassword
    const tempPassword = customPassword?.trim() ? customPassword.trim() : generateRandomPassword();
    const newHash = hashPassword(tempPassword);

    // Tăng token_version để vô hiệu hóa tất cả session cũ, đồng thời đặt cờ must_change_password nếu có
    const nextTokenVersion = (targetUser.token_version || 1) + 1;

    // Kiểm tra xem cột must_change_password có tồn tại không
    const userCols = db.prepare("PRAGMA table_info(users);").all() as any[];
    const hasMustChange = userCols.some(c => c.name === 'must_change_password');

    if (hasMustChange) {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, token_version = ?, must_change_password = 1
        WHERE id = ?
      `).run(newHash, nextTokenVersion, targetUser.id);
    } else {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, token_version = ?
        WHERE id = ?
      `).run(newHash, nextTokenVersion, targetUser.id);
    }

    logAudit({
      userId: session.id,
      username: session.username,
      unitId: targetUser.unit_id,
      action: 'RESET_PASSWORD',
      details: {
        targetUsername: targetUser.username,
        targetUserId: targetUser.id,
        tokenVersionInvalidated: true,
        mustChangePassword: true
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      message: `Đã đặt lại mật khẩu cho tài khoản ${targetUser.username} thành công!`,
      tempPassword
    });
  } catch (error: any) {
    console.error('Error resetting password:', error);
    return NextResponse.json({ error: 'Lỗi khi đặt lại mật khẩu: ' + error.message }, { status: 500 });
  }
}
