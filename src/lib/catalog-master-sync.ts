import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

export interface MasterTopicRecord {
  progCode: string;
  progName: string;
  stt: number | null;
  positionCode: string;
  topicName: string;
  deliveryMethod: string;
  duration: string;
  learningPath: string;
  competency: string;
  certificateRequirement: string;
  certPlanningHigher: string;
  certAppointHigher: string;
  certReappoint: string;
}

function normalize(s: string): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Đọc 818 chuyên đề chuẩn Agribank từ file JSON tích hợp
 */
export function getMasterTopics(): MasterTopicRecord[] {
  const jsonPath = path.join(process.cwd(), 'src', 'lib', 'master-topics-data.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf8');
      return JSON.parse(content) as MasterTopicRecord[];
    } catch (e: any) {
      console.error('[Catalog Master Sync] Lỗi đọc master-topics-data.json:', e.message);
    }
  }
  return [];
}

/**
 * Đồng bộ toàn bộ 818 chuyên đề cùng các trường mô tả chi tiết vào CSDL SQLite
 */
export function syncMasterTopicsToDatabase(db: DatabaseSync): { updated: number; total: number } {
  const masterTopics = getMasterTopics();
  if (!masterTopics || masterTopics.length === 0) {
    console.warn('[Catalog Master Sync] Không tìm thấy danh sách master topics để đồng bộ.');
    return { updated: 0, total: 0 };
  }

  // Lấy toàn bộ danh sách chương trình và chuyên đề hiện có trong DB
  const programs = db.prepare('SELECT id, code, name FROM training_programs').all() as any[];
  const dbTopics = db.prepare(`
    SELECT t.id, t.program_id, t.topic_name, p.code as prog_code
    FROM training_program_topics t
    JOIN training_programs p ON t.program_id = p.id
  `).all() as any[];

  // Tạo map tra cứu nhanh chuyên đề theo (normProgCode, normTopicName)
  const topicMap = new Map<string, any[]>();
  for (const dt of dbTopics) {
    const key = `${normalize(dt.prog_code)}||${normalize(dt.topic_name)}`;
    if (!topicMap.has(key)) topicMap.set(key, []);
    topicMap.get(key)!.push(dt);

    // Cũng lưu key chỉ theo topic_name để fallback
    const tKey = normalize(dt.topic_name);
    if (!topicMap.has(tKey)) topicMap.set(tKey, []);
    topicMap.get(tKey)!.push(dt);
  }

  const updateStmt = db.prepare(`
    UPDATE training_program_topics
    SET position_code = ?,
        delivery_method = ?,
        duration = ?,
        learning_path = ?,
        competency = ?,
        certificate_requirement = ?,
        cert_planning_higher = ?,
        cert_appoint_higher = ?,
        cert_reappoint = ?
    WHERE id = ?
  `);

  let updatedCount = 0;

  for (const mt of masterTopics) {
    const normCode = normalize(mt.progCode);
    const normTopic = normalize(mt.topicName);

    // 1. Thử khớp chính xác cả khung chương trình và tên chuyên đề
    let matchedTopic: any = null;
    const exactList = topicMap.get(`pl_${normCode}||${normTopic}`) || 
                      topicMap.get(`${normCode}||${normTopic}`);

    if (exactList && exactList.length > 0) {
      matchedTopic = exactList[0];
    } else {
      // 2. Thử khớp theo tên chuyên đề
      const fallbackList = topicMap.get(normTopic);
      if (fallbackList && fallbackList.length > 0) {
        matchedTopic = fallbackList.find(t => t.prog_code.includes(mt.progCode)) || fallbackList[0];
      }
    }

    if (matchedTopic) {
      updateStmt.run(
        mt.positionCode || '',
        mt.deliveryMethod || '',
        mt.duration || '',
        mt.learningPath || '',
        mt.competency || '',
        mt.certificateRequirement || '',
        mt.certPlanningHigher || '',
        mt.certAppointHigher || '',
        mt.certReappoint || '',
        matchedTopic.id
      );
      updatedCount++;
    }
  }

  console.log(`[Catalog Master Sync] ✅ Đã đồng bộ chi tiết ${updatedCount}/${masterTopics.length} chuyên đề chuẩn Agribank.`);
  return { updated: updatedCount, total: masterTopics.length };
}

/**
 * Kiểm tra và tự động đồng bộ nếu dữ liệu trong DB bị thiếu hoặc rỗng
 */
export function ensureMasterCatalogSynced(db: DatabaseSync, force = false): void {
  try {
    if (!force) {
      // Đếm số chuyên đề có đầy đủ lộ trình đào tạo
      const row = db.prepare(`
        SELECT count(*) as cnt 
        FROM training_program_topics 
        WHERE position_code IS NOT NULL AND position_code != '' 
          AND learning_path IS NOT NULL AND learning_path != ''
      `).get() as any;

      if (row && row.cnt >= 700) {
        // Đã đồng bộ đầy đủ, không cần chạy lại
        return;
      }
    }

    console.log('[Catalog Master Sync] Phát hiện dữ liệu chuyên đề chưa đầy đủ các trường mô tả. Bắt đầu tự động đồng bộ...');
    syncMasterTopicsToDatabase(db);
  } catch (err: any) {
    console.error('[Catalog Master Sync] Lỗi khi kiểm tra/đồng bộ chuyên đề:', err.message);
  }
}
