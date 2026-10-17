import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

let dbInstance: DatabaseSync | null = null;

/**
 * Tự động chạy migration schema khi cần thiết.
 * Đảm bảo các cột mới được thêm an toàn (không gây lỗi nếu đã có).
 */
function runSchemaMigrations(db: DatabaseSync): void {
  // Migration 1: training_demand_program_topics (attendees, notes, completed_count)
  try {
    const cols = db.prepare('PRAGMA table_info(training_demand_program_topics)').all() as any[];
    const colNames = cols.map((c: any) => c.name);
    if (!colNames.includes('attendees')) {
      db.exec('ALTER TABLE training_demand_program_topics ADD COLUMN attendees TEXT;');
    }
    if (!colNames.includes('notes')) {
      db.exec('ALTER TABLE training_demand_program_topics ADD COLUMN notes TEXT;');
    }
    if (!colNames.includes('completed_count')) {
      db.exec('ALTER TABLE training_demand_program_topics ADD COLUMN completed_count INTEGER DEFAULT 0;');
      console.log('[DB Migration] Đã thêm cột completed_count (Đã học) vào training_demand_program_topics.');
    }
  } catch (e: any) {
    if (!e.message?.includes('no such table')) {
      console.warn('[DB Migration] Cảnh báo migration training_demand_program_topics:', e.message);
    }
  }

  // Migration 2: training_program_topics (các trường mô tả chi tiết từ Mẫu chuẩn)
  try {
    const tCols = db.prepare('PRAGMA table_info(training_program_topics)').all() as any[];
    const tColNames = tCols.map((c: any) => c.name);

    const newColumns: Record<string, string> = {
      position_code: 'TEXT',
      learning_path: 'TEXT',
      competency: 'TEXT',
      certificate_requirement: 'TEXT',
      cert_planning_higher: 'TEXT',
      cert_appoint_higher: 'TEXT',
      cert_reappoint: 'TEXT'
    };

    for (const [col, type] of Object.entries(newColumns)) {
      if (!tColNames.includes(col)) {
        db.exec(`ALTER TABLE training_program_topics ADD COLUMN ${col} ${type};`);
        console.log(`[DB Migration] Đã thêm cột ${col} vào training_program_topics.`);
      }
    }
  } catch (e: any) {
    if (!e.message?.includes('no such table')) {
      console.warn('[DB Migration] Cảnh báo migration training_program_topics:', e.message);
    }
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
  }
  return dbInstance;
}

export default getDatabase;
