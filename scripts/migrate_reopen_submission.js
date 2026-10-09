/**
 * MIGRATION 1.4: MỞ LẠI / THU HỒI BÀI NỘP (SUBMISSION REOPEN LOG)
 * Idempotent, an toàn khi WAL mode, tự động sao lưu trước khi thực thi.
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
  const backupPath = path.join(BACKUP_DIR, `database_before_reopen_migration_${timestamp}.sqlite`);
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
  console.log('--- KHỞI CHẠY MIGRATION 1.4: TẠO BẢNG SUBMISSION_REOPEN_LOG ---');
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Không tìm thấy file CSDL tại ${DB_PATH}`);
    process.exit(1);
  }

  const db = new DatabaseSync(DB_PATH);
  backupDatabase(db);

  // 1. Tạo bảng submission_reopen_log
  db.exec(`
    CREATE TABLE IF NOT EXISTS submission_reopen_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL, -- 'EXAM_UPLOAD' | 'TRAINING_DEMAND'
      target_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL REFERENCES units(id),
      reopened_by INTEGER NOT NULL REFERENCES users(id),
      reopened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reason TEXT NOT NULL
    );
  `);
  console.log('✅ Bảng submission_reopen_log đã sẵn sàng.');

  console.log('--- MIGRATION 1.4 HOÀN TẤT THÀNH CÔNG ---');
}

runMigration();
