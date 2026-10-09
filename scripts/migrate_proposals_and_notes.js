const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function runMigration() {
  console.log('[MIGRATION 2.8] Bắt đầu migration Ghi chú & Đề xuất Ngoài Khung (training_demand_proposals)...');

  const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupPath = path.join(backupDir, `pre_proposals_backup_${timestamp}.sqlite`);

  const db = new DatabaseSync(dbPath);

  try {
    // 1. Sao lưu an toàn CSDL
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    console.log(`[MIGRATION 2.8] Sao lưu an toàn CSDL tại: ${backupPath}`);
  } catch (err) {
    console.warn('[MIGRATION 2.8] Cảnh báo sao lưu:', err.message);
  }

  // 2. Thêm cột notes vào training_demand_programs nếu chưa có
  const tableInfo = db.prepare('PRAGMA table_info(training_demand_programs)').all();
  const existingCols = new Set(tableInfo.map(c => c.name));

  if (!existingCols.has('notes')) {
    db.exec('ALTER TABLE training_demand_programs ADD COLUMN notes TEXT;');
    console.log('[MIGRATION 2.8] Đã thêm cột notes vào bảng training_demand_programs.');
  }

  // 3. Tạo bảng training_demand_proposals
  db.exec(`
    CREATE TABLE IF NOT EXISTS training_demand_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES training_demand_submissions(id) ON DELETE CASCADE,
      proposal_name VARCHAR(255) NOT NULL,
      target_audience VARCHAR(255),
      participant_count INTEGER NOT NULL DEFAULT 1,
      expected_duration VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_proposals_sub ON training_demand_proposals(submission_id);
  `);
  console.log('[MIGRATION 2.8] Bảng training_demand_proposals và chỉ mục đã sẵn sàng.');

  console.log('[MIGRATION 2.8] Hoàn thành migration Mục 2.8 thành công 100%!');
}

runMigration();
