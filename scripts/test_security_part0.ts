import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { authenticateUser, signToken, getSessionFromRequest, hashPassword } from '../src/lib/auth';
import { NextRequest } from 'next/server';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('--- BẮT ĐẦU KIỂM THỬ BẢO MẬT PHẦN 0 ---');

// Tạo một user test tạm thời
const testUsername = 'sec_test_unit_user';
db.prepare("DELETE FROM users WHERE username = ?").run(testUsername);

// Hash một mật khẩu khác biệt hoàn toàn (không phải Unit@123456 hay 123456)
const correctPassword = 'SecPassword@2026';
const wrongBackdoor = 'Unit@123456';
const wrongBackdoor2 = '123456';
const pwdHash = hashPassword(correctPassword);

db.prepare(`
  INSERT INTO users (username, password_hash, full_name, role, status, token_version)
  VALUES (?, ?, 'Sec Test User', 'UNIT_ADMIN', 'ACTIVE', 1)
`).run(testUsername, pwdHash);

const userRecord = db.prepare("SELECT * FROM users WHERE username = ?").get(testUsername) as any;

// 1. Kiểm tra Backdoor đã bị gỡ hoàn toàn:
console.log('1. Kiểm tra backdoor mật khẩu:');
const loginWithBackdoor1 = authenticateUser(testUsername, wrongBackdoor);
if (loginWithBackdoor1 !== null) {
  throw new Error('FAIL: Backdoor Unit@123456 vẫn đăng nhập được dù password_hash không khớp!');
}
const loginWithBackdoor2 = authenticateUser(testUsername, wrongBackdoor2);
if (loginWithBackdoor2 !== null) {
  throw new Error('FAIL: Backdoor 123456 vẫn đăng nhập được dù password_hash không khớp!');
}
const loginWithCorrect = authenticateUser(testUsername, correctPassword);
if (!loginWithCorrect) {
  throw new Error('FAIL: Đăng nhập bằng mật khẩu đúng thất bại!');
}
console.log('   -> PASS: Backdoor đã bị xóa hoàn toàn. Chỉ mật khẩu chuẩn hash mới đăng nhập được.');

// 2. Tạo token hợp lệ từ session
console.log('2. Kiểm tra xác thực token hợp lệ:');
const token = signToken(loginWithCorrect);

// Giả lập NextRequest với Bearer token
function createMockRequest(authToken: string) {
  return new NextRequest('http://localhost:3000/api/dashboard/unit', {
    headers: {
      'authorization': `Bearer ${authToken}`
    }
  });
}

let session = getSessionFromRequest(createMockRequest(token));
if (!session || session.username !== testUsername) {
  throw new Error('FAIL: Không đọc được session từ token hợp lệ!');
}
console.log('   -> PASS: Token hợp lệ được xác thực thành công.');

// 3. Khóa tài khoản (status = 'INACTIVE') -> Token cũ phải bị từ chối
console.log('3. Kiểm tra khóa tài khoản (status = INACTIVE):');
db.prepare("UPDATE users SET status = 'INACTIVE' WHERE id = ?").run(userRecord.id);

session = getSessionFromRequest(createMockRequest(token));
if (session !== null) {
  throw new Error('FAIL: Tài khoản đã bị INACTIVE nhưng token cũ vẫn được chấp nhận!');
}
console.log('   -> PASS: Tài khoản INACTIVE bị từ chối truy cập ngay lập tức.');

// Mở lại tài khoản
db.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = ?").run(userRecord.id);

// 4. Đổi mật khẩu / Tăng token_version -> Token cũ phải bị từ chối
console.log('4. Kiểm tra vô hiệu hóa token cũ khi token_version tăng:');
db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(userRecord.id);

session = getSessionFromRequest(createMockRequest(token));
if (session !== null) {
  throw new Error('FAIL: token_version đã tăng nhưng token phiên cũ vẫn được chấp nhận!');
}
console.log('   -> PASS: Token phiên cũ bị vô hiệu hóa ngay tức thì khi token_version thay đổi.');

// Dọn dẹp user test
db.prepare("DELETE FROM users WHERE username = ?").run(testUsername);

console.log('========================================');
console.log('TẤT CẢ KIỂM THỬ BẢO MẬT PHẦN 0 ĐỀU ĐẠT!');
console.log('========================================');
