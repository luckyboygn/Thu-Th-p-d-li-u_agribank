import * as xlsx from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { getDatabase } from '../src/lib/db';

console.log('--- BẮT ĐẦU IMPORT MASTER TRAINING CATALOG ---');

const db = getDatabase();

// 1. Doc file tu dien Vai tro ca nhan (neu co)
const roleMap = new Map<string, string>();
const desktopPath = 'C:\\Users\\NGOCNGUYEN\\Desktop';
if (fs.existsSync(desktopPath)) {
  const desktopFiles = fs.readdirSync(desktopPath);
  const roleFile = desktopFiles.find(f => f.includes('Vai tr') || f.includes('vai tr'));
  if (roleFile) {
    try {
      const roleWb = xlsx.readFile(path.join(desktopPath, roleFile));
      const roleData = xlsx.utils.sheet_to_json<any>(roleWb.Sheets[roleWb.SheetNames[0]]);
      roleData.forEach(r => {
        const code = String(r['Tên'] || '').trim();
        const desc = String(r['Mô tả vai trò'] || '').trim();
        if (code && desc) {
          roleMap.set(code, desc);
        }
      });
      console.log(`✅ Đã nạp ${roleMap.size} vị trí chức danh từ file "Vai trò cá nhân.xlsx"`);
    } catch (e) {
      console.warn('Không đọc được file vai trò cá nhân, sử dụng mã trực tiếp.');
    }
  }
}

// 2. Doc file Phu luc danh muc dao tao
const catalogPath = path.join(process.cwd(), 'sample_data', 'phu_luc_danh_muc_dao_tao.xlsx');
if (!fs.existsSync(catalogPath)) {
  console.error('Không tìm thấy file:', catalogPath);
  process.exit(1);
}

const wb = xlsx.readFile(catalogPath);
const ws = wb.Sheets['3. PL full'] || wb.Sheets[wb.SheetNames[0]];
const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log(`Đã nạp ${data.length} dòng từ file Excel danh mục đào tạo.`);

// Statements
const insertPosStmt = db.prepare(`
  INSERT INTO training_positions (code, name, group_name, status)
  VALUES (?, ?, ?, 'ACTIVE')
  ON CONFLICT(code) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP
`);

const getPosStmt = db.prepare('SELECT id FROM training_positions WHERE code = ?');

const insertTopicStmt = db.prepare(`
  INSERT INTO training_topics (
    code, name, delivery_method, duration, learning_path, competency,
    prerequisite, certificate_requirement, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
`);

const getTopicByNameStmt = db.prepare('SELECT id FROM training_topics WHERE name = ?');

const insertRelStmt = db.prepare(`
  INSERT OR IGNORE INTO training_position_topics (position_id, topic_id, display_order)
  VALUES (?, ?, ?)
`);

let totalRowsProcessed = 0;
let positionCount = 0;
let topicCount = 0;
let relationCount = 0;

db.exec('BEGIN TRANSACTION;');

try {
  // Map tạm để tránh query nhiều lần
  const posIdCache = new Map<string, number>();
  const topicIdCache = new Map<string, number>();

  for (let r = 4; r < data.length; r++) {
    const row = data[r];
    const c1 = String(row[0] || '').trim();
    const c2 = String(row[1] || '').trim();
    const c3 = String(row[2] || '').trim();
    const c4 = String(row[3] || '').trim().replace(/\r?\n/g, ' ');
    const c5 = String(row[4] || '').trim();
    const c6 = String(row[5] || '').trim();
    const c7 = String(row[6] || '').trim();
    const c8 = String(row[7] || '').trim();
    const c9 = String(row[8] || '').trim();

    if (/^\d+$/.test(c1) && c3) {
      totalRowsProcessed++;

      // 1. Lưu Topic nếu chưa có
      let topicId = topicIdCache.get(c3);
      if (!topicId) {
        const existing = getTopicByNameStmt.get(c3) as any;
        if (existing) {
          topicId = existing.id;
        } else {
          const res = insertTopicStmt.run(
            `TOPIC_${topicCount + 1}`,
            c3,
            c4 || 'Trực tuyến/Trực tiếp',
            c5 || '',
            c6 || '',
            c7 || '',
            c8 || '',
            c9 || ''
          );
          topicId = Number(res.lastInsertRowid);
          topicCount++;
        }
        topicIdCache.set(c3, topicId!);
      }

      // 2. Tách và Lưu Position(s)
      if (c2) {
        const splittedPositions = c2.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
        for (const posCode of splittedPositions) {
          let posId = posIdCache.get(posCode);
          if (!posId) {
            const existingPos = getPosStmt.get(posCode) as any;
            if (existingPos) {
              posId = existingPos.id;
            } else {
              // Tìm tên mô tả tiếng Việt
              let posFullName = roleMap.get(posCode) || '';
              if (!posFullName) {
                if (posCode.startsWith('CN.')) {
                  posFullName = `Chi nhánh - ${posCode.replace('CN.', '').trim()}`;
                } else if (posCode === 'LĐTV') {
                  posFullName = 'Người lao động thử việc';
                } else {
                  posFullName = posCode;
                }
              }

              let groupName = 'Toàn hệ thống';
              if (posCode.startsWith('CN.')) groupName = 'Chi nhánh';
              else if (posCode.includes('TSC') || posCode.startsWith('VPTSC') || posCode.startsWith('TT')) groupName = 'Trụ sở chính';
              else if (posCode === 'LĐTV') groupName = 'Thử việc';

              const posRes = insertPosStmt.run(posCode, posFullName, groupName);
              posId = Number(posRes.lastInsertRowid) || (getPosStmt.get(posCode) as any).id;
              positionCount++;
            }
            posIdCache.set(posCode, posId);
          }

          // 3. Lưu quan hệ Position ↔ Topic
          insertRelStmt.run(posId, topicId, parseInt(c1) || 1);
          relationCount++;
        }
      }
    }
  }

  // Ghi audit import
  db.prepare(`
    INSERT INTO training_catalog_imports (
      import_batch_id, file_name, total_rows, positions_created, topics_created, relations_created
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'INIT_IMPORT_' + Date.now(),
    'phu_luc_danh_muc_dao_tao.xlsx',
    totalRowsProcessed,
    posIdCache.size,
    topicIdCache.size,
    relationCount
  );

  db.exec('COMMIT;');

  console.log(`\n🎉 IMPORT THÀNH CÔNG VÀO DATABASE:`);
  console.log(`- Tổng số dòng xử lý: ${totalRowsProcessed}`);
  console.log(`- Tổng số Vị trí chức danh (training_positions): ${posIdCache.size}`);
  console.log(`- Tổng số Chuyên đề chuẩn (training_topics): ${topicIdCache.size}`);
  console.log(`- Tổng số Quan hệ Vị trí ↔ Chuyên đề (training_position_topics): ${relationCount}`);
} catch (err) {
  db.exec('ROLLBACK;');
  console.error('LỖI IMPORT:', err);
  process.exit(1);
}
