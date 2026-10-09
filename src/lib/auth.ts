import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDatabase } from './db';
import { NextRequest, NextResponse } from 'next/server';
import { isPasswordExpired } from './password-policy';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Lỗi bảo mật nghiêm trọng: Biến môi trường JWT_SECRET chưa được cấu hình trong môi trường Production.');
    } else {
      console.warn('[CẢNH BÁO BẢO MẬT] Đang dùng khóa JWT_SECRET mặc định trong môi trường phát triển. Vui lòng thiết lập biến môi trường JWT_SECRET trước khi triển khai production.');
      return 'agribank_candidate_verification_secret_key_2026_super_secure';
    }
  }
  return secret;
}

export interface UserSession {
  id: number;
  username: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'UNIT_ADMIN' | 'UNIT_PREPARER' | 'UNIT_APPROVER' | 'VIEWER';
  unitId: number | null;
  unitCode?: string;
  unitName?: string;
  tokenVersion: number;
  mustChangePassword?: boolean;
}

export function hashPassword(password: string): string {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

export function verifyPassword(password: string, hash: string): boolean {
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
}

export function signToken(payload: UserSession): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): UserSession | null {
  try {
    return jwt.verify(token, getJwtSecret()) as UserSession;
  } catch (error) {
    return null;
  }
}

export function getSessionFromRequest(request: NextRequest): UserSession | null {
  let token: string | null = null;

  // 1. Kiểm tra Authorization header Bearer token
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. Kiểm tra Cookie 'auth_token'
  if (!token) {
    const cookie = request.cookies.get('auth_token');
    if (cookie?.value) {
      token = cookie.value;
    }
  }

  if (!token) return null;

  const session = verifyToken(token);
  if (!session) return null;

  // 0.3: Kiểm tra DB xác thực trạng thái tài khoản ACTIVE, token_version và must_change_password
  try {
    const db = getDatabase();
    const user = db.prepare(`
      SELECT id, username, full_name, role, unit_id, status, token_version,
             must_change_password, password_changed_at
      FROM users
      WHERE id = ?
    `).get(session.id) as any;

    if (!user) return null;
    if (user.status !== 'ACTIVE') return null;

    const currentTokenVersion = user.token_version ?? 1;
    const sessionTokenVersion = session.tokenVersion ?? 1;
    if (currentTokenVersion !== sessionTokenVersion) {
      return null;
    }

    const expired = isPasswordExpired(user.password_changed_at);
    const requireChangePassword = Boolean(user.must_change_password) || expired;

    return {
      ...session,
      tokenVersion: currentTokenVersion,
      role: user.role,
      unitId: user.unit_id,
      mustChangePassword: requireChangePassword
    };
  } catch (e) {
    console.error('Lỗi kiểm tra session trong CSDL:', e);
    return null;
  }
}

/**
 * Kiểm tra xem session có bị bắt buộc đổi mật khẩu hay không.
 * Nếu có và đang truy cập API nghiệp vụ khác (ngoài đổi mật khẩu, me, logout), trả về HTTP 403 PASSWORD_CHANGE_REQUIRED.
 */
export function enforcePasswordPolicy(request: NextRequest, session: UserSession | null): NextResponse | null {
  if (!session) return null;

  const pathname = request.nextUrl.pathname;
  // Các endpoint cho phép người dùng đang cần đổi mật khẩu truy cập
  const allowedPaths = [
    '/api/auth/change-password',
    '/api/auth/me',
    '/api/auth/logout'
  ];

  if (session.mustChangePassword && !allowedPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.json({
      error: 'Tài khoản cần đổi mật khẩu trước khi tiếp tục thao tác trên hệ thống.',
      code: 'PASSWORD_CHANGE_REQUIRED'
    }, { status: 403 });
  }

  return null;
}

export function authenticateUser(username: string, password: string): UserSession | null {
  const db = getDatabase();
  const trimmed = username.trim();
  let user = db.prepare(`
    SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.unit_id, u.status, u.token_version,
           u.must_change_password, u.password_changed_at,
           un.unit_code, un.unit_name
    FROM users u
    LEFT JOIN units un ON u.unit_id = un.id
    WHERE LOWER(u.username) = LOWER(?) AND u.status = 'ACTIVE'
  `).get(trimmed) as any;

  if (!user && !trimmed.includes('_')) {
    // Thử tìm theo mã đơn vị + _Admin (ví dụ nhập 1300 thay vì 1300_Admin)
    user = db.prepare(`
      SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.unit_id, u.status, u.token_version,
             u.must_change_password, u.password_changed_at,
             un.unit_code, un.unit_name
      FROM users u
      LEFT JOIN units un ON u.unit_id = un.id
      WHERE LOWER(u.username) = LOWER(?) || '_admin' AND u.status = 'ACTIVE'
    `).get(trimmed) as any;
  }

  if (!user) return null;

  // 0.1: Kiểm tra mật khẩu thuần túy bằng bcrypt hash, không dùng backdoor
  const valid = verifyPassword(password, user.password_hash);
  if (!valid) return null;

  const expired = isPasswordExpired(user.password_changed_at);
  const requireChangePassword = Boolean(user.must_change_password) || expired;

  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    unitId: user.unit_id,
    unitCode: user.unit_code,
    unitName: user.unit_name,
    tokenVersion: user.token_version ?? 1,
    mustChangePassword: requireChangePassword
  };
}
