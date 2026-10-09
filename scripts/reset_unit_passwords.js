const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('--- KHỞI TẠO ĐỒNG BỘ MẬT KHẨU TẠM CHO TÀI KHOẢN ĐƠN VỊ ---');

// Lấy danh sách các tài khoản UNIT_ADMIN
const unitUsers = db.prepare("SELECT id, username, password_hash FROM users WHERE role = 'UNIT_ADMIN'").all();

const defaultTempPassword = 'Unit@123456';
const salt = bcrypt.genSaltSync(10);
const properHash = bcrypt.hashSync(defaultTempPassword, salt);

let updatedCount = 0;
const updateStmt = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?");

for (const user of unitUsers) {
  const matches = bcrypt.compareSync(defaultTempPassword, user.password_hash);
  if (!matches) {
    updateStmt.run(properHash, user.id);
    updatedCount++;
  }
}

console.log(`Tổng số tài khoản đơn vị: ${unitUsers.length}`);
console.log(`Số tài khoản đã đồng bộ chuẩn mật khẩu: ${updatedCount}`);
console.log('Hoàn tất. Không có mật khẩu thô nào bị in ra log.');
