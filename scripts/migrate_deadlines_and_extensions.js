const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function backupDatabase(db, dbPath) {
  const backupsDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const backupFile = path.join(backupsDir, `database_pre_deadlines_${timestamp}.sqlite`);
  
  try {
    const escaped = backupFile.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}';`);
    console.log(`[BACKUP] Sao lưu database bằng VACUUM INTO -> ${backupFile}`);
  } catch (err) {
    console.warn(`[BACKUP WARNING] VACUUM INTO gặp lỗi: ${err.message}, sao chép file...`);
    fs.copyFileSync(dbPath, backupFile);
    console.log(`[BACKUP] Sao chép file -> ${backupFile}`);
  }
}

function runMigration() {
  const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
  const db = new DatabaseSync(dbPath);

  backupDatabase(db, dbPath);

  // 1. Cập nhật bảng exams: thêm start_at, end_at
  const examCols = db.prepare("PRAGMA table_info(exams);").all();
  if (!examCols.some(c => c.name === 'start_at')) {
    console.log('Thêm start_at vào bảng exams...');
    db.exec("ALTER TABLE exams ADD COLUMN start_at TEXT;");
  }
  if (!examCols.some(c => c.name === 'end_at')) {
    console.log('Thêm end_at vào bảng exams...');
    db.exec("ALTER TABLE exams ADD COLUMN end_at TEXT;");
  }

  // 2. Cập nhật bảng collections: thêm start_at, end_at
  const collCols = db.prepare("PRAGMA table_info(collections);").all();
  if (!collCols.some(c => c.name === 'start_at')) {
    console.log('Thêm start_at vào bảng collections...');
    db.exec("ALTER TABLE collections ADD COLUMN start_at TEXT;");
  }
  if (!collCols.some(c => c.name === 'end_at')) {
    console.log('Thêm end_at vào bảng collections...');
    db.exec("ALTER TABLE collections ADD COLUMN end_at TEXT;");
  }

  // 3. Tạo bảng deadline_extensions
  console.log('Tạo bảng deadline_extensions nếu chưa có...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS deadline_extensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      target_type VARCHAR(20) NOT NULL, -- 'EXAM' | 'COLLECTION'
      target_id INTEGER NOT NULL,
      new_end_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(unit_id, target_type, target_id)
    );
    CREATE INDEX IF NOT EXISTS idx_deadline_ext ON deadline_extensions(unit_id, target_type, target_id);
  `);

  console.log('--- Migration Hạn chót & Gia hạn (1.1) hoàn tất an toàn! ---');
}

runMigration();
