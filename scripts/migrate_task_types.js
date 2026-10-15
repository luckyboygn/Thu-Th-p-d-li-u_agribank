const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('=== MIGRATING TASK TYPES IN EXAMS & COLLECTIONS ===');

// 1. Thêm cột task_type vào bảng exams nếu chưa có
try {
  db.exec("ALTER TABLE exams ADD COLUMN task_type VARCHAR(50) DEFAULT 'CANDIDATE_EXAM'");
  console.log('✅ Đã thêm cột task_type vào bảng exams');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('ℹ️ Cột task_type đã tồn tại trong bảng exams');
  } else {
    console.error('Lỗi khi thêm task_type vào exams:', e.message);
  }
}

// 2. Thêm cột task_type vào bảng collections nếu chưa có
try {
  db.exec("ALTER TABLE collections ADD COLUMN task_type VARCHAR(50) DEFAULT 'TRAINING_DEMAND'");
  console.log('✅ Đã thêm cột task_type vào bảng collections');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('ℹ️ Cột task_type đã tồn tại trong bảng collections');
  } else {
    console.error('Lỗi khi thêm task_type vào collections:', e.message);
  }
}

// 3. Chuẩn hóa dữ liệu trong bảng exams:
// - Bất kỳ đợt nào có tiêu đề hoặc mã liên quan đến khảo sát đào tạo -> set task_type = 'TRAINING_DEMAND'
const updateTrainingExams = db.prepare(`
  UPDATE exams
  SET task_type = 'TRAINING_DEMAND'
  WHERE LOWER(title) LIKE '%khảo sát%'
     OR LOWER(title) LIKE '%đào tạo%'
     OR LOWER(title) LIKE '%nhu cầu%'
     OR LOWER(code) LIKE 'ks%'
     OR LOWER(code) LIKE '%training%'
`);
const resultTraining = updateTrainingExams.run();
console.log(`✅ Đã cập nhật ${resultTraining.changes} đợt khảo sát đào tạo trong exams sang task_type = 'TRAINING_DEMAND'`);

// - Các đợt thi nghiệp vụ còn lại -> task_type = 'CANDIDATE_EXAM'
const updateExamTasks = db.prepare(`
  UPDATE exams
  SET task_type = 'CANDIDATE_EXAM'
  WHERE task_type IS NULL OR task_type != 'TRAINING_DEMAND'
`);
const resultExams = updateExamTasks.run();
console.log(`✅ Đã cập nhật ${resultExams.changes} kỳ thi nghiệp vụ sang task_type = 'CANDIDATE_EXAM'`);

// 4. Kiểm tra các đợt trong collections và exams
const currentExams = db.prepare('SELECT id, code, title, task_type, status FROM exams').all();
console.log('--- DANH SÁCH EXAMS HIỆN TẠI ---');
console.table(currentExams);

const currentCols = db.prepare('SELECT id, code, title, task_type, status FROM collections').all();
console.log('--- DANH SÁCH COLLECTIONS HIỆN TẠI ---');
console.table(currentCols);

console.log('=== MIGRATION COMPLETE ===');
