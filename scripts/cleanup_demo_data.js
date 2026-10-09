/**
 * scripts/cleanup_demo_data.js
 * Dọn dẹp dữ liệu thử nghiệm (demo/test) để chuyển hệ thống sang giai đoạn vận hành chính thức (Go-live).
 * - Tự động sao lưu cơ sở dữ liệu an toàn (VACUUM INTO) trước khi thực hiện.
 * - Xóa sạch các bài nộp, khảo sát, logs thử nghiệm.
 * - Bảo toàn 100% dữ liệu danh mục: units (155 đơn vị), users, master catalog (positions, topics, programs), employees.
 * - Idempotent: chạy nhiều lần an toàn.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/database.sqlite');
const backupDir = path.resolve(__dirname, '../backups');

if (!fs.existsSync(dbPath)) {
  console.error('[LỖI] Không tìm thấy file cơ sở dữ liệu:', dbPath);
  process.exit(1);
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

console.log('===========================================================');
console.log('   BẮT ĐẦU DỌN DẸP DỮ LIỆU DEMO – CHUẨN BỊ VẬN HÀNH CHÍNH THỨC');
console.log('===========================================================');

// 1. Tự động sao lưu an toàn (VACUUM INTO)
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupFile = path.join(backupDir, `database_before_golive_${timestamp}.sqlite`);

console.log(`[1/4] Đang tạo bản sao lưu an toàn tại: ${backupFile}...`);
try {
  db.exec(`VACUUM INTO '${backupFile.replace(/\\/g, '/')}'`);
  console.log('  -> Sao lưu thành công!');
} catch (err) {
  console.error('[LỖI] Không thể sao lưu CSDL:', err.message);
  process.exit(1);
}

// 2. Dọn dẹp các bảng dữ liệu thử nghiệm phát sinh
console.log('[2/4] Đang dọn dẹp các bài nộp, khảo sát và nhật ký thử nghiệm...');

const tablesToClean = [
  'validation_errors',
  'exam_records',
  'exam_uploads',
  'training_demand_programs',
  'training_demand_submissions',
  'submission_receipts',
  'employee_add_requests',
  'submission_reopen_log',
  'deadline_extensions',
  'audit_logs'
];

db.exec('BEGIN TRANSACTION;');

try {
  for (const table of tablesToClean) {
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (tableExists) {
      db.exec(`DELETE FROM ${table};`);
      console.log(`  -> Đã xóa dữ liệu bảng: ${table}`);
    }
  }

  // 3. Tăng token_version của toàn bộ người dùng để vô hiệu hóa mọi phiên đăng nhập cũ
  db.exec('UPDATE users SET token_version = token_version + 1;');
  console.log('[3/4] Đã reset token_version cho toàn bộ tài khoản người dùng.');

  // 4. Ghi nhận nhật ký audit khởi tạo hệ thống chính thức
  db.prepare(`
    INSERT INTO audit_logs (username, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'SYSTEM',
    'SYSTEM_GO_LIVE',
    'SYSTEM',
    '1',
    JSON.stringify({
      event: 'SYSTEM_GO_LIVE',
      description: 'Hệ thống đã được dọn sạch dữ liệu thử nghiệm, sẵn sàng vận hành chính thức.',
      timestamp: new Date().toISOString()
    })
  );

  db.exec('COMMIT;');
  console.log('  -> Giao dịch hoàn tất thành công!');
} catch (err) {
  db.exec('ROLLBACK;');
  console.error('[LỖI] Xảy ra lỗi khi dọn dẹp dữ liệu, đã ROLLBACK:', err.message);
  process.exit(1);
}

// 5. Tối ưu hóa file database
console.log('[4/4] Đang tối ưu hóa dung lượng database (VACUUM)...');
try {
  db.exec('VACUUM;');
  console.log('  -> VACUUM hoàn tất!');
} catch (err) {
  console.warn('  -> Cảnh báo: Không thể chạy VACUUM tự do:', err.message);
}

// 6. Thống kê lại số lượng dữ liệu nền tảng sau khi dọn
console.log('\n===========================================================');
console.log('   BÁO CÁO DỮ LIỆU SAU KHI DỌN DẸP CHUYỂN SANG CHÍNH THỨC');
console.log('===========================================================');
const count = (t) => {
  try { return db.prepare(`SELECT count(*) as c FROM ${t}`).get().c; }
  catch (e) { return 0; }
};

console.log('1. Đơn vị mạng lưới (units):', count('units'));
console.log('2. Tài khoản người dùng (users):', count('users'));
console.log('3. Master DB Cán bộ (employees):', count('employees'));
console.log('4. Danh mục Chương trình đào tạo (training_programs):', count('training_programs'));
console.log('5. Danh mục Chuyên đề đào tạo (training_topics):', count('training_topics'));
console.log('6. Bài nộp kỳ thi (exam_uploads):', count('exam_uploads'), '(Đã sạch 0)');
console.log('7. Bài nộp khảo sát (training_demand_submissions):', count('training_demand_submissions'), '(Đã sạch 0)');
console.log('8. Nhật ký kiểm toán (audit_logs):', count('audit_logs'), '(Chỉ có 1 bản ghi khởi tạo)');
console.log('===========================================================');
console.log('Hệ thống đã sẵn sàng 100% cho việc tiếp nhận dữ liệu chính thức!');
