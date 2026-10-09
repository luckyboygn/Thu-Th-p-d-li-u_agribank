/**
 * MIGRATION 1.6: QUY TRÌNH CÁN BỘ CHƯA CÓ TRONG MASTER DB
 * - Tạo bảng employee_add_requests
 * - Idempotent, tự động sao lưu an toàn CSDL
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'database.sqlite');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

function backupDatabase(db) {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `database_before_emp_requests_migration_${timestamp}.sqlite`);
  console.log(`[Backup] Đang sao lưu CSDL vào: ${backupPath}`);
  
  const escapedPath = backupPath.replace(/'/g, "''");
  try {
    db.exec(`VACUUM INTO '${escapedPath}'`);
    console.log(`[Backup] Sao lưu thành công bằng VACUUM INTO.`);
  } catch (err) {
    console.warn(`[Backup] VACUUM INTO thất bại, sao chép file an toàn: ${err.message}`);
    fs.copyFileSync(DB_PATH, backupPath);
  }
}

function runMigration() {
  console.log('--- KHỞI CHẠY MIGRATION 1.6: TẠO BẢNG EMPLOYEE_ADD_REQUESTS ---');
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Không tìm thấy file CSDL tại ${DB_PATH}`);
    process.exit(1);
  }

  const db = new DatabaseSync(DB_PATH);
  backupDatabase(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_add_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL REFERENCES exams(id),
      unit_id INTEGER NOT NULL REFERENCES units(id),
      employee_code VARCHAR(50) NOT NULL,
      elearning_account VARCHAR(100) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      position VARCHAR(255),
      reason TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING' | 'APPROVED' | 'REJECTED'
      requested_by INTEGER NOT NULL REFERENCES users(id),
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      review_note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_emp_requests_unit ON employee_add_requests(unit_id);
    CREATE INDEX IF NOT EXISTS idx_emp_requests_status ON employee_add_requests(status);
  `);

  console.log('✅ Bảng employee_add_requests đã được tạo thành công.');
  console.log('--- MIGRATION 1.6 HOÀN TẤT THÀNH CÔNG ---');
}

runMigration();
