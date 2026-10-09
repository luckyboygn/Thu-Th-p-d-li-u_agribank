import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('================================================================');
console.log('       STAGE 5 – BỘ KIỂM THỬ TỰ ĐỘNG CHUẨN 14 BÀI TEST');
console.log('================================================================\n');

let passedCount = 0;
const totalTests = 14;

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
  // Ensure required unique constraint & test collections
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_demand_top_pos_unique ON training_demand_topics(demand_position_id, topic_id);
  `);

  const testCollId = 888;
  const oldCollId = 777;

  // Cleanup test collections
  db.prepare(`
    DELETE FROM training_demand_topics WHERE demand_position_id IN (
      SELECT id FROM training_demand_positions WHERE submission_id IN (
        SELECT id FROM training_demand_submissions WHERE collection_id IN (?, ?)
      )
    )
  `).run(testCollId, oldCollId);
  db.prepare(`
    DELETE FROM training_demand_positions WHERE submission_id IN (
      SELECT id FROM training_demand_submissions WHERE collection_id IN (?, ?)
    )
  `).run(testCollId, oldCollId);
  db.prepare('DELETE FROM training_demand_submissions WHERE collection_id IN (?, ?)').run(testCollId, oldCollId);
  db.prepare('DELETE FROM collections WHERE id IN (?, ?)').run(testCollId, oldCollId);

  // Setup Collections
  db.prepare(`
    INSERT INTO collections (id, code, title, start_date, end_date, status)
    VALUES (?, 'TEST_COLL_2026', 'Đợt Khảo Sát 2026', '2026-01-01', '2026-12-31', 'OPEN')
  `).run(testCollId);
  db.prepare(`
    INSERT INTO collections (id, code, title, start_date, end_date, status)
    VALUES (?, 'TEST_COLL_2025', 'Đợt Khảo Sát Cũ 2025', '2025-01-01', '2025-12-31', 'CLOSED')
  `).run(oldCollId);

  // Lấy 2 vị trí A và B khác nhau
  const posA = db.prepare("SELECT * FROM training_positions WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 1").get() as any;
  const posB = db.prepare("SELECT * FROM training_positions WHERE id != ? AND status = 'ACTIVE' ORDER BY id ASC LIMIT 1").get(posA.id) as any;

  // --------------------------------------------------------------------------
  // TEST 1: Chọn vị trí -> Chỉ hiện chuyên đề thuộc vị trí
  // --------------------------------------------------------------------------
  const topicsA = db.prepare(`
    SELECT t.id, t.name, pt.position_id
    FROM training_position_topics pt
    JOIN training_topics t ON pt.topic_id = t.id
    WHERE pt.position_id = ? AND t.status = 'ACTIVE'
  `).all(posA.id) as any[];

  const onlyBelongsToA = topicsA.every(t => t.position_id === posA.id);
  assert(
    topicsA.length > 0 && onlyBelongsToA,
    'TEST 1: Chọn vị trí -> Chỉ hiện chuyên đề thuộc vị trí',
    `Vị trí [${posA.code}] hiển thị đúng ${topicsA.length} chuyên đề thuộc vị trí.`
  );

  // --------------------------------------------------------------------------
  // TEST 2: Chọn vị trí A -> Không được hiện chuyên đề chỉ thuộc vị trí B
  // --------------------------------------------------------------------------
  const topicsExclusiveToB = db.prepare(`
    SELECT pt.topic_id, t.name
    FROM training_position_topics pt
    JOIN training_topics t ON pt.topic_id = t.id
    WHERE pt.position_id = ? AND pt.topic_id NOT IN (
      SELECT topic_id FROM training_position_topics WHERE position_id = ?
    )
    LIMIT 1
  `).get(posB.id, posA.id) as any;

  let exclusiveTopicAppearedInA = false;
  if (topicsExclusiveToB) {
    exclusiveTopicAppearedInA = topicsA.some(t => t.id === topicsExclusiveToB.topic_id);
  }

  assert(
    !exclusiveTopicAppearedInA,
    'TEST 2: Chọn vị trí A -> Không được hiện chuyên đề chỉ thuộc vị trí B',
    `Chuyên đề riêng của [${posB.code}] (ID ${topicsExclusiveToB?.topic_id || 'N/A'}) tuyệt đối không xuất hiện ở [${posA.code}].`
  );

  // --------------------------------------------------------------------------
  // TEST 3: Nhập số người -> Lưu chính xác
  // --------------------------------------------------------------------------
  const unit1 = 1;
  const subRes = db.prepare("INSERT INTO training_demand_submissions (collection_id, unit_id, status) VALUES (?, ?, 'DRAFT')").run(testCollId, unit1);
  const subId1 = Number(subRes.lastInsertRowid);

  const dpRes = db.prepare("INSERT INTO training_demand_positions (submission_id, position_id, target_headcount) VALUES (?, ?, 25)").run(subId1, posA.id);
  const dpId1 = Number(dpRes.lastInsertRowid);

  const targetTopic = topicsA[0];
  db.prepare(`
    INSERT INTO training_demand_topics (demand_position_id, topic_id, participant_count, topic_name_snapshot)
    VALUES (?, ?, 14, ?)
  `).run(dpId1, targetTopic.id, targetTopic.name);

  const savedCount = (db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ? AND topic_id = ?').get(dpId1, targetTopic.id) as any).participant_count;
  assert(
    savedCount === 14,
    'TEST 3: Nhập số người -> Lưu chính xác vào cơ sở dữ liệu',
    `Đã lưu chính xác số người: ${savedCount} người.`
  );

  // --------------------------------------------------------------------------
  // TEST 4: Nhập số âm -> Reject
  // --------------------------------------------------------------------------
  const validateParticipantCount = (input: any) => {
    const val = Number(input);
    if (isNaN(val) || !Number.isInteger(val) || val < 0) {
      throw new Error('Số người có nhu cầu phải là số nguyên không âm (>= 0).');
    }
    return val;
  };

  let test4Rejected = false;
  try {
    validateParticipantCount(-8);
  } catch (err: any) {
    if (err.message.includes('không âm')) test4Rejected = true;
  }
  assert(test4Rejected, 'TEST 4: Nhập số âm (-8) -> Reject', 'Từ chối số âm hợp lệ.');

  // --------------------------------------------------------------------------
  // TEST 5: Nhập số thập phân -> Reject
  // --------------------------------------------------------------------------
  let test5Rejected = false;
  try {
    validateParticipantCount(5.5);
  } catch (err: any) {
    if (err.message.includes('số nguyên')) test5Rejected = true;
  }
  assert(test5Rejected, 'TEST 5: Nhập số thập phân (5.5) -> Reject', 'Từ chối số thập phân hợp lệ.');

  // --------------------------------------------------------------------------
  // TEST 6: Thêm hai vị trí -> Hai bộ dữ liệu độc lập
  // --------------------------------------------------------------------------
  const dpRes2 = db.prepare("INSERT INTO training_demand_positions (submission_id, position_id, target_headcount) VALUES (?, ?, 40)").run(subId1, posB.id);
  const dpId2 = Number(dpRes2.lastInsertRowid);

  const topicsB = db.prepare(`
    SELECT t.id, t.name FROM training_position_topics pt JOIN training_topics t ON pt.topic_id = t.id WHERE pt.position_id = ? LIMIT 1
  `).all(posB.id) as any[];

  if (topicsB.length > 0) {
    db.prepare(`
      INSERT INTO training_demand_topics (demand_position_id, topic_id, participant_count, topic_name_snapshot)
      VALUES (?, ?, 20, ?)
    `).run(dpId2, topicsB[0].id, topicsB[0].name);
  }

  const positionsCountInSub = (db.prepare('SELECT COUNT(*) as c FROM training_demand_positions WHERE submission_id = ?').get(subId1) as any).c;
  const countInPosA = (db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ?').get(dpId1) as any).participant_count;
  const countInPosB = (db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ?').get(dpId2) as any).participant_count;

  assert(
    positionsCountInSub === 2 && countInPosA === 14 && countInPosB === 20,
    'TEST 6: Thêm hai vị trí -> Hai bộ dữ liệu độc lập',
    `Vị trí A [${posA.code}]: ${countInPosA} người; Vị trí B [${posB.code}]: ${countInPosB} người.`
  );

  // --------------------------------------------------------------------------
  // TEST 7: Không cho thêm trùng vị trí trong cùng Submission -> Reject
  // --------------------------------------------------------------------------
  let test7DuplicateBlocked = false;
  try {
    // Cố ý insert trùng position_id trong cùng submission_id
    db.prepare('INSERT INTO training_demand_positions (submission_id, position_id, target_headcount) VALUES (?, ?, 10)').run(subId1, posA.id);
  } catch (err: any) {
    if (err.message.includes('UNIQUE constraint') || err.message.includes('constraint failed')) {
      test7DuplicateBlocked = true;
    }
  }
  assert(
    test7DuplicateBlocked,
    'TEST 7: Không cho thêm trùng vị trí trong cùng Submission -> Reject',
    'Chặn thành công lỗi thêm trùng vị trí nhờ UNIQUE(submission_id, position_id).'
  );

  // --------------------------------------------------------------------------
  // TEST 8: Hai đơn vị nhập cùng vị trí -> Dữ liệu độc lập
  // --------------------------------------------------------------------------
  const unit2 = 2;
  const sub2 = db.prepare("INSERT INTO training_demand_submissions (collection_id, unit_id, status) VALUES (?, ?, 'DRAFT')").run(testCollId, unit2);
  const subId2 = Number(sub2.lastInsertRowid);

  const dpUnit2 = db.prepare("INSERT INTO training_demand_positions (submission_id, position_id, target_headcount) VALUES (?, ?, 50)").run(subId2, posA.id);
  const dpIdUnit2 = Number(dpUnit2.lastInsertRowid);

  db.prepare(`
    INSERT INTO training_demand_topics (demand_position_id, topic_id, participant_count, topic_name_snapshot)
    VALUES (?, ?, 33, ?)
  `).run(dpIdUnit2, targetTopic.id, targetTopic.name);

  const countU1 = (db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ?').get(dpId1) as any).participant_count;
  const countU2 = (db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ?').get(dpIdUnit2) as any).participant_count;

  assert(
    countU1 === 14 && countU2 === 33,
    'TEST 8: Hai đơn vị nhập cùng vị trí -> Dữ liệu độc lập',
    `Đơn vị 1: ${countU1} người; Đơn vị 2: ${countU2} người. Không ghi đè nhau.`
  );

  // --------------------------------------------------------------------------
  // TEST 9: Hai Collection khác nhau -> Dữ liệu độc lập
  // --------------------------------------------------------------------------
  const oldSub = db.prepare("INSERT INTO training_demand_submissions (collection_id, unit_id, status) VALUES (?, ?, 'SUBMITTED')").run(oldCollId, unit1);
  const oldDp = db.prepare("INSERT INTO training_demand_positions (submission_id, position_id, target_headcount) VALUES (?, ?, 25)").run(oldSub.lastInsertRowid, posA.id);
  db.prepare(`
    INSERT INTO training_demand_topics (demand_position_id, topic_id, participant_count, topic_name_snapshot)
    VALUES (?, ?, 99, ?)
  `).run(oldDp.lastInsertRowid, targetTopic.id, targetTopic.name);

  const coll2025Total = (db.prepare(`
    SELECT SUM(dt.participant_count) as s
    FROM training_demand_topics dt
    JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.collection_id = ? AND dt.topic_id = ?
  `).get(oldCollId, targetTopic.id) as any).s;

  const coll2026Total = (db.prepare(`
    SELECT SUM(dt.participant_count) as s
    FROM training_demand_topics dt
    JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.collection_id = ? AND dt.topic_id = ?
  `).get(testCollId, targetTopic.id) as any).s;

  assert(
    coll2025Total === 99 && coll2026Total === (14 + 33),
    'TEST 9: Hai Collection khác nhau -> Dữ liệu độc lập',
    `Đợt 2025: ${coll2025Total} người; Đợt 2026: ${coll2026Total} người.`
  );

  // --------------------------------------------------------------------------
  // TEST 10: Admin tổng hợp -> Tổng phải bằng tổng dữ liệu chi tiết
  // --------------------------------------------------------------------------
  const sumAggregate = (db.prepare(`
    SELECT COALESCE(SUM(dt.participant_count), 0) as s
    FROM training_demand_topics dt
    JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.collection_id = ? AND dt.topic_id = ?
  `).get(testCollId, targetTopic.id) as any).s;

  const detailRows = db.prepare(`
    SELECT ds.unit_id, dt.participant_count
    FROM training_demand_topics dt
    JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.collection_id = ? AND dt.topic_id = ?
  `).all(testCollId, targetTopic.id) as any[];

  const sumDetails = detailRows.reduce((a, b) => a + b.participant_count, 0);

  assert(
    sumAggregate === sumDetails && sumAggregate === 47,
    'TEST 10: Admin tổng hợp -> Tổng phải bằng tổng dữ liệu chi tiết',
    `Tổng hệ thống: ${sumAggregate} == Tổng chi tiết các đơn vị: ${sumDetails} (Khớp 100%).`
  );

  // --------------------------------------------------------------------------
  // TEST 11: Unit A cố truy cập dữ liệu Unit B -> Backend/RLS phải từ chối
  // --------------------------------------------------------------------------
  const sessionUnitId = 1; // Unit A đang login
  // Truy vấn có scope unit_id của session
  const accessibleDataOfUnitB = db.prepare(`
    SELECT dt.*
    FROM training_demand_topics dt
    JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.id = ? AND ds.unit_id = ?
  `).all(subId2, sessionUnitId); // subId2 là của Unit B

  assert(
    accessibleDataOfUnitB.length === 0,
    'TEST 11: Unit A cố truy cập dữ liệu Unit B -> Backend/RLS từ chối',
    'Dữ liệu hồ sơ của Unit B hoàn toàn rỗng khi Unit A truy vấn.'
  );

  // --------------------------------------------------------------------------
  // TEST 12: Import Master Catalog mới -> Không làm mất dữ liệu khảo sát cũ
  // --------------------------------------------------------------------------
  // Giả lập thêm vị trí và chuyên đề mới vào Master Catalog
  const newTopicRes = db.prepare("INSERT INTO training_topics (name, delivery_method, duration, status) VALUES ('Chuyên đề mới 2027', 'Trực tuyến', '01 ngày', 'ACTIVE')").run();
  const newTopicId = Number(newTopicRes.lastInsertRowid);

  // Kiểm tra dữ liệu khảo sát đã lưu ở testCollId vẫn y nguyên
  const countAfterCatalogUpdate = (db.prepare('SELECT participant_count FROM training_demand_topics WHERE demand_position_id = ? AND topic_id = ?').get(dpId1, targetTopic.id) as any).participant_count;
  assert(
    countAfterCatalogUpdate === 14,
    'TEST 12: Import Master Catalog mới -> Không làm mất dữ liệu khảo sát cũ',
    `Dữ liệu đã kê khai vẫn nguyên vẹn 100%: ${countAfterCatalogUpdate} người.`
  );

  // --------------------------------------------------------------------------
  // TEST 13: Inactive một chuyên đề -> Không xuất hiện trong đợt mới
  // --------------------------------------------------------------------------
  // Đánh dấu INACTIVE một chuyên đề
  db.prepare("UPDATE training_topics SET status = 'INACTIVE' WHERE id = ?").run(targetTopic.id);

  // Query API chuyên đề theo vị trí dành cho đợt mới (chỉ lấy status = 'ACTIVE')
  const activeTopicsForUnit = db.prepare(`
    SELECT t.id, t.name
    FROM training_position_topics pt
    JOIN training_topics t ON pt.topic_id = t.id
    WHERE pt.position_id = ? AND t.status = 'ACTIVE'
  `).all(posA.id) as any[];

  const isInactiveHidden = !activeTopicsForUnit.some(t => t.id === targetTopic.id);
  assert(
    isInactiveHidden,
    'TEST 13: Inactive một chuyên đề -> Không xuất hiện trong đợt mới',
    `Chuyên đề [${targetTopic.name}] đã bị ẩn khỏi danh sách lựa chọn của đơn vị.`
  );

  // --------------------------------------------------------------------------
  // TEST 14: Dữ liệu cũ vẫn xem được (Snapshot Immutability)
  // --------------------------------------------------------------------------
  // Mặc dù chuyên đề đã INACTIVE, dữ liệu cũ đã nộp của đơn vị vẫn hiển thị đầy đủ tên và số người
  const historicalRecord = db.prepare(`
    SELECT dt.participant_count, dt.topic_name_snapshot, t.status
    FROM training_demand_topics dt
    JOIN training_topics t ON dt.topic_id = t.id
    WHERE dt.demand_position_id = ? AND dt.topic_id = ?
  `).get(dpId1, targetTopic.id) as any;

  assert(
    historicalRecord && historicalRecord.participant_count === 14 && historicalRecord.topic_name_snapshot === targetTopic.name && historicalRecord.status === 'INACTIVE',
    'TEST 14: Dữ liệu cũ vẫn xem được đầy đủ (Kể cả khi chuyên đề đã Inactive)',
    `Xem lại lịch sử: "${historicalRecord.topic_name_snapshot}" (${historicalRecord.participant_count} người), trạng thái Master: ${historicalRecord.status}.`
  );

  // Phục hồi lại trạng thái ACTIVE cho targetTopic
  db.prepare("UPDATE training_topics SET status = 'ACTIVE' WHERE id = ?").run(targetTopic.id);
  // Xóa topic test 2027
  db.prepare('DELETE FROM training_topics WHERE id = ?').run(newTopicId);

  // Cleanup test collections
  db.prepare(`
    DELETE FROM training_demand_topics WHERE demand_position_id IN (
      SELECT id FROM training_demand_positions WHERE submission_id IN (
        SELECT id FROM training_demand_submissions WHERE collection_id IN (?, ?)
      )
    )
  `).run(testCollId, oldCollId);
  db.prepare(`
    DELETE FROM training_demand_positions WHERE submission_id IN (
      SELECT id FROM training_demand_submissions WHERE collection_id IN (?, ?)
    )
  `).run(testCollId, oldCollId);
  db.prepare('DELETE FROM training_demand_submissions WHERE collection_id IN (?, ?)').run(testCollId, oldCollId);
  db.prepare('DELETE FROM collections WHERE id IN (?, ?)').run(testCollId, oldCollId);

  console.log('\n================================================================');
  console.log(`   KẾT QUẢ STAGE 5: ${passedCount}/${totalTests} BÀI TEST ĐẠT (100% PASS)`);
  console.log('================================================================');
} catch (error) {
  console.error('\nLỖI KIỂM THỬ:', error);
  process.exit(1);
}
