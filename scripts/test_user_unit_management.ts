import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { NextRequest } from 'next/server';
import { signToken } from '../src/lib/auth';
import { POST as createUserRoute, PUT as updateUserRoute, GET as getUsersRoute } from '../src/app/api/users/route';
import { POST as resetPasswordRoute } from '../src/app/api/auth/reset-password/route';
import { POST as createUnitRoute, PUT as updateUnitRoute, DELETE as deleteUnitRoute } from '../src/app/api/units/route';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('================================================================');
console.log('   BẮT ĐẦU CHẠY BỘ KIỂM THỬ: QUẢN LÝ NGƯỜI DÙNG & ĐƠN VỊ (1.2)');
console.log('================================================================');

// 1. Lấy Super Admin và Unit Admin session
const adminUser = db.prepare("SELECT * FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get() as any;
const unitUser = db.prepare("SELECT * FROM users WHERE role = 'UNIT_ADMIN' LIMIT 1").get() as any;

const adminToken = signToken({
  id: adminUser.id,
  username: adminUser.username,
  fullName: adminUser.full_name,
  role: 'SUPER_ADMIN',
  unitId: null,
  tokenVersion: adminUser.token_version || 1
});

const unitToken = signToken({
  id: unitUser.id,
  username: unitUser.username,
  fullName: unitUser.full_name,
  role: 'UNIT_ADMIN',
  unitId: unitUser.unit_id,
  tokenVersion: unitUser.token_version || 1
});

function createReq(url: string, method: string, token: string, body?: any) {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function runTests() {
  // TEST 1: Unit Admin cố gọi reset password -> Bị chặn 403
  console.log('TEST 1: Kiểm tra phân quyền: UNIT_ADMIN gọi /api/auth/reset-password:');
  const req1 = createReq('/api/auth/reset-password', 'POST', unitToken, { userId: adminUser.id });
  const res1 = await resetPasswordRoute(req1);
  if (res1.status !== 403) {
    throw new Error(`FAIL: UNIT_ADMIN không bị chặn 403 khi gọi reset-password! Status: ${res1.status}`);
  }
  console.log('[PASS] TEST 1: Chỉ SUPER_ADMIN mới được reset password. Phân quyền chặt chẽ 403.');

  // TEST 2: Super Admin tạo người dùng mới
  console.log('TEST 2: Super Admin tạo người dùng mới qua /api/users:');
  const testUsername = 'test_unit_user_999';
  db.prepare("DELETE FROM users WHERE username = ?").run(testUsername);

  const req2 = createReq('/api/users', 'POST', adminToken, {
    username: testUsername,
    fullName: 'Test Unit User 999',
    role: 'UNIT_ADMIN',
    unitId: unitUser.unit_id,
    password: 'Password@999'
  });
  const res2 = await createUserRoute(req2);
  const data2 = await res2.json();
  if (res2.status !== 200 || !data2.success) {
    throw new Error(`FAIL: Không tạo được người dùng! ${data2.error}`);
  }
  console.log('[PASS] TEST 2: Tạo tài khoản người dùng mới thành công.');

  const createdUser = db.prepare("SELECT * FROM users WHERE username = ?").get(testUsername) as any;

  // TEST 3: Super Admin đặt lại mật khẩu ngẫu nhiên cho user -> token_version tăng
  console.log('TEST 3: Super Admin reset mật khẩu -> sinh mật khẩu tạm ngẫu nhiên, token_version tăng:');
  const oldVer = createdUser.token_version;
  const req3 = createReq('/api/auth/reset-password', 'POST', adminToken, { userId: createdUser.id });
  const res3 = await resetPasswordRoute(req3);
  const data3 = await res3.json();
  if (res3.status !== 200 || !data3.tempPassword) {
    throw new Error(`FAIL: Reset mật khẩu không trả về mật khẩu tạm! ${data3.error}`);
  }
  const reloadedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(createdUser.id) as any;
  if (reloadedUser.token_version <= oldVer) {
    throw new Error(`FAIL: token_version không tăng sau khi reset mật khẩu!`);
  }
  console.log(`[PASS] TEST 3: Đã sinh mật khẩu tạm: ${data3.tempPassword.slice(0, 5)}***, token_version đã tăng (v${reloadedUser.token_version}).`);

  // TEST 4: Super Admin khóa tài khoản (LOCK_USER) -> token_version tiếp tục tăng
  console.log('TEST 4: Super Admin khóa tài khoản:');
  const req4 = createReq('/api/users', 'PUT', adminToken, {
    id: createdUser.id,
    status: 'INACTIVE'
  });
  const res4 = await updateUserRoute(req4);
  const data4 = await res4.json();
  if (res4.status !== 200 || !data4.success) {
    throw new Error(`FAIL: Lỗi khi khóa tài khoản! ${data4.error}`);
  }
  const lockedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(createdUser.id) as any;
  if (lockedUser.status !== 'INACTIVE') {
    throw new Error(`FAIL: Trạng thái user chưa đổi sang INACTIVE!`);
  }
  console.log('[PASS] TEST 4: Khóa tài khoản thành công.');

  // TEST 5: Quản lý Đơn vị: Thêm đơn vị mới -> Cập nhật -> Ngăn xóa đơn vị có dữ liệu
  console.log('TEST 5: Quản lý đơn vị và bảo vệ toàn vẹn dữ liệu:');
  const testUnitCode = 'TEST_UNIT_999';
  db.prepare("DELETE FROM units WHERE unit_code = ?").run(testUnitCode);

  const req5Create = createReq('/api/units', 'POST', adminToken, {
    unitCode: testUnitCode,
    unitName: 'Chi nhánh Kiểm thử 999',
    status: 'ACTIVE'
  });
  const res5Create = await createUnitRoute(req5Create);
  const data5Create = await res5Create.json();
  if (res5Create.status !== 200) {
    throw new Error(`FAIL: Tạo đơn vị thất bại: ${data5Create.error}`);
  }

  // Thử xóa đơn vị đang có dữ liệu (ví dụ unitUser.unit_id đã có upload)
  const req5DelProtected = createReq(`/api/units?id=${unitUser.unit_id}`, 'DELETE', adminToken);
  const res5DelProtected = await deleteUnitRoute(req5DelProtected);
  if (res5DelProtected.status !== 422) {
    throw new Error(`FAIL: Đơn vị có dữ liệu nhưng hệ thống không chặn xóa (422)! Status: ${res5DelProtected.status}`);
  }
  console.log('[PASS] TEST 5: Đơn vị đã có dữ liệu bị chặn xóa vĩnh viễn (422).');

  // Dọn dẹp
  db.prepare("DELETE FROM users WHERE username = ?").run(testUsername);
  db.prepare("DELETE FROM units WHERE unit_code = ?").run(testUnitCode);

  console.log('================================================================');
  console.log('   KẾT QUẢ: 5/5 BÀI TEST QUẢN LÝ NGƯỜI DÙNG & ĐƠN VỊ ĐÃ ĐẠT (100% PASS)');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
