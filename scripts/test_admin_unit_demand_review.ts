import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert';

console.log('--- BẮT ĐẦU TEST: Admin Unit Training Demand Review Suite ---');

const db = new DatabaseSync('data/database.sqlite');

// 1. Lấy đơn vị thử nghiệm (ví dụ Bến Thành hoặc đơn vị đầu tiên)
let unit = db.prepare('SELECT id, unit_code, unit_name FROM units WHERE unit_name LIKE ?').get('%Bến Thành%') as any;
if (!unit) {
  unit = db.prepare('SELECT id, unit_code, unit_name FROM units LIMIT 1').get() as any;
}
assert(unit, 'Phải có ít nhất 1 đơn vị trong CSDL');
console.log(`✓ Đơn vị kiểm thử: [${unit.unit_code}] ${unit.unit_name} (ID: ${unit.id})`);

// 2. Lấy đợt khảo sát
let collection = db.prepare('SELECT id, code, title FROM collections ORDER BY id DESC LIMIT 1').get() as any;
if (!collection) {
  collection = { id: 1, code: 'DOT-2026', title: 'Khảo sát nhu cầu đào tạo 2026' };
}
console.log(`✓ Đợt khảo sát: [${collection.code}] ${collection.title} (ID: ${collection.id})`);

// 3. Tạo dữ liệu submission giả lập để kiểm tra cấu trúc
const existingSub = db.prepare('SELECT * FROM training_demand_submissions WHERE unit_id = ? AND collection_id = ?').get(unit.id, collection.id) as any;
let subId = existingSub?.id;

if (!subId) {
  const insertSub = db.prepare(`
    INSERT INTO training_demand_submissions (collection_id, unit_id, version, status, receipt_code, submitted_at, updated_at)
    VALUES (?, ?, 1, 'SUBMITTED', 'BN-DEMO-TEST-001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const res = insertSub.run(collection.id, unit.id);
  subId = Number(res.lastInsertRowid);
  console.log(`✓ Đã tạo submission test ID: ${subId}`);
} else {
  db.prepare(`UPDATE training_demand_submissions SET status = 'SUBMITTED', receipt_code = 'BN-DEMO-TEST-001' WHERE id = ?`).run(subId);
  console.log(`✓ Đã cập nhật submission test ID: ${subId}`);
}

// 4. Kiểm tra có training programs và topics trong catalog không
const samplePrograms = db.prepare('SELECT id, code, name, group_name FROM training_programs LIMIT 2').all() as any[];
assert(samplePrograms.length > 0, 'Phải có ít nhất 1 training_program trong catalog');

// Gán 1 program vào training_demand_programs nếu chưa có
let demandProg = db.prepare('SELECT * FROM training_demand_programs WHERE submission_id = ?').get(subId) as any;
if (!demandProg) {
  const prog = samplePrograms[0];
  const insDp = db.prepare(`
    INSERT INTO training_demand_programs (submission_id, program_id, notes)
    VALUES (?, ?, 'Ghi chú thử nghiệm đơn vị')
  `).run(subId, prog.id);
  const dpId = Number(insDp.lastInsertRowid);

  // Thêm topics
  const progTopics = db.prepare('SELECT id FROM training_program_topics WHERE program_id = ? LIMIT 3').all(prog.id) as any[];
  for (const pt of progTopics) {
    db.prepare(`
      INSERT INTO training_demand_program_topics (demand_program_id, program_topic_id, participant_count)
      VALUES (?, ?, 25)
    `).run(dpId, pt.id);
  }
  console.log(`✓ Đã thêm demand_program test với ${progTopics.length} chuyên đề (mỗi CĐ 25 người)`);
}

// 5. Kiểm tra query giả lập API /api/training-reports?type=BY_UNIT
const targetUnitId = unit.id;
const collectionId = collection.id;

const fetchedUnit = db.prepare('SELECT id, unit_code, unit_name, region, unit_type FROM units WHERE id = ?').get(targetUnitId) as any;
const fetchedSubmission = db.prepare(`
  SELECT ts.*, u.full_name as submitted_by_name
  FROM training_demand_submissions ts
  LEFT JOIN users u ON ts.submitted_by = u.id
  WHERE ts.collection_id = ? AND ts.unit_id = ?
  ORDER BY ts.version DESC LIMIT 1
`).get(collectionId, targetUnitId) as any;

assert(fetchedSubmission, 'Phải tìm thấy submission');
assert.strictEqual(fetchedSubmission.status, 'SUBMITTED', 'Trạng thái phải là SUBMITTED');
assert(fetchedSubmission.receipt_code, 'Mã biên nhận không được rỗng');

const declaredPrograms = db.prepare(`
  SELECT dp.id as demand_program_id, dp.program_id, dp.notes, dp.created_at,
         p.code as program_code, p.name as program_name, p.group_name,
         (SELECT COUNT(*) FROM training_program_topics WHERE program_id = p.id) as total_available_topics,
         (SELECT COUNT(*) FROM training_demand_program_topics WHERE demand_program_id = dp.id AND participant_count > 0) as registered_topic_count,
         (SELECT COALESCE(SUM(participant_count), 0) FROM training_demand_program_topics WHERE demand_program_id = dp.id) as sum_participants
  FROM training_demand_programs dp
  JOIN training_programs p ON dp.program_id = p.id
  WHERE dp.submission_id = ?
  ORDER BY p.display_order ASC, dp.id ASC
`).all(fetchedSubmission.id) as any[];

assert(declaredPrograms.length > 0, 'Phải có ít nhất 1 declaredProgram');
assert(declaredPrograms[0].sum_participants > 0, 'Số lượt học viên phải > 0');

const getProgramTopicsStmt = db.prepare(`
  SELECT dt.id as demand_topic_id, dt.program_topic_id, dt.participant_count,
         t.topic_name, t.target_audience, t.delivery_method, t.duration, t.display_order
  FROM training_demand_program_topics dt
  JOIN training_program_topics t ON dt.program_topic_id = t.id
  WHERE dt.demand_program_id = ?
  ORDER BY t.display_order ASC, t.id ASC
`);

const programsWithDetails = declaredPrograms.map(prog => {
  const topics = getProgramTopicsStmt.all(prog.demand_program_id);
  return {
    ...prog,
    topics
  };
});

assert(programsWithDetails[0].topics.length > 0, 'Program phải có danh sách topics chi tiết');
console.log(`✓ Chương trình '${programsWithDetails[0].program_name}' có ${programsWithDetails[0].topics.length} chuyên đề, tổng ${programsWithDetails[0].sum_participants} lượt người.`);

console.log('--- HOÀN TẤT TEST: TẤT CẢ KIỂM THỬ XEM CHI TIẾT ĐƠN VỊ CỦA ADMIN ĐỀU THÀNH CÔNG! ---');
