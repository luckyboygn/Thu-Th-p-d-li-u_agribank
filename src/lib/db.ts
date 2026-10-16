import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

let dbInstance: DatabaseSync | null = null;

/**
 * Tự động chạy migration schema khi cần thiết.
 * Đảm bảo các cột mới được thêm an toàn (không gây lỗi nếu đã có).
 */
function runSchemaMigrations(db: DatabaseSync): void {
  // Migration: Thêm cột attendees vào training_demand_program_topics (nếu chưa có)
  try {
    const cols = db.prepare('PRAGMA table_info(training_demand_program_topics)').all() as any[];
    const colNames = cols.map((c: any) => c.name);
    if (!colNames.includes('attendees')) {
      db.exec('ALTER TABLE training_demand_program_topics ADD COLUMN attendees TEXT;');
      console.log('[DB Migration] Đã thêm cột attendees vào training_demand_program_topics.');
    }
    if (!colNames.includes('notes')) {
      db.exec('ALTER TABLE training_demand_program_topics ADD COLUMN notes TEXT;');
      console.log('[DB Migration] Đã thêm cột notes vào training_demand_program_topics.');
    }
  } catch (e: any) {
    // Bỏ qua lỗi nếu bảng chưa tồn tại (hệ thống chưa init)
    if (!e.message?.includes('no such table')) {
      console.warn('[DB Migration] Cảnh báo migration training_demand_program_topics:', e.message);
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
  }
  return dbInstance;
}

export default getDatabase;
