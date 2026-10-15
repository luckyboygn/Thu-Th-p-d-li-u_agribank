const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('--- SEEDING OFFICIAL TRAINING COLLECTION ---');

// 1. Thêm vào collections đợt khảo sát theo đúng văn bản và người dùng nêu
const insertCollection = db.prepare(`
  INSERT OR IGNORE INTO collections (id, code, title, description, status, start_date, end_date, task_type)
  VALUES (?, ?, ?, ?, 'OPEN', '2026-10-01', '2026-12-31', 'TRAINING_DEMAND')
`);
insertCollection.run(
  2,
  'KS_DAO_TAO_2027',
  'Khảo sát nhu cầu đào tạo để triển khai công tác đào tạo năm 2027 (ĐỢT 1 NĂM 2026)',
  'Thu thập nhu cầu đào tạo chuyên đề năm 2027 toàn hệ thống 155 chi nhánh Agribank',
);

// 2. Nếu trong bảng exams có bản ghi có tiêu đề khảo sát này (hoặc id=5), đảm bảo task_type = 'TRAINING_DEMAND'
const insertExamSurvey = db.prepare(`
  INSERT OR IGNORE INTO exams (id, code, title, description, status, start_date, end_date, task_type)
  VALUES (?, ?, ?, ?, 'OPEN', '2026-10-01', '2026-12-31', 'TRAINING_DEMAND')
`);
insertExamSurvey.run(
  5,
  'KS_DAO_TAO_2027',
  'Khảo sát nhu cầu đào tạo để triển khai công tác đào tạo năm 2027 (ĐỢT 1 NĂM 2026)',
  'Thu thập nhu cầu đào tạo chuyên đề năm 2027 toàn hệ thống 155 chi nhánh Agribank',
);

console.log('✅ Đã nạp đợt khảo sát vào collections và exams (với task_type = TRAINING_DEMAND)');
