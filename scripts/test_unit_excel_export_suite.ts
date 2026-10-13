import { DatabaseSync } from 'node:sqlite';
import * as xlsx from 'xlsx';

// Dùng SQLite in-memory để kiểm thử
const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE units (
    id INTEGER PRIMARY KEY,
    unit_code TEXT,
    unit_name TEXT,
    region TEXT,
    unit_type TEXT
  );

  CREATE TABLE collections (
    id INTEGER PRIMARY KEY,
    code TEXT,
    title TEXT,
    status TEXT
  );

  CREATE TABLE training_programs (
    id INTEGER PRIMARY KEY,
    code TEXT,
    name TEXT,
    display_order INTEGER DEFAULT 1
  );

  CREATE TABLE training_program_topics (
    id INTEGER PRIMARY KEY,
    program_id INTEGER,
    topic_name TEXT,
    delivery_method TEXT,
    duration TEXT,
    display_order INTEGER DEFAULT 1
  );

  CREATE TABLE training_demand_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER,
    unit_id INTEGER,
    status TEXT DEFAULT 'SUBMITTED'
  );

  CREATE TABLE training_demand_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER,
    program_id INTEGER
  );

  CREATE TABLE training_demand_program_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demand_program_id INTEGER,
    program_topic_id INTEGER,
    participant_count INTEGER DEFAULT 0
  );

  CREATE TABLE training_demand_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER,
    proposal_name TEXT,
    target_audience TEXT,
    expected_duration TEXT,
    participant_count INTEGER DEFAULT 0,
    notes TEXT
  );
`);

// Insert dữ liệu Chi nhánh Bến Thành
db.exec(`
  INSERT INTO units (id, unit_code, unit_name, region, unit_type)
  VALUES (1090, '1090', 'Agribank Chi nhánh Bến Thành', 'MIEN_NAM', 'BRANCH');

  INSERT INTO collections (id, code, title, status)
  VALUES (1, 'KHAO_SAT_2027', 'Khảo sát & Thu thập Dữ liệu Năm 2027', 'OPEN');

  INSERT INTO training_programs (id, code, name, display_order)
  VALUES (10, 'CT_TINDUNG', 'Nghiệp vụ Tín dụng Nâng cao', 1);

  INSERT INTO training_program_topics (id, program_id, topic_name, delivery_method, duration, display_order)
  VALUES 
    (101, 10, 'Thẩm định Tài sản', 'Trực tuyến', '1 giờ', 1),
    (102, 10, 'Quản trị Rủi ro', 'Trực tiếp', '2 ngày', 2);

  INSERT INTO training_demand_submissions (id, collection_id, unit_id, status)
  VALUES (145, 1, 1090, 'SUBMITTED');

  INSERT INTO training_demand_programs (id, submission_id, program_id)
  VALUES (501, 145, 10);

  INSERT INTO training_demand_program_topics (demand_program_id, program_topic_id, participant_count)
  VALUES 
    (501, 101, 25),
    (501, 102, 15);

  INSERT INTO training_demand_proposals (submission_id, proposal_name, target_audience, expected_duration, participant_count, notes)
  VALUES (145, 'Chuyên đề Fintech', 'Cán bộ tin học', '1 ngày', 5, 'Kiến nghị tổ chức sớm');
`);

console.log('================================================================');
console.log('   BẮT ĐẦU KIỂM THỬ: XUẤT FILE EXCEL ĐƠN VỊ CÓ CỘT TÊN ĐƠN VỊ');
console.log('================================================================');

// Query mô phỏng theo logic đã cập nhật trong API
const collectionId = 1;
const uId = 1090;

const unitRows = db.prepare(`
  SELECT u.unit_code as 'Mã đơn vị',
         u.unit_name as 'Tên đơn vị',
         p.name as 'Khung Chương trình đào tạo',
         t.topic_name as 'Tên chuyên đề',
         t.delivery_method as 'Hình thức đào tạo',
         t.duration as 'Thời lượng đào tạo',
         dt.participant_count as 'Số lượng người đăng ký'
  FROM training_demand_program_topics dt
  JOIN training_program_topics t ON dt.program_topic_id = t.id
  JOIN training_programs p ON t.program_id = p.id
  JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
  JOIN training_demand_submissions ds ON dp.submission_id = ds.id
  JOIN units u ON ds.unit_id = u.id
  WHERE ds.collection_id = ? AND ds.unit_id = ? AND dt.participant_count > 0
  ORDER BY p.display_order ASC, t.display_order ASC
`).all(collectionId, uId) as any[];

console.log('[TEST 1] Kiểm tra số lượng dòng dữ liệu xuất ra:', unitRows.length);
if (unitRows.length === 2) {
  console.log('-> PASS: Xuất đúng 2 chuyên đề có số lượng người đăng ký > 0.');
} else {
  throw new Error(`TEST 1 FAILED: Mong đợi 2 nhưng nhận được ${unitRows.length}`);
}

console.log('[TEST 2] Kiểm tra cột "Mã đơn vị" và "Tên đơn vị":');
console.log('Dòng đầu tiên:', unitRows[0]);
if (unitRows[0]['Mã đơn vị'] === '1090' && unitRows[0]['Tên đơn vị'] === 'Agribank Chi nhánh Bến Thành') {
  console.log('-> PASS: Cột "Mã đơn vị" và "Tên đơn vị" đã xuất hiện chuẩn xác!');
} else {
  throw new Error('TEST 2 FAILED: Thiếu thông tin Mã đơn vị hoặc Tên đơn vị.');
}

// TEST 3: Kiểm tra export sang Excel Workbook và đọc lại các headers
const wb = xlsx.utils.book_new();
const ws = xlsx.utils.json_to_sheet(unitRows);
xlsx.utils.book_append_sheet(wb, ws, 'Nhu_Cau_Don_Vi');

const proposalRows = db.prepare(`
  SELECT u.unit_code as 'Mã đơn vị',
         u.unit_name as 'Tên đơn vị',
         pr.proposal_name as 'Tên chuyên đề / Khóa học đề xuất',
         pr.target_audience as 'Đối tượng học viên',
         pr.expected_duration as 'Thời lượng dự kiến',
         pr.participant_count as 'Số lượng người đăng ký',
         pr.notes as 'Ghi chú / Kiến nghị'
  FROM training_demand_proposals pr
  JOIN training_demand_submissions ds ON pr.submission_id = ds.id
  JOIN units u ON ds.unit_id = u.id
  WHERE ds.collection_id = ? AND ds.unit_id = ? AND pr.participant_count > 0
  ORDER BY pr.id ASC
`).all(collectionId, uId) as any[];

if (proposalRows && proposalRows.length > 0) {
  const wsProp = xlsx.utils.json_to_sheet(proposalRows);
  xlsx.utils.book_append_sheet(wb, wsProp, 'De_Xuat_Ngoai_Khung');
}

const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
const readWb = xlsx.read(buf, { type: 'buffer' });

console.log('[TEST 3] Kiểm tra các Sheet trong file Excel:', readWb.SheetNames);
if (readWb.SheetNames.includes('Nhu_Cau_Don_Vi') && readWb.SheetNames.includes('De_Xuat_Ngoai_Khung')) {
  console.log('-> PASS: File Excel tạo đầy đủ Sheet nhu cầu và Sheet đề xuất ngoài khung!');
} else {
  throw new Error('TEST 3 FAILED: Thiếu sheet trong Excel workbook.');
}

const parsedRows = xlsx.utils.sheet_to_json(readWb.Sheets['Nhu_Cau_Don_Vi']) as any[];
const firstRowKeys = Object.keys(parsedRows[0]);
console.log('[TEST 4] Các cột tiêu đề trong Sheet Nhu_Cau_Don_Vi:', firstRowKeys);
if (firstRowKeys.includes('Tên đơn vị') && firstRowKeys.includes('Mã đơn vị')) {
  console.log('-> PASS: File Excel tải về có đầy đủ cột "Tên đơn vị" và "Mã đơn vị"!');
} else {
  throw new Error('TEST 4 FAILED: File Excel thiếu cột Tên đơn vị.');
}

console.log('================================================================');
console.log('   TẤT CẢ 4/4 KIỂM THỬ ĐÃ ĐẠT (100% PASS)');
console.log('================================================================');
