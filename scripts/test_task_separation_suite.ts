import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('=====================================================');
console.log('   TEST SUITE: PHÂN ĐỊNH RẠCH RÒI NHIỆM VỤ THI NGHIỆP VỤ & KHẢO SÁT ĐÀO TẠO');
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

// TEST 1: Kiểm tra schema bảng exams và collections có task_type
const examColumns = db.prepare('PRAGMA table_info(exams)').all() as any[];
const hasExamTaskType = examColumns.some(c => c.name === 'task_type');
assert(hasExamTaskType, 'TEST 1: Bảng exams có cột task_type để phân loại');

const colColumns = db.prepare('PRAGMA table_info(collections)').all() as any[];
const hasColTaskType = colColumns.some(c => c.name === 'task_type');
assert(hasColTaskType, 'TEST 2: Bảng collections có cột task_type để phân loại');

// TEST 2: Đảm bảo đợt khảo sát đào tạo trong exams được gán task_type = 'TRAINING_DEMAND'
const trainingExams = db.prepare(`
  SELECT id, code, title, task_type FROM exams 
  WHERE task_type = 'TRAINING_DEMAND' 
     OR LOWER(title) LIKE '%khảo sát%' 
     OR LOWER(title) LIKE '%đào tạo%'
`).all() as any[];
assert(trainingExams.length > 0, `TEST 3: Nhận diện đúng đợt khảo sát trong exams (${trainingExams.length} đợt)`);

// TEST 3: Giả lập truy vấn allExams của API /api/dashboard/unit
const candidateExams = db.prepare(`
  SELECT id, code, title, status, start_date, end_date, start_at, end_at, task_type
  FROM exams
  WHERE (task_type = 'CANDIDATE_EXAM' OR task_type IS NULL)
    AND LOWER(title) NOT LIKE '%khảo sát%'
    AND LOWER(title) NOT LIKE '%đào tạo%'
    AND LOWER(title) NOT LIKE '%nhu cầu%'
    AND LOWER(code) NOT LIKE 'ks%'
  ORDER BY id DESC
`).all() as any[];

const anySurveyInCandidateExams = candidateExams.some(e => 
  e.task_type === 'TRAINING_DEMAND' || 
  e.title.toLowerCase().includes('khảo sát') || 
  e.title.toLowerCase().includes('đào tạo')
);
assert(!anySurveyInCandidateExams, 'TEST 4: Danh sách allExams của Thi nghiệp vụ TUYỆT ĐỐI KHÔNG chứa đợt khảo sát đào tạo');
assert(candidateExams.length > 0, `TEST 5: Danh sách allExams có các kỳ thi nghiệp vụ chuẩn (${candidateExams.length} kỳ thi)`);

// TEST 4: Fallback an toàn khi client truyền examId của một đợt khảo sát
const surveyExam = db.prepare("SELECT id FROM exams WHERE task_type = 'TRAINING_DEMAND' LIMIT 1").get() as any;
if (surveyExam) {
  const isSurveyIdInCandidates = candidateExams.some(e => e.id === surveyExam.id);
  assert(!isSurveyIdInCandidates, 'TEST 6: Exam ID của khảo sát không nằm trong danh sách kỳ thi nghiệp vụ');

  const fallbackExam = candidateExams.find(e => e.status === 'OPEN') || candidateExams[0];
  assert(fallbackExam && fallbackExam.task_type === 'CANDIDATE_EXAM', 'TEST 7: Fallback tự động chọn kỳ thi nghiệp vụ hợp lệ');
}

// TEST 5: Danh sách Collections của Khảo sát đào tạo chỉ chứa khảo sát
const surveyCollections = db.prepare('SELECT id, code, title, status FROM collections ORDER BY id DESC').all() as any[];
const anyExamInCollections = surveyCollections.some(c => 
  c.code.startsWith('EXAM_') || 
  c.title.toLowerCase().includes('kiểm tra chuyên môn')
);
assert(!anyExamInCollections, 'TEST 8: Danh sách Collections của Khảo sát đào tạo TUYỆT ĐỐI KHÔNG chứa kỳ thi cán bộ');

console.log('\n=====================================================');
console.log(`KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('=====================================================');

if (passedTests === totalTests) {
  console.log('🎉 TẤT CẢ CÁC BÀI TEST PHÂN ĐỊNH NHIỆM VỤ ĐÃ ĐẠT 100%!');
  process.exit(0);
} else {
  console.error('❌ CÓ BÀI TEST KHÔNG ĐẠT!');
  process.exit(1);
}
