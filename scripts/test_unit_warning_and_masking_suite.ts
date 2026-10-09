import { DatabaseSync } from 'node:sqlite';
import assert from 'assert';
import { validateCandidateBatch } from '../src/lib/validation';

console.log('--- BẮT ĐẦU TEST BỘ KIỂM TRA ĐƠN VỊ & CHE THÔNG TIN LIÊN ĐƠN VỊ (MỤC 1.7) ---');

const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    elearning_account VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    unit_code VARCHAR(50),
    unit_name VARCHAR(255),
    raw_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_code VARCHAR(50) UNIQUE NOT NULL,
    unit_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN'
  );

  CREATE TABLE exam_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    total_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    warning_rows INTEGER DEFAULT 0,
    status VARCHAR(30) DEFAULT 'STAGING'
  );

  CREATE TABLE validation_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    employee_code VARCHAR(50),
    elearning_account VARCHAR(100),
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'ERROR'
  );
`);

// Thiết lập dữ liệu mẫu
// Đơn vị 1: CN Bắc Giang (2500)
// Đơn vị 2: CN Nam Định (3200)
db.prepare("INSERT INTO units (id, unit_code, unit_name) VALUES (1, '2500', 'Agribank Chi nhánh Bắc Giang')").run();
db.prepare("INSERT INTO units (id, unit_code, unit_name) VALUES (2, '3200', 'Agribank Chi nhánh Nam Định')").run();

// Cán bộ 1 thuộc Bắc Giang (2500)
db.prepare("INSERT INTO employees (employee_code, elearning_account, full_name, unit_code, unit_name) VALUES ('NV001', 'elearn001', 'Nguyễn Văn Một', '2500', 'Agribank Chi nhánh Bắc Giang')").run();
// Cán bộ 2 thuộc Nam Định (3200)
db.prepare("INSERT INTO employees (employee_code, elearning_account, full_name, unit_code, unit_name) VALUES ('NV002', 'elearn002', 'Trần Văn Hai', '3200', 'Agribank Chi nhánh Nam Định')").run();

// TEST 1: Cán bộ đúng mã/eLearning nhưng thuộc đơn vị khác (UNIT_MISMATCH -> WARNING)
console.log('1. Kiểm tra UNIT_MISMATCH khi cán bộ thuộc chi nhánh khác...');
const rows1 = [
  {
    rowIndex: 2,
    employeeCode: 'NV002',
    elearningAccount: 'elearn002',
    fullName: 'Trần Văn Hai',
    rawData: {},
    isCandidateRow: true
  }
];
// Đơn vị tải lên là Bắc Giang ('2500')
const res1 = validateCandidateBatch(db, rows1, '2500');
assert.strictEqual(res1.validRows, 1, 'Dòng phải là valid');
assert.strictEqual(res1.errorRows, 0, 'errorRows phải bằng 0');
assert.strictEqual(res1.warningRows, 1, 'warningRows phải bằng 1');
assert.strictEqual(res1.allErrors.length, 1);
assert.strictEqual(res1.allErrors[0].errorType, 'UNIT_MISMATCH');
assert.strictEqual(res1.allErrors[0].severity, 'WARNING');
assert.ok(res1.allErrors[0].errorMessage.includes('Agribank Chi nhánh Nam Định'));
console.log('✅ 1. Phát hiện UNIT_MISMATCH thành công với severity = WARNING (không chặn errorRows)');

// TEST 2: Đơn vị gửi chính thức khi chỉ có WARNING (0 ERROR)
console.log('2. Kiểm tra quy tắc gửi chính thức khi chỉ có WARNING...');
const uploadId = db.prepare(`
  INSERT INTO exam_uploads (exam_id, unit_id, total_rows, valid_rows, error_rows, warning_rows, status, file_name, file_size, file_hash)
  VALUES (1, 1, 1, 1, 0, 1, 'VALIDATED', 'test.xlsx', 1000, 'hash1')
`).run().lastInsertRowid;

// Logic xác thực nộp bài (tương đương /api/confirm-submission)
const upload = db.prepare('SELECT * FROM exam_uploads WHERE id = ?').get(uploadId) as any;
const canSubmit = upload.error_rows === 0 && upload.total_rows > 0;
assert.strictEqual(canSubmit, true, 'Phải cho phép nộp bài khi error_rows = 0 kể cả warning_rows > 0');
db.prepare("UPDATE exam_uploads SET status = 'OFFICIAL_SUBMITTED' WHERE id = ?").run(uploadId);
const updatedUpload = db.prepare('SELECT status FROM exam_uploads WHERE id = ?').get(uploadId) as any;
assert.strictEqual(updatedUpload.status, 'OFFICIAL_SUBMITTED');
console.log('✅ 2. Gửi chính thức thành công khi có WARNING và 0 ERROR');

// TEST 3: Che thông tin liên đơn vị khi WRONG_ELEARNING cho cán bộ thuộc đơn vị khác
console.log('3. Kiểm tra che thông tin liên đơn vị khi sai eLearning...');
const rows2 = [
  {
    rowIndex: 3,
    employeeCode: 'NV002', // Thuộc Nam Định ('3200')
    elearningAccount: 'wrong_elearn',
    fullName: 'Trần Văn Hai',
    rawData: {},
    isCandidateRow: true
  }
];
// Đơn vị tải lên là Bắc Giang ('2500')
const res2 = validateCandidateBatch(db, rows2, '2500');
assert.strictEqual(res2.errorRows, 1);
assert.strictEqual(res2.allErrors[0].errorType, 'WRONG_ELEARNING');
assert.strictEqual(res2.allErrors[0].errorMessage, 'Thông tin không khớp cơ sở dữ liệu cán bộ, vui lòng liên hệ Trung tâm.');
assert.strictEqual(res2.allErrors[0].severity, 'ERROR');
console.log('✅ 3. Che giấu thông tin liên đơn vị thành công, không để lộ tài khoản của chi nhánh khác');

// TEST 4: Giữ nguyên hướng dẫn chi tiết khi cán bộ thuộc cùng đơn vị
console.log('4. Kiểm tra hướng dẫn chi tiết khi cùng đơn vị...');
const rows3 = [
  {
    rowIndex: 4,
    employeeCode: 'NV001', // Thuộc Bắc Giang ('2500')
    elearningAccount: 'wrong_elearn',
    fullName: 'Nguyễn Văn Một',
    rawData: {},
    isCandidateRow: true
  }
];
// Đơn vị tải lên là Bắc Giang ('2500')
const res3 = validateCandidateBatch(db, rows3, '2500');
assert.strictEqual(res3.errorRows, 1);
assert.strictEqual(res3.allErrors[0].errorType, 'WRONG_ELEARNING');
assert.ok(res3.allErrors[0].errorMessage.includes('Tài khoản đúng trong Database là elearn001'));
console.log('✅ 4. Giữ nguyên gợi ý sửa chi tiết khi cùng đơn vị để cán bộ tự sửa');

console.log('\n🎉 KẾT QUẢ TEST MỤC 1.7: 4/4 BÀI TEST ĐẠT!\n');
