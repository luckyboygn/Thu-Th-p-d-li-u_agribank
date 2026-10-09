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
  const backupPath = path.join(backupDir, `pre_maker_checker_backup_${timestamp}.sqlite`);

  console.log(`[MIGRATION 2.1] Bắt đầu migration Tài khoản cá nhân và Maker-Checker...`);
  const db = new DatabaseSync(dbPath);

  try {
    const escapedBackupPath = backupPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedBackupPath}'`);
    console.log(`[MIGRATION 2.1] Sao lưu an toàn CSDL tại: ${backupPath}`);
  } catch (err) {
    console.warn(`[MIGRATION 2.1] Cảnh báo sao lưu:`, err.message);
  }

  // 1. Tạo bảng system_settings nếu chưa có
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Thiết lập mặc định cho maker_checker_enabled = 'false'
  const existingMc = db.prepare("SELECT value FROM system_settings WHERE key = 'maker_checker_enabled'").get();
  if (!existingMc) {
    db.prepare("INSERT INTO system_settings (key, value, description) VALUES ('maker_checker_enabled', 'false', 'Bật/tắt quy trình duyệt hai cấp Maker-Checker tại đơn vị')").run();
    console.log(`[MIGRATION 2.1] Khởi tạo cấu hình maker_checker_enabled = 'false'.`);
  }

  // 2. Thêm prepared_by, approved_by vào exam_uploads
  const uploadCols = db.prepare("PRAGMA table_info(exam_uploads)").all();
  if (!uploadCols.some(c => c.name === 'prepared_by')) {
    db.exec("ALTER TABLE exam_uploads ADD COLUMN prepared_by INTEGER REFERENCES users(id);");
    console.log(`[MIGRATION 2.1] Đã thêm cột prepared_by vào exam_uploads.`);
  }
  if (!uploadCols.some(c => c.name === 'approved_by')) {
    db.exec("ALTER TABLE exam_uploads ADD COLUMN approved_by INTEGER REFERENCES users(id);");
    console.log(`[MIGRATION 2.1] Đã thêm cột approved_by vào exam_uploads.`);
  }

  // 3. Thêm prepared_by, approved_by vào training_demand_submissions
  const trainingCols = db.prepare("PRAGMA table_info(training_demand_submissions)").all();
  if (!trainingCols.some(c => c.name === 'prepared_by')) {
    db.exec("ALTER TABLE training_demand_submissions ADD COLUMN prepared_by INTEGER REFERENCES users(id);");
    console.log(`[MIGRATION 2.1] Đã thêm cột prepared_by vào training_demand_submissions.`);
  }
  if (!trainingCols.some(c => c.name === 'approved_by')) {
    db.exec("ALTER TABLE training_demand_submissions ADD COLUMN approved_by INTEGER REFERENCES users(id);");
    console.log(`[MIGRATION 2.1] Đã thêm cột approved_by vào training_demand_submissions.`);
  }

  console.log(`[MIGRATION 2.1] Hoàn thành migration Mục 2.1 thành công 100%!`);
  db.close();
}

runMigration();
