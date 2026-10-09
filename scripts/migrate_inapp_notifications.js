const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function runMigration() {
  console.log('[MIGRATION 2.6] Bắt đầu migration Hệ Thống Thông Báo Trong Ứng Dụng (In-app Notifications)...');

  const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupPath = path.join(backupDir, `pre_notifications_backup_${timestamp}.sqlite`);

  const db = new DatabaseSync(dbPath);

  try {
    // 1. Sao lưu an toàn CSDL
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    console.log(`[MIGRATION 2.6] Sao lưu an toàn CSDL tại: ${backupPath}`);
  } catch (err) {
    console.warn('[MIGRATION 2.6] Cảnh báo sao lưu:', err.message);
  }

  // 2. Tạo bảng notifications
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_user_id INTEGER REFERENCES users(id),
      recipient_unit_id INTEGER REFERENCES units(id),
      recipient_role VARCHAR(50), -- 'SUPER_ADMIN' | 'UNIT_ADMIN' | 'UNIT_PREPARER' | 'UNIT_APPROVER'
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      type VARCHAR(50) NOT NULL, -- 'DEADLINE_WARNING' | 'SUBMISSION_REOPENED' | 'REQUEST_STATUS_UPDATED' | 'NEW_EMPLOYEE_REQUEST' | 'SYSTEM'
      link VARCHAR(255),
      is_read BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(recipient_user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_unit ON notifications(recipient_unit_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(recipient_role);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
  `);
  console.log('[MIGRATION 2.6] Bảng notifications và các chỉ mục đã sẵn sàng.');

  console.log('[MIGRATION 2.6] Hoàn thành migration Mục 2.6 thành công 100%!');
}

runMigration();
