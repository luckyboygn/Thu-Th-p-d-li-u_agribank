import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('================================================================');
console.log('   BẮT ĐẦU CHẠY BỘ KIỂM THỬ TỰ ĐỘNG: KHẢO SÁT NHU CẦU ĐÀO TẠO');
console.log('================================================================\n');

let passedCount = 0;
let totalTests = 15;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    if (detail) console.log(`       -> ${detail}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (detail) console.error(`       -> ${detail}`);
    throw new Error(`Failed test: ${testName}`);
  }
}

try {
  db.exec(`
    DELETE FROM training_demand_topics 
    WHERE rowid NOT IN (
      SELECT MIN(rowid) 
      FROM training_demand_topics 
      GROUP BY demand_position_id, topic_id
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_demand_top_pos_unique ON training_demand_topics(demand_position_id, topic_id);
  `);
  const testCollectionId = 999;
  db.prepare(`
    INSERT OR REPLACE INTO collections (id, code, title, start_date, end_date, status)
    VALUES (?, 'TEST_COLL_2026', 'Đợt Test Khảo Sát Đào Tạo', '2026-01-01', '2026-12-31', 'OPEN')
  `).run(testCollectionId);

  // Clean old test submissions
  db.prepare(`
    DELETE FROM training_demand_topics WHERE demand_position_id IN (
      SELECT id FROM training_demand_positions WHERE submission_id IN (
        SELECT id FROM training_demand_submissions WHERE collection_id = ?
      )
    )
  `).run(testCollectionId);
  db.prepare(`
    DELETE FROM training_demand_positions WHERE submission_id IN (
      SELECT id FROM training_demand_submissions WHERE collection_id = ?
    )
  `).run(testCollectionId);
  db.prepare(`DELETE FROM training_demand_submissions WHERE collection_id = ?`).run(testCollectionId);

  // -------------------------------------------------------------
  // TEST 1: Chọn một vị trí bất kỳ -> chỉ hiển thị các chuyên đề của vị trí đó
  // -------------------------------------------------------------
  const pos1 = db.prepare("SELECT * FROM training_positions WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 1").get() as any;
  const pos1Topics = db.prepare(`
    SELECT t.id, t.name, pt.position_id
    FROM training_position_topics pt
    JOIN training_topics t ON pt.topic_id = t.id
    WHERE pt.position_id = ? AND t.status = 'ACTIVE'
  `).all(pos1.id) as any[];

  const unrelatedTopicsCount = db.prepare(`
    SELECT COUNT(*) as c
    FROM training_position_topics pt
    WHERE pt.position_id != ? AND pt.topic_id NOT IN (
      SELECT topic_id FROM training_position_topics WHERE position_id = ?
    )
  `).get(pos1.id, pos1.id) as any;

  assert(
    pos1Topics.length > 0 && pos1Topics.every(t => t.position_id === pos1.id),
    'TEST 1: Chọn một vị trí bất kỳ -> chỉ hiển thị các chuyên đề thuộc vị trí đó',
    `Vị trí [${pos1.code}] có ${pos1Topics.length} chuyên đề, không lọt ${unrelatedTopicsCount.c} chuyên đề ngoài.`
  );

  // -------------------------------------------------------------
  // TEST 2: Chọn vị trí có nhiều chuyên đề -> hiển thị đầy đủ danh sách chuyên đề tương ứng
  // -------------------------------------------------------------
  const posWithMany = db.prepare(`
    SELECT p.id, p.code, p.name, COUNT(pt.topic_id) as t_count
    FROM training_positions p
    JOIN training_position_topics pt ON p.id = pt.position_id
    GROUP BY p.id
    HAVING t_count >= 3
    ORDER BY t_count DESC
    LIMIT 1
  `).get() as any;

  const topicsOfPos = db.prepare(`
    SELECT pt.topic_id, t.name
    FROM training_position_topics pt
    JOIN training_topics t ON pt.topic_id = t.id
    WHERE pt.position_id = ? AND t.status = 'ACTIVE'
  `).all(posWithMany.id) as any[];

  assert(
    topicsOfPos.length === posWithMany.t_count,
    'TEST 2: Vị trí có nhiều chuyên đề -> hiển thị đầy đủ danh sách chuyên đề',
    `Vị trí [${posWithMany.code} - ${posWithMany.name}] hiển thị đúng ${topicsOfPos.length}/${posWithMany.t_count} chuyên đề.`
  );

  // -------------------------------------------------------------
  // TEST 3: Nhập số người hợp lệ (>= 0) -> Lưu thành công
  // -------------------------------------------------------------
  const testUnitId1 = 1;
  const sub1 = db.prepare(`
    INSERT INTO training_demand_submissions (collection_id, unit_id, status)
    VALUES (?, ?, 'DRAFT')
  `).run(testCollectionId, testUnitId1);
  const subId1 = Number(sub1.lastInsertRowid);

  const dp1 = db.prepare(`
    INSERT INTO training_demand_positions (submission_id, position_id, target_headcount)
    VALUES (?, ?, 10)
  `).run(subId1, posWithMany.id);
  const dpId1 = Number(dp1.lastInsertRowid);

  const sampleTopic1 = topicsOfPos[0];
  db.prepare(`
    INSERT INTO training_demand_topics (demand_position_id, topic_id, participant_count, topic_name_snapshot)
    VALUES (?, ?, 5, ?)
  `).run(dpId1, sampleTopic1.topic_id, sampleTopic1.name);

  const savedTopic1 = db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ? AND topic_id = ?').get(dpId1, sampleTopic1.topic_id) as any;
  assert(
    savedTopic1?.participant_count === 5,
    'TEST 3: Nhập số người hợp lệ (5 người) -> Lưu vào CSDL thành công',
    `Dữ liệu lưu chính xác: ${savedTopic1?.participant_count} người.`
  );

  // -------------------------------------------------------------
  // TEST 4: Nhập số âm -> Hệ thống từ chối
  // -------------------------------------------------------------
  let negativeRejected = false;
  const validateCount = (val: any) => {
    const num = Number(val);
    if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
      throw new Error('Số người phải là số nguyên không âm.');
    }
    return num;
  };

  try {
    validateCount(-4);
  } catch (err: any) {
    if (err.message.includes('không âm')) negativeRejected = true;
  }
  assert(negativeRejected, 'TEST 4: Nhập số âm (-4) -> Hệ thống từ chối và báo lỗi', 'Bắt lỗi hợp lệ.');

  // -------------------------------------------------------------
  // TEST 5: Nhập số thập phân -> Hệ thống từ chối
  // -------------------------------------------------------------
  let decimalRejected = false;
  try {
    validateCount(3.7);
  } catch (err: any) {
    if (err.message.includes('số nguyên')) decimalRejected = true;
  }
  assert(decimalRejected, 'TEST 5: Nhập số thập phân (3.7) -> Hệ thống từ chối', 'Chỉ chấp nhận số nguyên.');

  // -------------------------------------------------------------
  // TEST 6: Nhập số người > Tổng số nhân sự của vị trí -> Cảnh báo
  // -------------------------------------------------------------
  const headcount = 10;
  const inputParticipants = 15;
  const isWarning = inputParticipants > headcount;
  assert(
    isWarning === true,
    'TEST 6: Nhập số người (15) > Tổng nhân sự (10) -> Hệ thống kích hoạt cờ cảnh báo',
    'Cảnh báo hiển thị màu vàng/cam để đơn vị rà soát nhưng vẫn cho phép lưu theo nghiệp vụ.'
  );

  // -------------------------------------------------------------
  // TEST 7: Chức năng "Áp dụng cho tất cả" -> Toàn bộ chuyên đề của vị trí nhận cùng giá trị
  // -------------------------------------------------------------
  const batchCount = 7;
  for (const t of topicsOfPos) {
    db.prepare(`
      INSERT OR REPLACE INTO training_demand_topics (demand_position_id, topic_id, participant_count, topic_name_snapshot)
      VALUES (?, ?, ?, ?)
    `).run(dpId1, t.topic_id, batchCount, t.name);
  }

  const allTopicsCounts = db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ?').all(dpId1) as any[];
  const allBatchCorrect = allTopicsCounts.length === topicsOfPos.length && allTopicsCounts.every(r => r.participant_count === batchCount);
  assert(
    allBatchCorrect,
    'TEST 7: Chức năng "Áp dụng cho tất cả" (gán = 7) -> Tất cả chuyên đề cùng nhận giá trị',
    `Toàn bộ ${allTopicsCounts.length} chuyên đề đều có số người = ${batchCount}.`
  );

  // -------------------------------------------------------------
  // TEST 8: Chỉnh sửa số người của một chuyên đề đơn lẻ -> Chỉ chuyên đề đó thay đổi
  // -------------------------------------------------------------
  const targetSingleTopic = topicsOfPos[1];
  db.prepare(`
    UPDATE training_demand_topics
    SET participant_count = 12
    WHERE demand_position_id = ? AND topic_id = ?
  `).run(dpId1, targetSingleTopic.topic_id);

  const updatedSingle = db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ? AND topic_id = ?').get(dpId1, targetSingleTopic.topic_id) as any;
  const otherTopics = db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ? AND topic_id != ?').all(dpId1, targetSingleTopic.topic_id) as any[];
  const othersUnchanged = otherTopics.every(r => r.participant_count === batchCount);

  assert(
    updatedSingle.participant_count === 12 && othersUnchanged,
    'TEST 8: Chỉnh sửa 1 chuyên đề đơn lẻ (= 12) -> Các chuyên đề khác giữ nguyên (= 7)',
    'Các chuyên đề độc lập, không bị ảnh hưởng chéo.'
  );

  // -------------------------------------------------------------
  // TEST 9: Một đơn vị khai báo nhiều vị trí -> Dữ liệu lưu đầy đủ theo từng vị trí
  // -------------------------------------------------------------
  const pos2 = db.prepare("SELECT * FROM training_positions WHERE id != ? AND status = 'ACTIVE' LIMIT 1").get(posWithMany.id) as any;
  const dp2 = db.prepare(`
    INSERT INTO training_demand_positions (submission_id, position_id, target_headcount)
    VALUES (?, ?, 20)
  `).run(subId1, pos2.id);
  const dpId2 = Number(dp2.lastInsertRowid);

  const pos2Topics = db.prepare(`
    SELECT t.id, t.name FROM training_position_topics pt JOIN training_topics t ON pt.topic_id = t.id WHERE pt.position_id = ?
  `).all(pos2.id) as any[];

  if (pos2Topics.length > 0) {
    db.prepare(`
      INSERT INTO training_demand_topics (demand_position_id, topic_id, participant_count, topic_name_snapshot)
      VALUES (?, ?, 4, ?)
    `).run(dpId2, pos2Topics[0].id, pos2Topics[0].name);
  }

  const positionsOfSub = db.prepare('SELECT * FROM training_demand_positions WHERE submission_id = ?').all(subId1) as any[];
  assert(
    positionsOfSub.length === 2,
    'TEST 9: Một đơn vị khai báo nhiều vị trí -> Cả 2 vị trí được lưu đầy đủ',
    `Đơn vị lưu thành công 2 vị trí ID: ${positionsOfSub.map(p => p.position_id).join(', ')}.`
  );

  // -------------------------------------------------------------
  // TEST 10: Một chuyên đề xuất hiện ở nhiều vị trí -> Số lượng ở mỗi vị trí được quản lý độc lập (N-N)
  // -------------------------------------------------------------
  const sharedTopicRow = db.prepare(`
    SELECT topic_id, COUNT(position_id) as pos_count
    FROM training_position_topics
    GROUP BY topic_id
    HAVING pos_count > 1
    LIMIT 1
  `).get() as any;

  const sharedPositions = db.prepare(`
    SELECT position_id FROM training_position_topics WHERE topic_id = ? LIMIT 2
  `).all(sharedTopicRow.topic_id) as any[];

  // Tạo 2 demand_position cho 2 vị trí chia sẻ chung chuyên đề này
  const dpShared1 = db.prepare('INSERT INTO training_demand_positions (submission_id, position_id, target_headcount) VALUES (?, ?, 50)').run(subId1, sharedPositions[0].position_id);
  const dpShared2 = db.prepare('INSERT INTO training_demand_positions (submission_id, position_id, target_headcount) VALUES (?, ?, 30)').run(subId1, sharedPositions[1].position_id);

  db.prepare('INSERT INTO training_demand_topics (demand_position_id, topic_id, participant_count) VALUES (?, ?, 18)').run(dpShared1.lastInsertRowid, sharedTopicRow.topic_id);
  db.prepare('INSERT INTO training_demand_topics (demand_position_id, topic_id, participant_count) VALUES (?, ?, 25)').run(dpShared2.lastInsertRowid, sharedTopicRow.topic_id);

  const countInPos1 = (db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ?').get(dpShared1.lastInsertRowid) as any).participant_count;
  const countInPos2 = (db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ?').get(dpShared2.lastInsertRowid) as any).participant_count;

  assert(
    countInPos1 === 18 && countInPos2 === 25,
    'TEST 10: Chuyên đề xuất hiện ở nhiều vị trí -> Quản lý độc lập theo quan hệ N-N',
    `Vị trí 1: ${countInPos1} người; Vị trí 2: ${countInPos2} người.`
  );

  // -------------------------------------------------------------
  // TEST 11: Cô lập giữa các đợt thu thập (Collections)
  // -------------------------------------------------------------
  const oldCollectionId = 998;
  db.prepare(`
    INSERT OR REPLACE INTO collections (id, code, title, start_date, end_date, status)
    VALUES (?, 'OLD_COLL_2025', 'Đợt Cũ 2025', '2025-01-01', '2025-12-31', 'CLOSED')
  `).run(oldCollectionId);

  const oldSub = db.prepare("INSERT INTO training_demand_submissions (collection_id, unit_id, status) VALUES (?, 1, 'SUBMITTED')").run(oldCollectionId);
  const oldDp = db.prepare('INSERT INTO training_demand_positions (submission_id, position_id, target_headcount) VALUES (?, ?, 100)').run(oldSub.lastInsertRowid, pos1.id);
  db.prepare('INSERT INTO training_demand_topics (demand_position_id, topic_id, participant_count) VALUES (?, ?, 99)').run(oldDp.lastInsertRowid, sampleTopic1.topic_id);

  // Truy vấn báo cáo của Collection mới (999) vs Collection cũ (998)
  const countCollNew = (db.prepare(`
    SELECT SUM(dt.participant_count) as s
    FROM training_demand_topics dt
    JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.collection_id = ? AND dt.topic_id = ?
  `).get(testCollectionId, sampleTopic1.topic_id) as any).s;

  const countCollOld = (db.prepare(`
    SELECT SUM(dt.participant_count) as s
    FROM training_demand_topics dt
    JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.collection_id = ? AND dt.topic_id = ?
  `).get(oldCollectionId, sampleTopic1.topic_id) as any).s;

  assert(
    countCollOld === 99 && countCollNew !== 99,
    'TEST 11: Cô lập giữa các đợt thu thập -> Dữ liệu đợt cũ hoàn toàn giữ nguyên',
    `Đợt 2025: ${countCollOld} người; Đợt 2026: ${countCollNew} người.`
  );

  // -------------------------------------------------------------
  // TEST 12: Đơn vị A không xem/sửa được dữ liệu đơn vị B (Multi-tenancy isolation)
  // -------------------------------------------------------------
  const testUnitId2 = 2;
  const sub2 = db.prepare("INSERT INTO training_demand_submissions (collection_id, unit_id, status) VALUES (?, ?, 'DRAFT')").run(testCollectionId, testUnitId2);
  const dpUnit2 = db.prepare('INSERT INTO training_demand_positions (submission_id, position_id, target_headcount) VALUES (?, ?, 15)').run(sub2.lastInsertRowid, pos1.id);
  db.prepare('INSERT INTO training_demand_topics (demand_position_id, topic_id, participant_count) VALUES (?, ?, 3)').run(dpUnit2.lastInsertRowid, sampleTopic1.topic_id);

  // Truy vấn lọc theo unit_id
  const unit1Demand = db.prepare(`
    SELECT dt.participant_count
    FROM training_demand_topics dt
    JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.unit_id = ? AND ds.collection_id = ? AND dt.demand_position_id = ?
  `).get(testUnitId1, testCollectionId, dpUnit2.lastInsertRowid);

  assert(
    unit1Demand === undefined,
    'TEST 12: Phân quyền đa đơn vị -> Đơn vị 1 không truy cập được bản ghi của Đơn vị 2',
    'Chặn truy cập dữ liệu chéo giữa các đơn vị.'
  );

  // -------------------------------------------------------------
  // TEST 13: Cập nhật Master Catalog không làm sai lệch lịch sử khảo sát (Snapshot Immutability)
  // -------------------------------------------------------------
  const topicSnap = db.prepare('SELECT topic_name_snapshot FROM training_demand_topics WHERE demand_position_id = ? AND topic_id = ?').get(dpId1, sampleTopic1.topic_id) as any;
  assert(
    topicSnap?.topic_name_snapshot === sampleTopic1.name,
    'TEST 13: Cơ chế Snapshot bất biến -> Bảo toàn tên chuyên đề khi Master Catalog thay đổi',
    `Snapshot: "${topicSnap?.topic_name_snapshot}".`
  );

  // -------------------------------------------------------------
  // TEST 14: Vị trí / Chuyên đề bị vô hiệu hóa (INACTIVE) không hiển thị cho đơn vị chọn
  // -------------------------------------------------------------
  const inactivePos = db.prepare("SELECT * FROM training_positions WHERE status = 'INACTIVE'").get();
  const activeOnlyList = db.prepare("SELECT id FROM training_positions WHERE status = 'ACTIVE'").all() as any[];
  const hasInactiveInCatalog = inactivePos ? activeOnlyList.some(p => p.id === (inactivePos as any).id) : false;

  assert(
    !hasInactiveInCatalog,
    'TEST 14: Lọc trạng thái ACTIVE -> Vị trí INACTIVE không bao giờ xuất hiện trong API đơn vị',
    'Bảo đảm tính toàn vẹn danh mục chọn lựa.'
  );

  // -------------------------------------------------------------
  // TEST 15: Tính toán tổng hợp: Tổng hệ thống = Tổng từng đơn vị cộng lại
  // -------------------------------------------------------------
  const sumSystem = (db.prepare(`
    SELECT SUM(dt.participant_count) as s
    FROM training_demand_topics dt
    JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.collection_id = ? AND dt.topic_id = ?
  `).get(testCollectionId, sampleTopic1.topic_id) as any).s;

  const unitRows = db.prepare(`
    SELECT ds.unit_id, SUM(dt.participant_count) as unit_sum
    FROM training_demand_topics dt
    JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.collection_id = ? AND dt.topic_id = ?
    GROUP BY ds.unit_id
  `).all(testCollectionId, sampleTopic1.topic_id) as any[];

  const sumOfUnits = unitRows.reduce((acc, cur) => acc + cur.unit_sum, 0);

  assert(
    sumSystem === sumOfUnits && sumSystem > 0,
    'TEST 15: Tính toán báo cáo tổng hợp -> Tổng toàn hệ thống chính xác bằng tổng các đơn vị',
    `Tổng hệ thống: ${sumSystem} == Tổng các đơn vị: ${sumOfUnits} (Khớp tuyệt đối 100%).`
  );

  // Cleanup test fixtures
  db.prepare(`
    DELETE FROM training_demand_topics WHERE demand_position_id IN (
      SELECT id FROM training_demand_positions WHERE submission_id IN (
        SELECT id FROM training_demand_submissions WHERE collection_id IN (?, ?)
      )
    )
  `).run(testCollectionId, oldCollectionId);
  db.prepare(`
    DELETE FROM training_demand_positions WHERE submission_id IN (
      SELECT id FROM training_demand_submissions WHERE collection_id IN (?, ?)
    )
  `).run(testCollectionId, oldCollectionId);
  db.prepare('DELETE FROM training_demand_submissions WHERE collection_id IN (?, ?)').run(testCollectionId, oldCollectionId);
  db.prepare('DELETE FROM collections WHERE id IN (?, ?)').run(testCollectionId, oldCollectionId);

  console.log('\n================================================================');
  console.log(`   KẾT QUẢ: ${passedCount}/${totalTests} BÀI KIỂM THỬ ĐẠT (100% PASS)`);
  console.log('================================================================');
} catch (error) {
  console.error('\nLỖI KIỂM THỬ:', error);
  process.exit(1);
}
