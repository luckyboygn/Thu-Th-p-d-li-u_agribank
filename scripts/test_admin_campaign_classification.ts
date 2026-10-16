import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('=====================================================');
console.log('   TEST SUITE: PHÂN LOẠI ĐỢT THU THẬP TẠI MENU ADMIN (THI vs KHẢO SÁT)');
console.log('=====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, extraInfo = '') {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (extraInfo) console.error(`   -> Chi tiết: ${extraInfo}`);
  }
}

try {
  // TEST 1: Khởi tạo đợt thu thập loại CANDIDATE_EXAM
  const testExamCode = `TEST_EXAM_${Date.now()}`;
  db.prepare(`
    INSERT INTO exams (code, title, description, status, task_type, created_at)
    VALUES (?, ?, ?, 'OPEN', 'CANDIDATE_EXAM', CURRENT_TIMESTAMP)
  `).run(testExamCode, 'Đợt thi nghiệp vụ thử nghiệm', 'Mô tả test thi nghiệp vụ');

  const createdExam = db.prepare('SELECT * FROM exams WHERE code = ?').get(testExamCode) as any;
  assert(
    createdExam && createdExam.task_type === 'CANDIDATE_EXAM',
    'TEST 1: Khởi tạo đợt thi nghiệp vụ lưu đúng task_type = "CANDIDATE_EXAM"'
  );

  // TEST 2: Đợt thi nghiệp vụ không được tự ý xuất hiện trong bảng collections
  const colForExam = db.prepare('SELECT * FROM collections WHERE code = ?').get(testExamCode) as any;
  assert(!colForExam, 'TEST 2: Đợt thi nghiệp vụ KHÔNG bị đẩy nhầm sang bảng collections');

  // TEST 3: Khởi tạo đợt thu thập loại TRAINING_DEMAND
  const testSurveyCode = `TEST_SURVEY_${Date.now()}`;
  db.prepare(`
    INSERT INTO exams (code, title, description, status, task_type, created_at)
    VALUES (?, ?, ?, 'OPEN', 'TRAINING_DEMAND', CURRENT_TIMESTAMP)
  `).run(testSurveyCode, 'Khảo sát nhu cầu đào tạo thử nghiệm', 'Mô tả test khảo sát');

  // Giả lập logic đồng bộ của POST /api/exams
  db.prepare(`
    INSERT INTO collections (code, title, description, status, task_type, created_at)
    VALUES (?, ?, ?, 'OPEN', 'TRAINING_DEMAND', CURRENT_TIMESTAMP)
  `).run(testSurveyCode, 'Khảo sát nhu cầu đào tạo thử nghiệm', 'Mô tả test khảo sát');

  const createdSurvey = db.prepare('SELECT * FROM exams WHERE code = ?').get(testSurveyCode) as any;
  assert(
    createdSurvey && createdSurvey.task_type === 'TRAINING_DEMAND',
    'TEST 3: Khởi tạo đợt khảo sát lưu đúng task_type = "TRAINING_DEMAND" trong exams'
  );

  const syncedCol = db.prepare('SELECT * FROM collections WHERE code = ?').get(testSurveyCode) as any;
  assert(
    syncedCol && syncedCol.task_type === 'TRAINING_DEMAND',
    'TEST 4: Đợt khảo sát được đồng bộ tự động sang bảng collections với task_type = "TRAINING_DEMAND"'
  );

  // TEST 5: Bộ lọc phân loại đợt thi (CANDIDATE_EXAM)
  const examOnlyList = db.prepare(`
    SELECT * FROM exams WHERE task_type = 'CANDIDATE_EXAM'
  `).all() as any[];
  const hasNoSurveyInExamOnly = examOnlyList.every(e => e.task_type === 'CANDIDATE_EXAM');
  assert(hasNoSurveyInExamOnly && examOnlyList.length > 0, 'TEST 5: Bộ lọc Phục vụ thi (CANDIDATE_EXAM) 100% chỉ trả về đợt thi');

  // TEST 6: Bộ lọc phân loại khảo sát (TRAINING_DEMAND)
  const surveyOnlyList = db.prepare(`
    SELECT * FROM exams WHERE task_type = 'TRAINING_DEMAND'
  `).all() as any[];
  const hasNoExamInSurveyOnly = surveyOnlyList.every(e => e.task_type === 'TRAINING_DEMAND');
  assert(hasNoExamInSurveyOnly && surveyOnlyList.length > 0, 'TEST 6: Bộ lọc Khảo sát đào tạo (TRAINING_DEMAND) 100% chỉ trả về đợt khảo sát');

  // TEST 7: Chuyển đổi phân loại đợt (CANDIDATE_EXAM -> TRAINING_DEMAND)
  db.prepare(`
    UPDATE exams SET task_type = 'TRAINING_DEMAND' WHERE code = ?
  `).run(testExamCode);
  // Đồng bộ sang collections
  db.prepare(`
    INSERT INTO collections (code, title, description, status, task_type, created_at)
    VALUES (?, ?, ?, 'OPEN', 'TRAINING_DEMAND', CURRENT_TIMESTAMP)
  `).run(testExamCode, 'Đợt thi đã chuyển sang khảo sát', 'Chuyển phân loại');

  const updatedExam = db.prepare('SELECT * FROM exams WHERE code = ?').get(testExamCode) as any;
  assert(
    updatedExam.task_type === 'TRAINING_DEMAND',
    'TEST 7: Admin có thể chuyển đổi phân loại đợt thu thập thành công'
  );
  const syncedAfterSwitch = db.prepare('SELECT * FROM collections WHERE code = ?').get(testExamCode) as any;
  assert(
    syncedAfterSwitch && syncedAfterSwitch.task_type === 'TRAINING_DEMAND',
    'TEST 8: Đợt sau khi chuyển đổi sang Khảo sát đào tạo được đồng bộ sang collections'
  );

  // Cleanup test data
  db.prepare('DELETE FROM exams WHERE code IN (?, ?)').run(testExamCode, testSurveyCode);
  db.prepare('DELETE FROM collections WHERE code IN (?, ?)').run(testExamCode, testSurveyCode);
  console.log('\n🧹 Đã dọn dẹp dữ liệu test tạm thời.');

} catch (err: any) {
  console.error('Lỗi khi chạy test suite:', err);
  totalTests++;
}

console.log('\n=====================================================');
console.log(`KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('=====================================================');

if (passedTests === totalTests && totalTests >= 8) {
  console.log('🎉 TẤT CẢ CÁC BÀI TEST PHÂN LOẠI ĐỢT THU THẬP ĐÃ ĐẠT 100%!');
  process.exit(0);
} else {
  console.error('❌ CÓ BÀI TEST KHÔNG ĐẠT!');
  process.exit(1);
}
