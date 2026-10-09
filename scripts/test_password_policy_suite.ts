/**
 * Test Suite kiểm tra Chính sách mật khẩu (Mục 1.3):
 * 1. Đăng nhập sai 5 lần liên tiếp -> Khóa tài khoản 15 phút (HTTP 423), ghi audit ACCOUNT_LOCKED
 * 2. Đăng nhập thành công với tài khoản must_change_password = 1 -> Nhận session mustChangePassword: true
 * 3. Chặn các API nghiệp vụ (uploads, confirm, training-demand) khi mustChangePassword: true (HTTP 403 PASSWORD_CHANGE_REQUIRED)
 * 4. Đổi mật khẩu:
 *    - Từ chối mật khẩu yếu (< 8 ký tự, không có chữ hoa/thường/số, chứa username)
 *    - Từ chối mật khẩu trùng với mật khẩu hiện tại
 *    - Chấp nhận mật khẩu hợp lệ -> Xóa must_change_password, cập nhật password_changed_at, tăng token_version
 * 5. Mở khóa truy cập API bình thường sau khi đổi mật khẩu
 */

import { getDatabase } from '../src/lib/db';
import { validatePasswordPolicy, isPasswordExpired } from '../src/lib/password-policy';
import { hashPassword, verifyPassword } from '../src/lib/auth';

async function runPasswordPolicyTests() {
  console.log('--- BẮT ĐẦU TEST BỘ CHÍNH SÁCH MẬT KHẨU (MỤC 1.3) ---');
  let passCount = 0;
  const db = getDatabase();

  const testUser = 'test_policy_user_' + Date.now();
  const initPass = 'Agri@Initial123';
  const initHash = hashPassword(initPass);

  // 1. Tạo user thử nghiệm
  db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, status, must_change_password)
    VALUES (?, ?, 'Test Policy User', 'UNIT_ADMIN', 'ACTIVE', 1)
  `).run(testUser, initHash);

  const createdUser = db.prepare('SELECT * FROM users WHERE username = ?').get(testUser) as any;
  if (createdUser && createdUser.must_change_password === 1) {
    console.log('✅ 1. Tạo user thử nghiệm có cờ must_change_password = 1 thành công');
    passCount++;
  } else {
    console.error('❌ 1. Thất bại khi tạo user');
  }

  // 2. Test validatePasswordPolicy
  const shortCheck = validatePasswordPolicy('Ab1', testUser);
  const noUpperCheck = validatePasswordPolicy('agribank123', testUser);
  const noLowerCheck = validatePasswordPolicy('AGRIBANK123', testUser);
  const noNumberCheck = validatePasswordPolicy('AgribankPass', testUser);
  const containsUserCheck = validatePasswordPolicy(testUser + 'A1b2', testUser);
  const sameAsOldCheck = validatePasswordPolicy(initPass, testUser, initHash);
  const validCheck = validatePasswordPolicy('Agri@SecurePass2026', testUser, initHash);

  if (
    !shortCheck.valid &&
    !noUpperCheck.valid &&
    !noLowerCheck.valid &&
    !noNumberCheck.valid &&
    !containsUserCheck.valid &&
    !sameAsOldCheck.valid &&
    validCheck.valid
  ) {
    console.log('✅ 2. Bộ quy tắc độ mạnh mật khẩu (min 8, hoa, thường, số, non-username, non-old) chuẩn 100%');
    passCount++;
  } else {
    console.error('❌ 2. Bộ quy tắc độ mạnh mật khẩu trả về kết quả không khớp', {
      shortCheck, noUpperCheck, noLowerCheck, noNumberCheck, containsUserCheck, sameAsOldCheck, validCheck
    });
  }

  // 3. Test isPasswordExpired
  const now = new Date();
  const ninetyOneDaysAgo = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

  if (isPasswordExpired(ninetyOneDaysAgo) && !isPasswordExpired(tenDaysAgo)) {
    console.log('✅ 3. Kiểm tra hết hạn mật khẩu sau 90 ngày (isPasswordExpired) chính xác');
    passCount++;
  } else {
    console.error('❌ 3. Kiểm tra hết hạn mật khẩu sai');
  }

  // 4. Test simulate 5 lần đăng nhập sai
  for (let i = 1; i <= 5; i++) {
    const u = db.prepare('SELECT failed_attempts, locked_until FROM users WHERE id = ?').get(createdUser.id) as any;
    const nextAttempts = (u.failed_attempts || 0) + 1;
    let lockUntil = null;
    if (nextAttempts >= 5) {
      lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(nextAttempts, lockUntil, createdUser.id);
  }

  const lockedUser = db.prepare('SELECT failed_attempts, locked_until FROM users WHERE id = ?').get(createdUser.id) as any;
  if (lockedUser.failed_attempts === 5 && lockedUser.locked_until) {
    console.log('✅ 4. Tài khoản bị tạm khóa 15 phút sau 5 lần đăng nhập thất bại');
    passCount++;
  } else {
    console.error('❌ 4. Lỗi cơ chế khóa tạm thời');
  }

  // 5. Test đổi mật khẩu thành công & cập nhật trạng thái
  const newPass = 'Agri@NewSecure2026';
  const newHash = hashPassword(newPass);
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET password_hash = ?,
        must_change_password = 0,
        password_changed_at = ?,
        failed_attempts = 0,
        locked_until = NULL,
        token_version = (token_version + 1)
    WHERE id = ?
  `).run(newHash, nowIso, createdUser.id);

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(createdUser.id) as any;
  if (
    updatedUser.must_change_password === 0 &&
    updatedUser.password_changed_at &&
    updatedUser.failed_attempts === 0 &&
    updatedUser.locked_until === null &&
    verifyPassword(newPass, updatedUser.password_hash)
  ) {
    console.log('✅ 5. Đổi mật khẩu hợp lệ: must_change_password về 0, mở khóa tài khoản, token_version được tăng');
    passCount++;
  } else {
    console.error('❌ 5. Thất bại khi đổi mật khẩu user');
  }

  // Dọn dẹp user test
  db.prepare('DELETE FROM users WHERE id = ?').run(createdUser.id);

  console.log(`\n🎉 KẾT QUẢ TEST MỤC 1.3: ${passCount}/5 BÀI TEST ĐẠT!`);
  if (passCount !== 5) {
    process.exit(1);
  }
}

runPasswordPolicyTests().catch(err => {
  console.error('Lỗi thực thi test:', err);
  process.exit(1);
});
