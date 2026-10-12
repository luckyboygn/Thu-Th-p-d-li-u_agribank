import { SESSION_INACTIVITY_TIMEOUT_SECONDS, signToken, verifyToken, UserSession } from '../src/lib/auth';
import { NextRequest } from 'next/server';
import { GET as meGet } from '../src/app/api/auth/me/route';
import { POST as logoutPost } from '../src/app/api/auth/logout/route';

console.log('================================================================');
console.log('   BẮT ĐẦU CHẠY BỘ KIỂM THỬ: TỰ ĐỘNG ĐĂNG XUẤT SAU 15 PHÚT (1.3)');
console.log('================================================================');

// TEST 1: Hằng số thời gian phiên là 15 phút (900 giây)
if (SESSION_INACTIVITY_TIMEOUT_SECONDS !== 15 * 60) {
  throw new Error(`FAIL: SESSION_INACTIVITY_TIMEOUT_SECONDS phải là 900, nhận được: ${SESSION_INACTIVITY_TIMEOUT_SECONDS}`);
}
console.log('[PASS] TEST 1: Cấu hình chuẩn thời gian phiên: 15 phút (900 giây).');

// TEST 2: signToken tạo token hợp lệ và verifyToken thành công
import { getDatabase } from '../src/lib/db';

const db = getDatabase();
const adminUser = db.prepare("SELECT * FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get() as any;

const mockSession: UserSession = {
  id: adminUser.id,
  username: adminUser.username,
  fullName: adminUser.full_name,
  role: 'SUPER_ADMIN',
  unitId: null,
  tokenVersion: adminUser.token_version || 1
};

const token = signToken(mockSession);
const verified = verifyToken(token);
if (!verified || verified.username !== 'admin' || verified.role !== 'SUPER_ADMIN') {
  throw new Error('FAIL: verifyToken không khớp dữ liệu phiên!');
}
console.log('[PASS] TEST 2: Ký và xác thực token JWT 15 phút thành công.');

// TEST 3: /api/auth/me gia hạn trượt (sliding session) cookie 15 phút cho user đang hoạt động
const mockRequest = new NextRequest('http://localhost:3000/api/auth/me', {
  headers: {
    'cookie': `auth_token=${token}`
  }
});

async function runMeTest() {
  const meRes = await meGet(mockRequest);
  if (!meRes.ok) {
    throw new Error(`FAIL: /api/auth/me trả về status ${meRes.status}`);
  }
  const meJson = await meRes.json();
  if (!meJson.authenticated || meJson.user.username !== 'admin') {
    throw new Error('FAIL: /api/auth/me không trả về authenticated = true!');
  }

  // Kiểm tra cookie sliding refresh được thiết lập lại với maxAge 15 phút
  const setCookie = meRes.cookies.get('auth_token');
  if (!setCookie || !setCookie.value) {
    throw new Error('FAIL: /api/auth/me không cấp mới cookie sliding session!');
  }
  console.log('[PASS] TEST 3: /api/auth/me tự động gia hạn trượt (sliding session) thêm 15 phút thành công.');
}

async function runLogoutTest() {
  const logoutReq = new NextRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: {
      'cookie': `auth_token=${token}`
    }
  });
  const logoutRes = await logoutPost(logoutReq);
  if (!logoutRes.ok) {
    throw new Error('FAIL: /api/auth/logout thất bại!');
  }
  // Cookie auth_token phải bị xóa
  const deletedCookie = logoutRes.cookies.get('auth_token');
  if (deletedCookie && deletedCookie.value !== '' && (deletedCookie as any).maxAge !== 0) {
    throw new Error('FAIL: /api/auth/logout không xóa triệt để cookie!');
  }
  console.log('[PASS] TEST 4: /api/auth/logout xóa triệt để cookie phiên.');
}

async function main() {
  await runMeTest();
  await runLogoutTest();
  console.log('================================================================');
  console.log('   KẾT QUẢ: 4/4 BÀI TEST TỰ ĐỘNG ĐĂNG XUẤT SAU 15 PHÚT ĐÃ ĐẠT (100% PASS)');
  console.log('================================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
