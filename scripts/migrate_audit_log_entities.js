const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function runMigration() {
  console.log('[MIGRATION 2.5] Bắt đầu migration Bổ sung Entity Type & Entity ID cho Audit Logs...');

  const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupPath = path.join(backupDir, `pre_audit_entities_backup_${timestamp}.sqlite`);

  const db = new DatabaseSync(dbPath);

  try {
    // 1. Sao lưu an toàn CSDL
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    console.log(`[MIGRATION 2.5] Sao lưu an toàn CSDL tại: ${backupPath}`);
  } catch (err) {
    console.warn('[MIGRATION 2.5] Cảnh báo sao lưu:', err.message);
  }

  // 2. Thêm cột entity_type, entity_id vào audit_logs nếu chưa có
  const tableInfo = db.prepare('PRAGMA table_info(audit_logs)').all();
  const existingCols = new Set(tableInfo.map(c => c.name));

  if (!existingCols.has('entity_type')) {
    db.exec('ALTER TABLE audit_logs ADD COLUMN entity_type VARCHAR(50);');
    console.log('[MIGRATION 2.5] Đã thêm cột entity_type vào bảng audit_logs.');
  }

  if (!existingCols.has('entity_id')) {
    db.exec('ALTER TABLE audit_logs ADD COLUMN entity_id VARCHAR(100);');
    console.log('[MIGRATION 2.5] Đã thêm cột entity_id vào bảng audit_logs.');
  }

  // 3. Tạo các index tối ưu hóa tìm kiếm
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_unit_id ON audit_logs(unit_id);
  `);
  console.log('[MIGRATION 2.5] Đã tạo các chỉ mục tìm kiếm tối ưu cho audit_logs.');

  console.log('[MIGRATION 2.5] Hoàn thành migration Mục 2.5 thành công 100%!');
}

runMigration();
