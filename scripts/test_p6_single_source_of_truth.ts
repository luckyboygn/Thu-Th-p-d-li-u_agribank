import { DatabaseSync } from 'node:sqlite';
import assert from 'assert';
import {
  resolveActiveCollection,
  resolveActiveExam,
  getAuthoritativeUploadsByUnit,
  getTrainingDemandMetricsByUnit,
  calculateSubmissionParticipantsDetailed,
  getSystemDashboardMetrics
} from '../src/lib/aggregation';
import {
  createSubmissionReceipt,
  getReceiptByCode,
  calculateTrainingDemandParticipants
} from '../src/lib/receipt';

console.log('='.repeat(80));
console.log('KIỂM THỬ HỒI QUY P6: MỘT NGUỒN SỰ THẬT DUY NHẤT (SINGLE SOURCE OF TRUTH)');
console.log('='.repeat(80));

// 1. Khởi tạo CSDL SQLite in-memory độc lập cho bài test
const db = new DatabaseSync(':memory:');

// 2. Khởi tạo Schema cần thiết
db.exec(`
  CREATE TABLE units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_code VARCHAR(50) UNIQUE NOT NULL,
    unit_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    unit_type VARCHAR(50) DEFAULT 'BRANCH_L1',
    region VARCHAR(50) DEFAULT 'MIEN_BAC',
    parent_unit_id INTEGER,
    user_account TEXT
  );

  CREATE TABLE collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN',
    task_type VARCHAR(50) DEFAULT 'CANDIDATE_EXAM',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE training_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    group_name VARCHAR(255),
    display_order INTEGER DEFAULT 1
  );

  CREATE TABLE training_program_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL REFERENCES training_programs(id),
    topic_name VARCHAR(255) NOT NULL,
    display_order INTEGER DEFAULT 1
  );

  CREATE TABLE training_demand_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) DEFAULT 'DRAFT',
    receipt_code VARCHAR(64),
    submitted_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE training_demand_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES training_demand_submissions(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES training_programs(id)
  );

  CREATE TABLE training_demand_program_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demand_program_id INTEGER NOT NULL REFERENCES training_demand_programs(id) ON DELETE CASCADE,
    program_topic_id INTEGER NOT NULL REFERENCES training_program_topics(id),
    participant_count INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE training_demand_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES training_demand_submissions(id) ON DELETE CASCADE,
    proposal_name VARCHAR(255) NOT NULL,
    participant_count INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE submission_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_code VARCHAR(64) UNIQUE NOT NULL,
    target_type VARCHAR(30) NOT NULL,
    target_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL REFERENCES units(id),
    submitted_by INTEGER NOT NULL,
    approved_by INTEGER,
    total_records INTEGER DEFAULT 0,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE exam_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    version INTEGER NOT NULL DEFAULT 1,
    file_name VARCHAR(255) NOT NULL,
    total_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    warning_rows INTEGER DEFAULT 0,
    status VARCHAR(30) DEFAULT 'STAGING',
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE exam_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL REFERENCES exam_uploads(id),
    exam_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    employee_code VARCHAR(50),
    validation_status VARCHAR(20) DEFAULT 'PENDING'
  );

  CREATE TABLE validation_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL,
    record_id INTEGER,
    severity VARCHAR(20) DEFAULT 'ERROR',
    error_message TEXT
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(100),
    full_name VARCHAR(255)
  );

  CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT
  );
`);

// Tạo UNIQUE index theo đúng thiết kế P6
db.exec(`
  CREATE UNIQUE INDEX uq_training_submissions_coll_unit ON training_demand_submissions(collection_id, unit_id);
  CREATE UNIQUE INDEX uq_exam_uploads_exam_unit_ver ON exam_uploads(exam_id, unit_id, version);
`);

// 3. Nạp dữ liệu Fixture với 3 đơn vị
// Unit 1: Chi nhánh Hà Nội (id: 1)
// Unit 2: Chi nhánh Sài Gòn (id: 2)
// Unit 3: Chi nhánh Đà Nẵng (id: 3)
db.exec(`
  INSERT INTO units (id, unit_code, unit_name, status, unit_type, region) VALUES
  (1, '1001', 'Agribank Chi nhánh Hà Nội', 'ACTIVE', 'BRANCH_L1', 'MIEN_BAC'),
  (2, '2001', 'Agribank Chi nhánh Sài Gòn', 'ACTIVE', 'BRANCH_L1', 'MIEN_NAM'),
  (3, '3001', 'Agribank Chi nhánh Đà Nẵng', 'ACTIVE', 'BRANCH_L1', 'MIEN_TRUNG');

  INSERT INTO users (id, username, full_name) VALUES
  (1, 'admin', 'Quản trị viên'),
  (2, 'hn_user', 'Cán bộ Hà Nội'),
  (3, 'sg_user', 'Cán bộ Sài Gòn');

  INSERT INTO collections (id, code, title, status) VALUES
  (10, 'KS_2027', 'Khảo sát nhu cầu đào tạo 2027', 'OPEN');

  INSERT INTO exams (id, code, title, status, task_type) VALUES
  (20, 'THI_2027', 'Kỳ thi sát hạch cán bộ 2027', 'OPEN', 'CANDIDATE_EXAM');

  -- Chương trình Mẫu 04 (Khung chức danh - code không bắt đầu bằng PL_NK)
  INSERT INTO training_programs (id, code, name, display_order) VALUES
  (1, 'CD_TINDUNG', 'Khung Chức danh Tín dụng', 1);

  INSERT INTO training_program_topics (id, program_id, topic_name, display_order) VALUES
  (1, 1, 'Thẩm định tín dụng nâng cao', 1),
  (2, 1, 'Quản trị rủi ro tín dụng', 2);

  -- Chương trình Mẫu 05 (Ngoài khung ban hành - code bắt đầu bằng PL_NK)
  INSERT INTO training_programs (id, code, name, display_order) VALUES
  (2, 'PL_NK_CHUYENDOISO', 'Chương trình Chuyển đổi số ngân hàng', 2);

  INSERT INTO training_program_topics (id, program_id, topic_name, display_order) VALUES
  (3, 2, 'Ứng dụng AI trong nghiệp vụ ngân hàng', 1);
`);

console.log('-> Đã khởi tạo schema và fixture cơ bản.');

// 4. Kê khai dữ liệu cho 3 đơn vị với ĐÁP ÁN ĐÃ BIẾT (KNOWN GROUND TRUTH):
//
// Đơn vị 1 (Hà Nội): Nộp chính thức (SUBMITTED)
//   - Mẫu 04:
//       Chuyên đề 1: 10 học viên (2 đã học)
//       Chuyên đề 2: 15 học viên (5 đã học)
//       => Tổng Mẫu 04 = 25 học viên, 7 đã học.
//   - Mẫu 05:
//       Chuyên đề 3: 8 học viên
//       => Tổng Mẫu 05 = 8 học viên.
//   - Mẫu 06 (Đề xuất tự do):
//       2 đề xuất: Đề xuất A (3 người), Đề xuất B (4 người)
//       => Tổng Mẫu 06 = 7 học viên.
//   => ĐÁP ÁN ĐƠN VỊ 1: M04 = 25, M05 = 8, M06 = 7, Total = 40 học viên.
//
// Đơn vị 2 (Sài Gòn): Nộp chính thức (SUBMITTED)
//   - Mẫu 04:
//       Chuyên đề 1: 20 học viên (10 đã học)
//       => Tổng Mẫu 04 = 20 học viên.
//   - Mẫu 05: 0 học viên.
//   - Mẫu 06: 0 học viên.
//   => ĐÁP ÁN ĐƠN VỊ 2: M04 = 20, M05 = 0, M06 = 0, Total = 20 học viên.
//
// Đơn vị 3 (Đà Nẵng): Đang soạn thảo (DRAFT)
//   - Mẫu 04:
//       Chuyên đề 1: 12 học viên.
//       => Tổng Mẫu 04 = 12 học viên.
//   => ĐÁP ÁN ĐƠN VỊ 3: M04 = 12, Total = 12 học viên (DRAFT).
//
// TỔNG TOÀN MẠNG LƯỚI (GROUND TRUTH):
//   - Tổng đơn vị = 3
//   - Đã nộp = 2 (ĐV 1 + ĐV 2)
//   - Đang soạn = 1 (ĐV 3)
//   - Tổng Mẫu 04 = 25 + 20 + 12 = 57
//   - Tổng Mẫu 05 = 8 + 0 + 0 = 8
//   - Tổng Mẫu 06 = 7 + 0 + 0 = 7
//   - Tổng người học toàn hệ thống = 57 + 8 + 7 = 72

// Nạp bài nộp Đơn vị 1
db.exec(`
  INSERT INTO training_demand_submissions (id, collection_id, unit_id, version, status, submitted_at) VALUES
  (101, 10, 1, 1, 'SUBMITTED', '2026-10-22 09:00:00');

  INSERT INTO training_demand_programs (id, submission_id, program_id) VALUES
  (1001, 101, 1),
  (1002, 101, 2);

  INSERT INTO training_demand_program_topics (demand_program_id, program_topic_id, participant_count, completed_count) VALUES
  (1001, 1, 10, 2),
  (1001, 2, 15, 5),
  (1002, 3, 8, 0);

  INSERT INTO training_demand_proposals (submission_id, proposal_name, participant_count) VALUES
  (101, 'Đề xuất phòng chống gian lận thẻ', 3),
  (101, 'Kỹ năng giao tiếp khách hàng VIP', 4);
`);

// Sinh biên nhận cho Đơn vị 1
const u1Details = calculateSubmissionParticipantsDetailed(db, 101);
const receiptCodeU1 = createSubmissionReceipt(db, {
  targetType: 'TRAINING_DEMAND',
  targetId: 101,
  unitId: 1,
  submittedBy: 2,
  totalRecords: u1Details.totalParticipants,
  metadata: { version: 1 }
});
db.prepare('UPDATE training_demand_submissions SET receipt_code = ? WHERE id = 101').run(receiptCodeU1);

// Nạp bài nộp Đơn vị 2
db.exec(`
  INSERT INTO training_demand_submissions (id, collection_id, unit_id, version, status, submitted_at) VALUES
  (102, 10, 2, 1, 'SUBMITTED', '2026-10-22 10:00:00');

  INSERT INTO training_demand_programs (id, submission_id, program_id) VALUES
  (2001, 102, 1);

  INSERT INTO training_demand_program_topics (demand_program_id, program_topic_id, participant_count, completed_count) VALUES
  (2001, 1, 20, 10);
`);

const u2Details = calculateSubmissionParticipantsDetailed(db, 102);
const receiptCodeU2 = createSubmissionReceipt(db, {
  targetType: 'TRAINING_DEMAND',
  targetId: 102,
  unitId: 2,
  submittedBy: 3,
  totalRecords: u2Details.totalParticipants,
  metadata: { version: 1 }
});
db.prepare('UPDATE training_demand_submissions SET receipt_code = ? WHERE id = 102').run(receiptCodeU2);

// Nạp bài nộp Đơn vị 3 (DRAFT)
db.exec(`
  INSERT INTO training_demand_submissions (id, collection_id, unit_id, version, status, submitted_at) VALUES
  (103, 10, 3, 1, 'DRAFT', NULL);

  INSERT INTO training_demand_programs (id, submission_id, program_id) VALUES
  (3001, 103, 1);

  INSERT INTO training_demand_program_topics (demand_program_id, program_topic_id, participant_count, completed_count) VALUES
  (3001, 1, 12, 0);
`);

// 5. Nạp dữ liệu Kỳ thi (Exam Uploads) với trường hợp lệch counter và 1 dòng trùng
// Đơn vị 1 upload file: header ghi 10 dòng (bộ đếm cũ bị sai/lệch),
// nhưng exam_records thực tế có 11 dòng (9 VALID, 2 INVALID do 1 cán bộ nộp trùng)
db.exec(`
  INSERT INTO exam_uploads (id, exam_id, unit_id, version, file_name, total_rows, valid_rows, error_rows, status, submitted_at) VALUES
  (501, 20, 1, 1, 'Danh_sach_thi_sinh_HN_v1.xlsx', 10, 8, 2, 'OFFICIAL_SUBMITTED', '2026-10-22 09:30:00');

  -- 9 dòng hợp lệ
  INSERT INTO exam_records (upload_id, exam_id, unit_id, row_index, employee_code, validation_status) VALUES
  (501, 20, 1, 1, 'CB001', 'VALID'),
  (501, 20, 1, 2, 'CB002', 'VALID'),
  (501, 20, 1, 3, 'CB003', 'VALID'),
  (501, 20, 1, 4, 'CB004', 'VALID'),
  (501, 20, 1, 5, 'CB005', 'VALID'),
  (501, 20, 1, 6, 'CB006', 'VALID'),
  (501, 20, 1, 7, 'CB007', 'VALID'),
  (501, 20, 1, 8, 'CB008', 'VALID'),
  (501, 20, 1, 9, 'CB009', 'VALID'),
  -- 2 dòng lỗi (1 dòng trùng mã CB009 và 1 dòng sai mã)
  (501, 20, 1, 10, 'CB009', 'INVALID'),
  (501, 20, 1, 11, 'CB_ERROR', 'INVALID');

  INSERT INTO validation_errors (upload_id, record_id, severity, error_message) VALUES
  (501, 10, 'ERROR', 'Trùng mã cán bộ trong file'),
  (501, 11, 'ERROR', 'Mã cán bộ không tồn tại');
`);

console.log('-> Đã nạp dữ liệu kiểm thử xong.');

// =========================================================================
// KIỂM THỬ 1: RÀNG BUỘC UNIQUE KHÔNG CHO PHÉP NHÂN BẢN
// =========================================================================
console.log('\n[TEST 1] Kiểm tra ràng buộc UNIQUE:');
let uqFailed = false;
try {
  // Cố tình chèn trùng cặp (collection_id: 10, unit_id: 1)
  db.exec(`
    INSERT INTO training_demand_submissions (collection_id, unit_id, version, status)
    VALUES (10, 1, 2, 'DRAFT');
  `);
} catch (e: any) {
  uqFailed = true;
  console.log('  ✅ Đã chặn thành công bản ghi trùng (collection_id, unit_id):', e.message);
}
assert.strictEqual(uqFailed, true, 'Ràng buộc UNIQUE(collection_id, unit_id) phải từ chối bản ghi trùng');

let uqExamFailed = false;
try {
  // Cố tình chèn trùng (exam_id: 20, unit_id: 1, version: 1)
  db.exec(`
    INSERT INTO exam_uploads (exam_id, unit_id, version, file_name, status)
    VALUES (20, 1, 1, 'Duplicate_version.xlsx', 'STAGING');
  `);
} catch (e: any) {
  uqExamFailed = true;
  console.log('  ✅ Đã chặn thành công bản ghi trùng (exam_id, unit_id, version):', e.message);
}
assert.strictEqual(uqExamFailed, true, 'Ràng buộc UNIQUE(exam_id, unit_id, version) phải từ chối bản ghi trùng');

// =========================================================================
// KIỂM THỬ 2: TÍNH LẠI BỘ ĐẾM AUTHORITATIVE TỪ EXAM_RECORDS
// =========================================================================
console.log('\n[TEST 2] Kiểm tra tính lại bộ đếm exam_uploads trực tiếp từ exam_records:');
const uploadsMap = getAuthoritativeUploadsByUnit(db, 20);
const u1Upload = uploadsMap.get(1);

assert(u1Upload, 'Phải tìm thấy upload của Đơn vị 1');
console.log(`  Header ghi: total_rows = 10, valid_rows = 8, error_rows = 2`);
console.log(`  Thực tế exam_records: totalRows = ${u1Upload.totalRows}, validRows = ${u1Upload.validRows}, errorRows = ${u1Upload.errorRows}`);

assert.strictEqual(u1Upload.totalRows, 11, 'totalRows phải đếm lại đúng 11 bản ghi từ exam_records');
assert.strictEqual(u1Upload.validRows, 9, 'validRows phải đếm lại đúng 9 bản ghi VALID');
assert.strictEqual(u1Upload.errorRows, 2, 'errorRows phải đếm lại đúng 2 bản ghi INVALID');
console.log('  ✅ Bộ đếm thực tế đã được tính lại tự động chính xác từ bảng con.');

// =========================================================================
// KIỂM THỬ 3: ĐỐI SOÁT SỐ LIỆU ĐƠN VỊ 1 GIỮA BIÊN NHẬN VÀ AGGREGATION
// =========================================================================
console.log('\n[TEST 3] Đối soát số liệu Đơn vị 1 (Hà Nội):');
const u1Agg = calculateSubmissionParticipantsDetailed(db, 101);
const receiptU1 = getReceiptByCode(db, receiptCodeU1);
const receiptParticipants = calculateTrainingDemandParticipants(db, 101);

console.log(`  Aggregation Module: Mẫu 04 = ${u1Agg.m04Participants}, Mẫu 05 = ${u1Agg.m05Participants}, Mẫu 06 = ${u1Agg.m06Participants}, Total = ${u1Agg.totalParticipants}`);
console.log(`  Biên nhận (Receipt total_records): ${receiptU1?.totalRecords}`);
console.log(`  Hàm calculateTrainingDemandParticipants: ${receiptParticipants}`);

// Ground Truth Đơn vị 1: M04=25, M05=8, M06=7, Total=40
assert.strictEqual(u1Agg.m04Participants, 25, 'Mẫu 04 Đơn vị 1 phải bằng 25');
assert.strictEqual(u1Agg.m05Participants, 8, 'Mẫu 05 Đơn vị 1 phải bằng 8');
assert.strictEqual(u1Agg.m06Participants, 7, 'Mẫu 06 Đơn vị 1 phải bằng 7');
assert.strictEqual(u1Agg.totalParticipants, 40, 'Tổng người học Đơn vị 1 phải bằng 40');
assert.strictEqual(receiptU1?.totalRecords, 40, 'Số trên biên nhận phải bằng 40');
assert.strictEqual(receiptParticipants, 40, 'calculateTrainingDemandParticipants phải bằng 40');
console.log('  ✅ Số trên Biên nhận == Số trên Aggregation == Ground Truth (40 học viên)');

// =========================================================================
// KIỂM THỬ 4: ĐỐI SOÁT TOÀN HỆ THỐNG GIỮA DASHBOARD VÀ GROUND TRUTH
// =========================================================================
console.log('\n[TEST 4] Đối soát Dashboard Admin toàn hệ thống (Single Source of Truth):');
const sysMetrics = getSystemDashboardMetrics(db, {
  collectionId: 10,
  examId: 20
});

console.log(`  Tổng số đơn vị: ${sysMetrics.totalUnitsCount} (Kỳ vọng: 3)`);
console.log(`  Đã nộp: ${sysMetrics.trainingMetrics.submittedCount} (Kỳ vọng: 2)`);
console.log(`  Đang soạn: ${sysMetrics.trainingMetrics.draftCount} (Kỳ vọng: 1)`);
console.log(`  Mẫu 04 toàn mạng lưới: ${sysMetrics.trainingMetrics.m04TotalParticipants} (Kỳ vọng: 57)`);
console.log(`  Mẫu 05 toàn mạng lưới: ${sysMetrics.trainingMetrics.m05TotalParticipants} (Kỳ vọng: 8)`);
console.log(`  Mẫu 06 toàn mạng lưới: ${sysMetrics.trainingMetrics.m06TotalParticipants} (Kỳ vọng: 7)`);
console.log(`  Tổng người học kết hợp: ${sysMetrics.trainingMetrics.totalCombinedParticipants} (Kỳ vọng: 72)`);

assert.strictEqual(sysMetrics.totalUnitsCount, 3, 'Tổng số đơn vị phải là 3');
assert.strictEqual(sysMetrics.trainingMetrics.submittedCount, 2, 'Số đơn vị đã nộp phải là 2');
assert.strictEqual(sysMetrics.trainingMetrics.draftCount, 1, 'Số đơn vị đang soạn phải là 1');
assert.strictEqual(sysMetrics.trainingMetrics.m04TotalParticipants, 57, 'Tổng Mẫu 04 toàn hệ thống phải là 57');
assert.strictEqual(sysMetrics.trainingMetrics.m05TotalParticipants, 8, 'Tổng Mẫu 05 toàn hệ thống phải là 8');
assert.strictEqual(sysMetrics.trainingMetrics.m06TotalParticipants, 7, 'Tổng Mẫu 06 toàn hệ thống phải là 7');
assert.strictEqual(sysMetrics.trainingMetrics.totalCombinedParticipants, 72, 'Tổng toàn hệ thống phải là 72');

// =========================================================================
// KIỂM THỬ 5: BÁO CÁO EXCEL TỔNG HỢP VÀ DASHBOARD ĐỒNG NHẤT 100%
// =========================================================================
console.log('\n[TEST 5] Đối soát Báo cáo Export Excel với Dashboard:');
const trainingMetricsMap = getTrainingDemandMetricsByUnit(db, 10);
let excelSumM04 = 0;
let excelSumM05 = 0;
let excelSumM06 = 0;
let excelSumTotal = 0;

for (const m of trainingMetricsMap.values()) {
  excelSumM04 += m.m04Participants;
  excelSumM05 += m.m05Participants;
  excelSumM06 += m.m06Participants;
  excelSumTotal += m.totalParticipantsCombined;
}

console.log(`  Tổng hợp Sheet Excel: M04 = ${excelSumM04}, M05 = ${excelSumM05}, M06 = ${excelSumM06}, Total = ${excelSumTotal}`);
assert.strictEqual(excelSumM04, sysMetrics.trainingMetrics.m04TotalParticipants, 'M04 Excel phải khớp Dashboard');
assert.strictEqual(excelSumM05, sysMetrics.trainingMetrics.m05TotalParticipants, 'M05 Excel phải khớp Dashboard');
assert.strictEqual(excelSumM06, sysMetrics.trainingMetrics.m06TotalParticipants, 'M06 Excel phải khớp Dashboard');
assert.strictEqual(excelSumTotal, sysMetrics.trainingMetrics.totalCombinedParticipants, 'Total Excel phải khớp Dashboard');

console.log('  ✅ Dashboard count == Exported Excel count == Receipt count == Ground Truth (72 học viên, 0 chênh lệch).');

console.log('\n' + '='.repeat(80));
console.log('TẤT CẢ CÁC CA KIỂM THỬ P6 ĐỀU ĐẠT CHUẨN 100% (PASS)!');
console.log('='.repeat(80));
