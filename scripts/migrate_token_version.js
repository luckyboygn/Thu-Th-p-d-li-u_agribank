const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function backupDatabase(db, dbPath) {
  const backupsDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const backupFile = path.join(backupsDir, `database_pre_part0_${timestamp}.sqlite`);
  
  try {
    const escaped = backupFile.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}';`);
    console.log(`[BACKUP] Sao lưu database an toàn bằng VACUUM INTO -> ${backupFile}`);
  } catch (err) {
    console.warn(`[BACKUP WARNING] VACUUM INTO gặp lỗi, sao chép file an toàn: ${err.message}`);
    fs.copyFileSync(dbPath, backupFile);
    console.log(`[BACKUP] Đã sao chép an toàn file database -> ${backupFile}`);
  }
}

function runMigration() {
  const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
  if (!fs.existsSync(dbPath)) {
    console.error(`Không tìm thấy CSDL tại: ${dbPath}`);
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  backupDatabase(db, dbPath);

  // Kiểm tra cột token_version trong users
  const userCols = db.prepare("PRAGMA table_info(users);").all();
  const hasTokenVersion = userCols.some(c => c.name === 'token_version');

  if (!hasTokenVersion) {
    console.log('Thêm cột token_version vào bảng users...');
    db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1;");
    console.log('Đã thêm cột token_version thành công.');
  } else {
    console.log('Cột token_version đã tồn tại trong users. Bỏ qua.');
  }

  // Đảm bảo tất cả user hiện tại có token_version >= 1
  db.exec("UPDATE users SET token_version = 1 WHERE token_version IS NULL;");

  console.log('--- Migration Part 0 hoàn tất an toàn! ---');
}

runMigration();
