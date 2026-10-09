const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function runMigration() {
  const dbPath = path.join(__dirname, '../data/database.sqlite');
  const backupDir = path.join(__dirname, '../backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const backupPath = path.join(backupDir, `pre_receipts_backup_${timestamp}.sqlite`);

  console.log(`[MIGRATION 2.2] Bắt đầu migration Biên nhận khi nộp (Submission Receipts)...`);
  const db = new DatabaseSync(dbPath);

  try {
    const escapedBackupPath = backupPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedBackupPath}'`);
    console.log(`[MIGRATION 2.2] Sao lưu an toàn CSDL tại: ${backupPath}`);
  } catch (err) {
    console.warn(`[MIGRATION 2.2] Cảnh báo sao lưu:`, err.message);
  }

  // 1. Tạo bảng submission_receipts nếu chưa có
  db.exec(`
    CREATE TABLE IF NOT EXISTS submission_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_code VARCHAR(64) UNIQUE NOT NULL,
      target_type VARCHAR(30) NOT NULL, -- 'EXAM_UPLOAD' | 'TRAINING_DEMAND'
      target_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL REFERENCES units(id),
      submitted_by INTEGER NOT NULL REFERENCES users(id),
      approved_by INTEGER REFERENCES users(id),
      total_records INTEGER DEFAULT 0,
      metadata TEXT, -- JSON lưu chi tiết: unit_code, unit_name, title, checksum...
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log(`[MIGRATION 2.2] Bảng submission_receipts đã sẵn sàng.`);

  // 2. Thêm receipt_code vào exam_uploads nếu chưa có
  const uploadCols = db.prepare("PRAGMA table_info(exam_uploads)").all();
  if (!uploadCols.some(c => c.name === 'receipt_code')) {
    db.exec("ALTER TABLE exam_uploads ADD COLUMN receipt_code VARCHAR(64);");
    console.log(`[MIGRATION 2.2] Đã thêm cột receipt_code vào exam_uploads.`);
  }

  // 3. Thêm receipt_code vào training_demand_submissions nếu chưa có
  const trainingCols = db.prepare("PRAGMA table_info(training_demand_submissions)").all();
  if (!trainingCols.some(c => c.name === 'receipt_code')) {
    db.exec("ALTER TABLE training_demand_submissions ADD COLUMN receipt_code VARCHAR(64);");
    console.log(`[MIGRATION 2.2] Đã thêm cột receipt_code vào training_demand_submissions.`);
  }

  console.log(`[MIGRATION 2.2] Hoàn thành migration Mục 2.2 thành công 100%!`);
  db.close();
}

runMigration();
