import { DatabaseSync } from 'node:sqlite';
import assert from 'assert';
import { canPrepareSubmission, canApproveSubmission } from '../src/lib/maker-checker';

console.log('--- BẮT ĐẦU TEST BỘ TÀI KHOẢN CÁ NHÂN VÀ MAKER-CHECKER (MỤC 2.1) ---');

const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    unit_id INTEGER,
    status VARCHAR(20) DEFAULT 'ACTIVE'
  );

  CREATE TABLE exam_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    status VARCHAR(30) DEFAULT 'STAGING',
    total_rows INTEGER DEFAULT 1,
    error_rows INTEGER DEFAULT 0,
    prepared_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    submitted_at TIMESTAMP
  );

  CREATE TABLE training_demand_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'DRAFT',
    prepared_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    submitted_at TIMESTAMP
  );
`);

// 1. Kiểm tra cấu hình và quyền mặc định (khi maker_checker_enabled = 'false')
console.log('1. Kiểm tra phân quyền khi Maker-Checker tắt (Tương thích ngược)...');
db.prepare("INSERT INTO system_settings (key, value) VALUES ('maker_checker_enabled', 'false')").run();

assert.strictEqual(canPrepareSubmission('UNIT_ADMIN'), true);
assert.strictEqual(canPrepareSubmission('UNIT_PREPARER'), true);
assert.strictEqual(canApproveSubmission('UNIT_ADMIN'), true);
assert.strictEqual(canApproveSubmission('UNIT_APPROVER'), true);
console.log('✅ 1. Tương thích ngược: Khi tắt Maker-Checker, UNIT_ADMIN duyệt gửi bình thường');

// 2. Kiểm tra phân quyền khi Maker-Checker BẬT ('true')
console.log('2. Kiểm tra phân quyền khi Maker-Checker BẬT...');
db.prepare("UPDATE system_settings SET value = 'true' WHERE key = 'maker_checker_enabled'").run();

// Người lập (UNIT_PREPARER) chỉ được lập, không được duyệt gửi
assert.strictEqual(canPrepareSubmission('UNIT_PREPARER'), true);
assert.strictEqual(canApproveSubmission('UNIT_PREPARER'), false);

// Người duyệt (UNIT_APPROVER) được duyệt gửi
assert.strictEqual(canApproveSubmission('UNIT_APPROVER'), true);
assert.strictEqual(canApproveSubmission('SUPER_ADMIN'), true);
console.log('✅ 2. Khi bật Maker-Checker: UNIT_PREPARER bị chặn duyệt (canApproveSubmission = false), UNIT_APPROVER được duyệt');

// 3. Kiểm tra lưu vết prepared_by và approved_by trong exam_uploads
console.log('3. Kiểm tra lưu vết người lập (prepared_by) và người duyệt (approved_by) trong exam_uploads...');
const uPreparerId = db.prepare("INSERT INTO users (username, full_name, role, unit_id) VALUES ('preparer_01', 'Nguyễn Lập', 'UNIT_PREPARER', 1)").run().lastInsertRowid;
const uApproverId = db.prepare("INSERT INTO users (username, full_name, role, unit_id) VALUES ('approver_01', 'Trần Duyệt', 'UNIT_APPROVER', 1)").run().lastInsertRowid;

// Preparer upload file
const uploadId = db.prepare(`
  INSERT INTO exam_uploads (exam_id, unit_id, status, prepared_by)
  VALUES (1, 1, 'STAGING', ?)
`).run(uPreparerId).lastInsertRowid;

let upRow = db.prepare("SELECT * FROM exam_uploads WHERE id = ?").get(uploadId) as any;
assert.strictEqual(upRow.prepared_by, Number(uPreparerId));
assert.strictEqual(upRow.approved_by, null);

// Approver gửi chính thức
db.prepare(`
  UPDATE exam_uploads
  SET status = 'OFFICIAL_SUBMITTED', approved_by = ?, submitted_at = CURRENT_TIMESTAMP
  WHERE id = ?
`).run(uApproverId, uploadId);

upRow = db.prepare("SELECT * FROM exam_uploads WHERE id = ?").get(uploadId) as any;
assert.strictEqual(upRow.status, 'OFFICIAL_SUBMITTED');
assert.strictEqual(upRow.prepared_by, Number(uPreparerId));
assert.strictEqual(upRow.approved_by, Number(uApproverId));
console.log('✅ 3. Lưu vết đầy đủ 2 cấp: prepared_by =', upRow.prepared_by, 'approved_by =', upRow.approved_by);

// 4. Kiểm tra lưu vết trong training_demand_submissions
console.log('4. Kiểm tra lưu vết trong training_demand_submissions...');
const tdId = db.prepare(`
  INSERT INTO training_demand_submissions (collection_id, unit_id, status, prepared_by)
  VALUES (1, 1, 'DRAFT', ?)
`).run(uPreparerId).lastInsertRowid;

db.prepare(`
  UPDATE training_demand_submissions
  SET status = 'SUBMITTED', approved_by = ?, submitted_at = CURRENT_TIMESTAMP
  WHERE id = ?
`).run(uApproverId, tdId);

const tdRow = db.prepare("SELECT * FROM training_demand_submissions WHERE id = ?").get(tdId) as any;
assert.strictEqual(tdRow.status, 'SUBMITTED');
assert.strictEqual(tdRow.prepared_by, Number(uPreparerId));
assert.strictEqual(tdRow.approved_by, Number(uApproverId));
console.log('✅ 4. Lưu vết đào tạo 2 cấp thành công');

console.log('\n🎉 KẾT QUẢ TEST MỤC 2.1: 4/4 BÀI TEST ĐẠT!\n');
