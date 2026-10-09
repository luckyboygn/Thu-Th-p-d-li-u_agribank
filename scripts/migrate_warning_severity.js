const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function runMigration() {
  const dbPath = path.join(__dirname, '../data/database.sqlite');
  const backupDir = path.join(__dirname, '../backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Sao lưu an toàn trước khi chạy migration
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const backupPath = path.join(backupDir, `pre_warning_severity_backup_${timestamp}.sqlite`);

  console.log(`[MIGRATION 1.7] Bắt đầu migration Thêm WARNING và Warning Rows...`);
  const db = new DatabaseSync(dbPath);

  try {
    const escapedBackupPath = backupPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedBackupPath}'`);
    console.log(`[MIGRATION 1.7] Sao lưu an toàn CSDL tại: ${backupPath}`);
  } catch (err) {
    console.warn(`[MIGRATION 1.7] Cảnh báo sao lưu:`, err.message);
  }

  // 1. Thêm severity vào validation_errors (nếu chưa có)
  const valErrorsCols = db.prepare("PRAGMA table_info(validation_errors)").all();
  const hasSeverity = valErrorsCols.some(c => c.name === 'severity');
  if (!hasSeverity) {
    console.log(`[MIGRATION 1.7] Thêm cột 'severity' vào bảng validation_errors...`);
    db.exec(`ALTER TABLE validation_errors ADD COLUMN severity VARCHAR(20) DEFAULT 'ERROR';`);
  } else {
    console.log(`[MIGRATION 1.7] Cột 'severity' đã tồn tại trong validation_errors.`);
  }

  // 2. Thêm warning_rows vào exam_uploads (nếu chưa có)
  const examUploadsCols = db.prepare("PRAGMA table_info(exam_uploads)").all();
  const hasWarningRows = examUploadsCols.some(c => c.name === 'warning_rows');
  if (!hasWarningRows) {
    console.log(`[MIGRATION 1.7] Thêm cột 'warning_rows' vào bảng exam_uploads...`);
    db.exec(`ALTER TABLE exam_uploads ADD COLUMN warning_rows INTEGER DEFAULT 0;`);
  } else {
    console.log(`[MIGRATION 1.7] Cột 'warning_rows' đã tồn tại trong exam_uploads.`);
  }

  console.log(`[MIGRATION 1.7] Migration hoàn tất thành công 100%!`);
  db.close();
}

runMigration();
