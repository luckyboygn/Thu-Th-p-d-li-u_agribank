const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function backupDatabase(db, dbPath) {
  const backupsDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const backupFile = path.join(backupsDir, `database_pre_pwdpolicy_${timestamp}.sqlite`);
  
  try {
    const escaped = backupFile.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}';`);
    console.log(`[BACKUP] Sao lưu database bằng VACUUM INTO -> ${backupFile}`);
  } catch (err) {
    console.warn(`[BACKUP WARNING] VACUUM INTO lỗi: ${err.message}, sao chép file...`);
    fs.copyFileSync(dbPath, backupFile);
    console.log(`[BACKUP] Sao chép file an toàn -> ${backupFile}`);
  }
}

function runMigration() {
  const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
  const db = new DatabaseSync(dbPath);

  backupDatabase(db, dbPath);

  const cols = db.prepare("PRAGMA table_info(users);").all();

  if (!cols.some(c => c.name === 'must_change_password')) {
    console.log('Thêm must_change_password vào bảng users...');
    db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0;");
  }

  if (!cols.some(c => c.name === 'failed_attempts')) {
    console.log('Thêm failed_attempts vào bảng users...');
    db.exec("ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0;");
  }

  if (!cols.some(c => c.name === 'locked_until')) {
    console.log('Thêm locked_until vào bảng users...');
    db.exec("ALTER TABLE users ADD COLUMN locked_until TEXT;");
  }

  if (!cols.some(c => c.name === 'password_changed_at')) {
    console.log('Thêm password_changed_at vào bảng users...');
    db.exec("ALTER TABLE users ADD COLUMN password_changed_at TEXT;");
    db.exec("UPDATE users SET password_changed_at = CURRENT_TIMESTAMP WHERE password_changed_at IS NULL;");
  }

  console.log('--- Migration Chính sách mật khẩu (1.3) hoàn tất an toàn! ---');
}

runMigration();
