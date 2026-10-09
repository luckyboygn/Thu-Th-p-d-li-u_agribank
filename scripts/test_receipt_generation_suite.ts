import { DatabaseSync } from 'node:sqlite';
import { generateReceiptCode, createSubmissionReceipt, getReceiptByCode } from '../src/lib/receipt';

async function runReceiptTests() {
  console.log('--- TEST SUITE: SUBMISSION RECEIPTS & VERIFICATION (MỤC 2.2) ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      process.exitCode = 1;
    }
  }

  // Khởi tạo DB in-memory để test
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_code TEXT UNIQUE NOT NULL,
      unit_name TEXT NOT NULL
    );

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      unit_id INTEGER
    );

    CREATE TABLE submission_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_code TEXT UNIQUE NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      submitted_by INTEGER NOT NULL,
      approved_by INTEGER,
      total_records INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO units (id, unit_code, unit_name) VALUES (1, 'CN_HOANGMAI', 'Chi nhánh Hoàng Mai');
    INSERT INTO units (id, unit_code, unit_name) VALUES (2, 'CN_DONGDA', 'Chi nhánh Đống Đa');

    INSERT INTO users (id, username, full_name, role, unit_id) VALUES (10, 'maker_hm', 'Nguyễn Văn Lập', 'UNIT_PREPARER', 1);
    INSERT INTO users (id, username, full_name, role, unit_id) VALUES (11, 'approver_hm', 'Trần Thị Duyệt', 'UNIT_APPROVER', 1);
    INSERT INTO users (id, username, full_name, role, unit_id) VALUES (20, 'maker_dd', 'Lê Văn Đống Đa', 'UNIT_ADMIN', 2);
  `);

  // Test 1: Sinh mã biên nhận có đúng format
  const code1 = generateReceiptCode('CN_HOANGMAI', 'EXAM_UPLOAD', 101, 1717000000000);
  assert(code1.startsWith('AGR-CN_HOANGMAI-EXAM-101-'), `Format mã biên nhận hợp lệ: ${code1}`);
  const parts = code1.split('-');
  assert(parts.length === 6, `Mã biên nhận có 6 phần chuẩn: ${code1}`);
  const checksum = parts[5];
  assert(checksum.length === 4, `Checksum 4 ký tự: ${checksum}`);

  // Test 2: Lưu biên nhận vào database
  const receiptCode = createSubmissionReceipt(db, {
    targetType: 'EXAM_UPLOAD',
    targetId: 101,
    unitId: 1,
    submittedBy: 10,
    approvedBy: 11,
    totalRecords: 85,
    metadata: {
      title: 'Kỳ thi Sát hạch Tín dụng 2026',
      fileName: 'Danh_sach_Hoang_Mai.xlsx'
    }
  });
  assert(receiptCode.startsWith('AGR-CN_HOANGMAI-EXAM-101-'), `Đã tạo biên nhận thành công: ${receiptCode}`);

  // Test 3: Tra cứu biên nhận qua getReceiptByCode
  const receipt = getReceiptByCode(db, receiptCode);
  assert(receipt !== null, 'Tìm thấy biên nhận theo mã');
  assert(receipt?.unitCode === 'CN_HOANGMAI', 'Đúng mã đơn vị');
  assert(receipt?.unitName === 'Chi nhánh Hoàng Mai', 'Đúng tên đơn vị');
  assert(receipt?.totalRecords === 85, 'Đúng số lượng bản ghi (85)');
  assert(receipt?.submittedByName === 'Nguyễn Văn Lập', 'Đúng người lập');
  assert(receipt?.approvedByName === 'Trần Thị Duyệt', 'Đúng người duyệt');
  assert(receipt?.title === 'Kỳ thi Sát hạch Tín dụng 2026', 'Đúng tiêu đề kỳ thi trong metadata');

  // Test 4: Tra cứu biên nhận không tồn tại trả về null
  const notFound = getReceiptByCode(db, 'AGR-FAKE-CODE-999-0000');
  assert(notFound === null, 'Mã không tồn tại trả về null');

  // Test 5: Biên nhận Khảo sát đào tạo
  const demandReceiptCode = createSubmissionReceipt(db, {
    targetType: 'TRAINING_DEMAND',
    targetId: 202,
    unitId: 2,
    submittedBy: 20,
    approvedBy: 20,
    totalRecords: 120,
    metadata: {
      title: 'Đợt khảo sát nhu cầu đào tạo Q2/2026'
    }
  });
  const demandReceipt = getReceiptByCode(db, demandReceiptCode);
  assert(demandReceipt?.targetType === 'TRAINING_DEMAND', 'Đúng loại TRAINING_DEMAND');
  assert(demandReceipt?.unitCode === 'CN_DONGDA', 'Đúng mã chi nhánh Đống Đa');
  assert(demandReceipt?.totalRecords === 120, 'Đúng số lượng 120');

  console.log(`\n=> KẾT QUẢ: ${passed}/${total} TESTS ĐẠT.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runReceiptTests().catch(err => {
  console.error('Lỗi khi chạy test suite:', err);
  process.exit(1);
});
