const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function runMigration() {
  console.log('[MIGRATION 2.4] Bắt đầu migration Vòng đời Master DB & Lịch sử biến động nhân sự...');

  const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupPath = path.join(backupDir, `pre_employee_lifecycle_backup_${timestamp}.sqlite`);

  const db = new DatabaseSync(dbPath);

  try {
    // 1. Sao lưu an toàn CSDL
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    console.log(`[MIGRATION 2.4] Sao lưu an toàn CSDL tại: ${backupPath}`);
  } catch (err) {
    console.warn('[MIGRATION 2.4] Cảnh báo sao lưu:', err.message);
  }

  // 2. Thêm cột status vào bảng employees nếu chưa có
  const tableInfo = db.prepare('PRAGMA table_info(employees)').all();
  const existingCols = new Set(tableInfo.map(c => c.name));

  if (!existingCols.has('status')) {
    db.exec("ALTER TABLE employees ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE';");
    console.log('[MIGRATION 2.4] Đã thêm cột status vào bảng employees.');
  }

  // 3. Tạo bảng employee_history
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      employee_code VARCHAR(50) NOT NULL,
      action_type VARCHAR(50) NOT NULL, -- 'CREATED' | 'UPDATED' | 'DEACTIVATED' | 'REACTIVATED'
      old_values TEXT,
      new_values TEXT,
      changed_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_emp_history_code ON employee_history(employee_code);
    CREATE INDEX IF NOT EXISTS idx_emp_history_emp_id ON employee_history(employee_id);
  `);
  console.log('[MIGRATION 2.4] Bảng employee_history đã sẵn sàng.');

  // 4. Cấu hình inactive_employee_severity trong system_settings (key, value)
  const existingSetting = db.prepare('SELECT key FROM system_settings WHERE key = ?').get('inactive_employee_severity');
  if (!existingSetting) {
    db.prepare(`
      INSERT INTO system_settings (key, value, description)
      VALUES (?, ?, ?)
    `).run('inactive_employee_severity', 'WARNING', 'Mức độ cảnh báo khi thí sinh thuộc diện cán bộ ngừng hoạt động (WARNING hoặc ERROR)');
    console.log('[MIGRATION 2.4] Đã tạo cấu hình inactive_employee_severity (mặc định WARNING).');
  }

  console.log('[MIGRATION 2.4] Hoàn thành migration Mục 2.4 thành công 100%!');
}

runMigration();
