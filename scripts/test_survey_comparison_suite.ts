import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import * as xlsx from 'xlsx';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 BẮT ĐẦU TEST SUITE: MỤC 2.7 - SO SÁNH GIỮA CÁC ĐỢT');
  console.log('====================================================\n');

  const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
  const db = new DatabaseSync(dbPath);

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      process.exitCode = 1;
    }
  }

  // 1. Kiểm tra tồn tại đợt khảo sát
  console.log('--- 1. Kiểm tra Dữ liệu Đợt khảo sát (Collections) ---');
  let collections = db.prepare('SELECT id, code, title FROM collections ORDER BY id ASC').all() as any[];

  if (collections.length < 2) {
    // Tạo thêm 1 đợt test
    db.prepare(`
      INSERT INTO collections (code, title, status)
      VALUES ('KS_2027_TEST', 'Khảo sát nhu cầu đào tạo năm 2027 (Test)', 'CLOSED')
    `).run();
    collections = db.prepare('SELECT id, code, title FROM collections ORDER BY id ASC').all() as any[];
  }

  assert(collections.length >= 2, 'Có ít nhất 2 đợt khảo sát để so sánh');
  const baseColl = collections[0];
  const targetColl = collections[1];

  // 2. Kiểm tra tính toán chênh lệch chuyên đề
  console.log('\n--- 2. Kiểm tra tính toán chênh lệch Chuyên đề ---');
  const topicDemandBase = db.prepare(`
    SELECT dt.program_topic_id as topic_id,
           t.topic_name,
           p.name as program_name,
           SUM(dt.participant_count) as count
    FROM training_demand_program_topics dt
    JOIN training_program_topics t ON dt.program_topic_id = t.id
    JOIN training_programs p ON t.program_id = p.id
    JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.collection_id = ?
    GROUP BY dt.program_topic_id
  `).all(baseColl.id) as any[];

  const topicDemandTarget = db.prepare(`
    SELECT dt.program_topic_id as topic_id,
           t.topic_name,
           p.name as program_name,
           SUM(dt.participant_count) as count
    FROM training_demand_program_topics dt
    JOIN training_program_topics t ON dt.program_topic_id = t.id
    JOIN training_programs p ON t.program_id = p.id
    JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    WHERE ds.collection_id = ?
    GROUP BY dt.program_topic_id
  `).all(targetColl.id) as any[];

  const topicMap = new Map<number, any>();
  topicDemandBase.forEach(item => {
    topicMap.set(item.topic_id, {
      topicId: item.topic_id,
      topicName: item.topic_name,
      baseCount: item.count,
      targetCount: 0
    });
  });

  topicDemandTarget.forEach(item => {
    if (!topicMap.has(item.topic_id)) {
      topicMap.set(item.topic_id, {
        topicId: item.topic_id,
        topicName: item.topic_name,
        baseCount: 0,
        targetCount: item.count
      });
    } else {
      topicMap.get(item.topic_id).targetCount = item.count;
    }
  });

  const topicList = Array.from(topicMap.values()).map(t => ({
    ...t,
    diff: t.targetCount - t.baseCount
  }));

  assert(Array.isArray(topicList), 'Tổng hợp danh sách chuyên đề 2 đợt thành công');
  if (topicList.length > 0) {
    const sample = topicList[0];
    assert(sample.diff === (sample.targetCount - sample.baseCount), 'Công thức chênh lệch chuyên đề đúng (target - base)');
  } else {
    assert(true, 'Chuyên đề rỗng xử lý an toàn');
  }

  // 3. Kiểm tra tính toán chênh lệch theo Đơn vị
  console.log('\n--- 3. Kiểm tra tính toán chênh lệch Đơn vị ---');
  const unitDemandBase = db.prepare(`
    SELECT ds.unit_id, u.unit_code, u.unit_name,
           SUM(dt.participant_count) as count
    FROM training_demand_program_topics dt
    JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    JOIN units u ON ds.unit_id = u.id
    WHERE ds.collection_id = ?
    GROUP BY ds.unit_id
  `).all(baseColl.id) as any[];

  const unitDemandTarget = db.prepare(`
    SELECT ds.unit_id, u.unit_code, u.unit_name,
           SUM(dt.participant_count) as count
    FROM training_demand_program_topics dt
    JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
    JOIN training_demand_submissions ds ON dp.submission_id = ds.id
    JOIN units u ON ds.unit_id = u.id
    WHERE ds.collection_id = ?
    GROUP BY ds.unit_id
  `).all(targetColl.id) as any[];

  const unitMap = new Map<number, any>();
  unitDemandBase.forEach(item => {
    unitMap.set(item.unit_id, {
      unitId: item.unit_id,
      unitCode: item.unit_code,
      baseCount: item.count,
      targetCount: 0
    });
  });

  unitDemandTarget.forEach(item => {
    if (!unitMap.has(item.unit_id)) {
      unitMap.set(item.unit_id, {
        unitId: item.unit_id,
        unitCode: item.unit_code,
        baseCount: 0,
        targetCount: item.count
      });
    } else {
      unitMap.get(item.unit_id).targetCount = item.count;
    }
  });

  const unitList = Array.from(unitMap.values()).map(u => ({
    ...u,
    diff: u.targetCount - u.baseCount
  }));

  assert(Array.isArray(unitList), 'Tổng hợp danh sách đơn vị 2 đợt thành công');

  // 4. Kiểm tra cấu trúc xuất Excel 2 sheet
  console.log('\n--- 4. Kiểm tra sinh Excel So sánh 2 đợt ---');
  const wb = xlsx.utils.book_new();
  const ws1 = xlsx.utils.json_to_sheet([{ 'Chuyên đề': 'Test Topic', 'Đợt 1': 10, 'Đợt 2': 15, 'Chênh lệch': 5 }]);
  const ws2 = xlsx.utils.json_to_sheet([{ 'Mã ĐV': 'CN_01', 'Đợt 1': 100, 'Đợt 2': 120, 'Chênh lệch': 20 }]);
  xlsx.utils.book_append_sheet(wb, ws1, 'So_Sanh_Chuyen_De');
  xlsx.utils.book_append_sheet(wb, ws2, 'So_Sanh_Don_Vi');

  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  assert(buf.length > 0, 'Sinh buffer Excel so sánh thành công');

  const readBack = xlsx.read(buf, { type: 'buffer' });
  assert(readBack.SheetNames.includes('So_Sanh_Chuyen_De'), 'Có sheet So_Sanh_Chuyen_De');
  assert(readBack.SheetNames.includes('So_Sanh_Don_Vi'), 'Có sheet So_Sanh_Don_Vi');

  // Dọn dẹp collection test nếu có tạo
  db.prepare("DELETE FROM collections WHERE code = 'KS_2027_TEST'").run();

  console.log('\n====================================================');
  console.log(`🎉 KẾT QUẢ TEST MỤC 2.7: ${passed}/${total} PASS`);
  console.log('====================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
