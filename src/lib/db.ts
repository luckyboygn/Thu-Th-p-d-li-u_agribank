import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

let dbInstance: DatabaseSync | null = null;

/**
 * Hàm trợ giúp thêm cột an toàn nếu chưa tồn tại.
 */
function addColumnIfNotExists(db: DatabaseSync, tableName: string, columnName: string, columnDef: string): void {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
    const colNames = cols.map((c: any) => c.name);
    if (!colNames.includes(columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`);
      console.log(`[DB Migration] Đã thêm cột ${columnName} vào bảng ${tableName}.`);
    }
  } catch (e: any) {
    if (!e.message?.includes('no such table')) {
      console.warn(`[DB Migration] Cảnh báo khi thêm cột ${columnName} vào ${tableName}:`, e.message);
    }
  }
}

/**
 * Tự động chạy migration schema khi cần thiết.
 * Đảm bảo các cột mới được thêm an toàn (không gây lỗi nếu đã có).
 */
function runSchemaMigrations(db: DatabaseSync): void {
  // 1. Bảng exams (task_type, start_at, end_at)
  addColumnIfNotExists(db, 'exams', 'task_type', "VARCHAR(50) DEFAULT 'CANDIDATE_EXAM'");
  addColumnIfNotExists(db, 'exams', 'start_at', 'TEXT');
  addColumnIfNotExists(db, 'exams', 'end_at', 'TEXT');

  // Chuẩn hóa task_type cho bảng exams
  try {
    db.exec(`
      UPDATE exams
      SET task_type = 'TRAINING_DEMAND'
      WHERE LOWER(title) LIKE '%khảo sát%'
         OR LOWER(title) LIKE '%đào tạo%'
         OR LOWER(title) LIKE '%nhu cầu%'
         OR LOWER(code) LIKE 'ks%'
         OR LOWER(code) LIKE '%training%';
    `);
  } catch (e: any) {
    // Bỏ qua nếu bảng chưa có
  }

  // 2. Bảng collections (task_type, start_at, end_at)
  addColumnIfNotExists(db, 'collections', 'task_type', "VARCHAR(50) DEFAULT 'TRAINING_DEMAND'");
  addColumnIfNotExists(db, 'collections', 'start_at', 'TEXT');
  addColumnIfNotExists(db, 'collections', 'end_at', 'TEXT');

  // 3. Bảng training_demand_program_topics (attendees, notes, completed_count)
  addColumnIfNotExists(db, 'training_demand_program_topics', 'attendees', 'TEXT');
  addColumnIfNotExists(db, 'training_demand_program_topics', 'notes', 'TEXT');
  addColumnIfNotExists(db, 'training_demand_program_topics', 'completed_count', 'INTEGER DEFAULT 0');

  // 4. Bảng training_program_topics (các trường mô tả chi tiết từ Mẫu chuẩn Mẫu 04 & Mẫu 05)
  const topicColumns: Record<string, string> = {
    position_code: 'TEXT',
    learning_path: 'TEXT',
    competency: 'TEXT',
    certificate_requirement: 'TEXT',
    cert_planning_higher: 'TEXT',
    cert_appoint_higher: 'TEXT',
    cert_reappoint: 'TEXT',
    target_audience: 'TEXT',
    expected_content: 'TEXT',
    instructor: 'TEXT',
    target_goal: 'TEXT',
    proposal_basis: 'TEXT'
  };
  for (const [col, type] of Object.entries(topicColumns)) {
    addColumnIfNotExists(db, 'training_program_topics', col, type);
  }

  // 4b. Bảng training_demand_proposals (các trường theo Mẫu số 06: hình thức đào tạo, nguồn giảng viên/câu hỏi, canonical_id)
  addColumnIfNotExists(db, 'training_demand_proposals', 'delivery_method', 'TEXT');
  addColumnIfNotExists(db, 'training_demand_proposals', 'faculty_source', 'TEXT');
  addColumnIfNotExists(db, 'training_demand_proposals', 'canonical_id', 'INTEGER');

  // 4c. Bảng training_proposal_canonical (Chuẩn hóa đề xuất ngoài khung Mẫu 06)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS training_proposal_canonical (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_proposals_canonical ON training_demand_proposals(canonical_id);
    `);
  } catch (e) {}

  // 5. Bảng training_programs (category_type)
  addColumnIfNotExists(db, 'training_programs', 'category_type', "VARCHAR(50) DEFAULT 'TRONG_KHUNG'");

  // 6. Bảng units (unit_type, region, parent_unit_id, user_account)
  addColumnIfNotExists(db, 'units', 'unit_type', "VARCHAR(50) DEFAULT 'BRANCH_L1'");
  addColumnIfNotExists(db, 'units', 'region', "VARCHAR(50) DEFAULT 'MIEN_BAC'");
  addColumnIfNotExists(db, 'units', 'parent_unit_id', 'INTEGER');
  addColumnIfNotExists(db, 'units', 'user_account', 'TEXT');

  // 7. Bảng exam_uploads & exam_records & training_demand_submissions
  addColumnIfNotExists(db, 'exam_uploads', 'receipt_code', 'VARCHAR(64)');
  addColumnIfNotExists(db, 'exam_uploads', 'warning_rows', 'INTEGER DEFAULT 0');
  addColumnIfNotExists(db, 'exam_uploads', 'prepared_by', 'INTEGER');
  addColumnIfNotExists(db, 'exam_uploads', 'approved_by', 'INTEGER');
  addColumnIfNotExists(db, 'exam_uploads', 'parse_report', 'TEXT');
  addColumnIfNotExists(db, 'exam_records', 'sheet_name', "VARCHAR(100) DEFAULT 'Sheet1'");
  addColumnIfNotExists(db, 'exam_records', 'employee_id', 'INTEGER');
  addColumnIfNotExists(db, 'exam_records', 'unit_code_at_validation', 'VARCHAR(50)');

  // Index hỗ trợ đối soát hiệu năng cao
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_exam_records_employee_id ON exam_records(employee_id);');
  } catch (e) {}

  addColumnIfNotExists(db, 'training_demand_submissions', 'receipt_code', 'VARCHAR(64)');
  addColumnIfNotExists(db, 'training_demand_submissions', 'prepared_by', 'INTEGER');
  addColumnIfNotExists(db, 'training_demand_submissions', 'approved_by', 'INTEGER');

  // 8. Bảng training_demand_programs (notes)
  addColumnIfNotExists(db, 'training_demand_programs', 'notes', 'TEXT');

  // 9. Bảng users (token_version, password policy)
  addColumnIfNotExists(db, 'users', 'token_version', 'INTEGER DEFAULT 1');
  addColumnIfNotExists(db, 'users', 'must_change_password', 'INTEGER DEFAULT 0');
  addColumnIfNotExists(db, 'users', 'failed_attempts', 'INTEGER DEFAULT 0');
  addColumnIfNotExists(db, 'users', 'locked_until', 'TEXT');
  addColumnIfNotExists(db, 'users', 'password_changed_at', 'TEXT');

  // 10. Bảng audit_logs & validation_errors
  addColumnIfNotExists(db, 'audit_logs', 'entity_type', 'VARCHAR(50)');
  addColumnIfNotExists(db, 'audit_logs', 'entity_id', 'VARCHAR(100)');
  addColumnIfNotExists(db, 'validation_errors', 'severity', "VARCHAR(20) DEFAULT 'ERROR'");

  // 11. Bảng system_settings & Đồng bộ nhiệm vụ chiến dịch mặc định về TRAINING_DEMAND
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'active_campaign_task'").get() as any;
    if (!setting || setting.value === 'CANDIDATE_EXAM') {
      db.prepare(`
        INSERT INTO system_settings (key, value, description, updated_at)
        VALUES ('active_campaign_task', 'TRAINING_DEMAND', 'Nhiệm vụ trọng tâm đợt này (CANDIDATE_EXAM, TRAINING_DEMAND, BOTH, AUTO)', CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = 'TRAINING_DEMAND', updated_at = CURRENT_TIMESTAMP
      `).run();
      console.log('[DB Migration] Đã đồng bộ active_campaign_task về TRAINING_DEMAND.');
    }
  } catch (e: any) {
    console.warn('[DB Migration] Cảnh báo migration system_settings:', e.message);
  }
}

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'database.sqlite');
    dbInstance = new DatabaseSync(dbPath);

    // Bật WAL mode & synchronous = NORMAL để tăng tốc độ ghi/đọc song song
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA synchronous = NORMAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');

    // Tự động migration schema khi cần
    runSchemaMigrations(dbInstance);

    // Tự động kiểm tra và đồng bộ chi tiết 818 chuyên đề chuẩn Agribank nếu dữ liệu bị thiếu
    try {
      const { ensureMasterCatalogSynced } = require('./catalog-master-sync');
      ensureMasterCatalogSynced(dbInstance);
    } catch (e: any) {
      console.warn('[DB Init] Không thể tự động kiểm tra catalog sync:', e.message);
    }

    // Tự động kiểm tra và đồng bộ 48 đơn vị/Ban Trụ sở chính & tài khoản nếu bị thiếu (kể cả sau khi kéo DB từ Cloud)
    try {
      const { ensureHeadOfficeUnitsSynced } = require('./head-office-units-sync');
      const added = ensureHeadOfficeUnitsSynced(dbInstance);
      if (added) {
        try {
          const { triggerCloudSync } = require('./cloud-sync');
          triggerCloudSync().catch(() => {});
        } catch {}
      }
    } catch (e: any) {
      console.warn('[DB Init] Không thể tự động kiểm tra head office units sync:', e.message);
    }
  }
  return dbInstance;
}

export default getDatabase;
