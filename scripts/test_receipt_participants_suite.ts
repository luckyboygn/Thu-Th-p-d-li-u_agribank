import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import {
  calculateTrainingDemandParticipants,
  getTrainingDemandProgramsSummary,
  createSubmissionReceipt,
  getReceiptByCode,
  getReceiptByTarget
} from '../src/lib/receipt';

// Dùng SQLite in-memory để kiểm thử độc lập, không làm ảnh hưởng DB thật
const db = new DatabaseSync(':memory:');

// Khởi tạo các bảng cần thiết
db.exec(`
  CREATE TABLE units (
    id INTEGER PRIMARY KEY,
    unit_code TEXT,
    unit_name TEXT
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    full_name TEXT
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
    group_name TEXT
  );

  CREATE TABLE training_program_topics (
    id INTEGER PRIMARY KEY,
    program_id INTEGER,
    topic_name TEXT
  );

  CREATE TABLE training_demand_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER,
    unit_id INTEGER,
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'DRAFT',
    submitted_by INTEGER,
    approved_by INTEGER,
    receipt_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE training_demand_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER,
    program_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE training_demand_program_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demand_program_id INTEGER,
    program_topic_id INTEGER,
    participant_count INTEGER DEFAULT 0,
    topic_name_snapshot TEXT,
    delivery_method_snapshot TEXT,
    duration_snapshot TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE training_demand_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER,
    proposal_name TEXT,
    target_audience TEXT,
    participant_count INTEGER DEFAULT 0,
    expected_duration TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE submission_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_code TEXT UNIQUE,
    target_type TEXT,
    target_id INTEGER,
    unit_id INTEGER,
    submitted_by INTEGER,
    approved_by INTEGER,
    total_records INTEGER DEFAULT 0,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insert dữ liệu mẫu: Chi nhánh Bến Thành (1090)
db.exec(`
  INSERT INTO units (id, unit_code, unit_name) VALUES (1090, '1090', 'Agribank Chi nhánh Bến Thành');
  INSERT INTO users (id, username, full_name) VALUES (1, 'approver_1090', 'Agribank Chi nhánh Bến Thành');
  INSERT INTO collections (id, code, title, status) VALUES (1, 'KHAO_SAT_2027', 'Khảo sát & Thu thập Dữ liệu Năm 2027', 'OPEN');

  INSERT INTO training_programs (id, code, name, group_name) VALUES 
    (10, 'CT_TINDUNG', 'Nghiệp vụ Tín dụng Nâng cao', 'Khối Tín dụng'),
    (11, 'CT_THANHTOAN', 'Thanh toán Quốc tế & Tài trợ Thương mại', 'Khối Vận hành');

  INSERT INTO training_program_topics (id, program_id, topic_name) VALUES
    (101, 10, 'Chuyên đề Thẩm định Tài sản'),
    (102, 10, 'Chuyên đề Quản trị Rủi ro'),
    (103, 11, 'Chuyên đề L/C Điện tử');
`);

console.log('================================================================');
console.log('   BẮT ĐẦU KIỂM THỬ: TÍNH TOÁN & HIỂN THỊ BIÊN NHẬN ĐÀO TẠO');
console.log('================================================================');

// 1. Tạo submission ID 145 cho Bến Thành
db.exec(`
  INSERT INTO training_demand_submissions (id, collection_id, unit_id, status, submitted_by, approved_by)
  VALUES (145, 1, 1090, 'SUBMITTED', 1, 1);

  -- Program 10: 25 + 15 = 40 lượt
  INSERT INTO training_demand_programs (id, submission_id, program_id) VALUES (501, 145, 10);
  INSERT INTO training_demand_program_topics (demand_program_id, program_topic_id, participant_count) VALUES
    (501, 101, 25),
    (501, 102, 15);

  -- Program 11: 30 lượt
  INSERT INTO training_demand_programs (id, submission_id, program_id) VALUES (502, 145, 11);
  INSERT INTO training_demand_program_topics (demand_program_id, program_topic_id, participant_count) VALUES
    (502, 103, 30);

  -- Proposal ngoài khung: 10 lượt
  INSERT INTO training_demand_proposals (submission_id, proposal_name, participant_count) VALUES
    (145, 'Chuyên đề AI trong Ngân hàng', 10);
`);

// TEST 1: calculateTrainingDemandParticipants
const total = calculateTrainingDemandParticipants(db, 145);
console.log(`[TEST 1] Tổng lượt học viên tính được: ${total} (Kỳ vọng: 40 + 30 + 10 = 80)`);
if (total === 80) {
  console.log('-> PASS: calculateTrainingDemandParticipants tính chuẩn xác 80 lượt học viên!');
} else {
  throw new Error(`TEST 1 FAILED: Mong đợi 80 nhưng nhận được ${total}`);
}

// TEST 2: getTrainingDemandProgramsSummary
const summary = getTrainingDemandProgramsSummary(db, 145);
console.log(`[TEST 2] Tóm tắt chương trình:`, summary);
if (summary.length === 2 && summary[0].participants === 40 && summary[1].participants === 30) {
  console.log('-> PASS: getTrainingDemandProgramsSummary trả về đúng 2 chương trình với số lượt chi tiết!');
} else {
  throw new Error('TEST 2 FAILED: Tóm tắt chương trình không đúng.');
}

// TEST 3: Giả lập biên nhận cũ bị lưu sai total_records = 0 (tương tự như ảnh của người dùng)
const legacyReceiptCode = 'AGR-1090-DEMAND-145-1A1331D767C-D0CF';
db.prepare(`
  INSERT INTO submission_receipts (receipt_code, target_type, target_id, unit_id, submitted_by, approved_by, total_records, metadata)
  VALUES (?, 'TRAINING_DEMAND', 145, 1090, 1, 1, 0, ?)
`).run(legacyReceiptCode, JSON.stringify({ title: 'Khảo sát & Thu thập Dữ liệu Năm 2027' }));

// Tra cứu lại biên nhận này qua getReceiptByCode
const healedReceipt = getReceiptByCode(db, legacyReceiptCode);
console.log(`[TEST 3] Biên nhận sau khi tra cứu: totalRecords = ${healedReceipt?.totalRecords}`);
if (healedReceipt && healedReceipt.totalRecords === 80) {
  console.log('-> PASS: Cơ chế Self-Healing đã tự động phục hồi totalRecords từ 0 thành 80 lượt học viên thành công!');
} else {
  throw new Error(`TEST 3 FAILED: totalRecords không phục hồi đúng (${healedReceipt?.totalRecords})`);
}

// Kiểm tra DB xem total_records trong bảng submission_receipts đã được cập nhật chưa
const dbCheck = db.prepare('SELECT total_records FROM submission_receipts WHERE receipt_code = ?').get(legacyReceiptCode) as any;
if (dbCheck.total_records === 80) {
  console.log('-> PASS: Bảng submission_receipts trong DB đã được tự động UPDATE lại thành 80 bản ghi!');
} else {
  throw new Error(`TEST 3 DB Check FAILED: DB vẫn là ${dbCheck.total_records}`);
}

// TEST 4: getReceiptByTarget khi tạo mới
db.exec(`
  INSERT INTO training_demand_submissions (id, collection_id, unit_id, status, submitted_by, approved_by)
  VALUES (146, 1, 1090, 'SUBMITTED', 1, 1);
  INSERT INTO training_demand_programs (id, submission_id, program_id) VALUES (503, 146, 10);
  INSERT INTO training_demand_program_topics (demand_program_id, program_topic_id, participant_count) VALUES (503, 101, 12);
`);
const targetReceipt = getReceiptByTarget(db, 'TRAINING_DEMAND', 146);
console.log(`[TEST 4] getReceiptByTarget: totalRecords = ${targetReceipt?.totalRecords}`);
if (targetReceipt && targetReceipt.totalRecords === 12) {
  console.log('-> PASS: getReceiptByTarget sinh biên nhận mới chính xác với 12 lượt học viên!');
} else {
  throw new Error(`TEST 4 FAILED: targetReceipt = ${targetReceipt?.totalRecords}`);
}

console.log('================================================================');
console.log('   TẤT CẢ 4/4 KIỂM THỬ ĐÃ ĐẠT (100% PASS) - SẴN SÀNG TRIỂN KHAI');
console.log('================================================================');
