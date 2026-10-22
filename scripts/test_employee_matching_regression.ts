import { DatabaseSync } from 'node:sqlite';
import { validateCandidateBatch } from '../src/lib/validation';
import { 
  normalizeEmployeeCode, 
  normalizeElearning, 
  normalizeFullName, 
  normalizeNameForComparison, 
  stripLeadingZeros 
} from '../src/lib/normalization';
import { ParsedRowData } from '../src/lib/excel';

console.log('=== CHẠY BỘ KIỂM THỬ HỒI QUY (REGRESSION TESTS) VỀ NHẬN DẠNG CÁN BỘ ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - Chi tiết: ${detail}` : ''}`);
    failCount++;
  }
}

// Thiết lập DB in-memory độc lập cho bài test
const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code VARCHAR(50) NOT NULL UNIQUE,
    elearning_account VARCHAR(100) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    unit_code VARCHAR(50),
    unit_name VARCHAR(150),
    status VARCHAR(20) DEFAULT 'ACTIVE'
  );

  CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT INTO employees (id, employee_code, elearning_account, full_name, unit_code, unit_name, status)
  VALUES 
    (1, '200733604', 'hantt', 'Nguyễn Thị Thu Hà', '8802', 'Chi nhánh Hà Nội', 'ACTIVE'),
    (2, 'NV008899', 'hungcm', 'Chu Mạnh Hùng', '8802', 'Chi nhánh Hà Nội', 'ACTIVE'),
    (3, '012345', 'minhnv', 'Nguyễn Văn Minh', '8803', 'Chi nhánh TP HCM', 'ACTIVE'),
    (4, 'INACTIVE01', 'nghi_viec', 'Trần Văn Nghỉ', '8802', 'Chi nhánh Hà Nội', 'INACTIVE');
`);

// ----------------------------------------------------
// TEST 1: Chuẩn hóa cơ bản (normalizeEmployeeCode, normalizeElearning)
// ----------------------------------------------------
{
  const codeNBSP = '200733604\u00A0';
  const codeZeroWidth = '\u200B200733604';
  const codeBOM = '\uFEFF200733604';
  const codeFullWidth = '２００７３３６０４';
  const codeLower = 'nv008899';

  assert(normalizeEmployeeCode(codeNBSP) === '200733604', 'Test 1.1: Bỏ NBSP ở mã cán bộ');
  assert(normalizeEmployeeCode(codeZeroWidth) === '200733604', 'Test 1.2: Bỏ Zero-width space ở mã cán bộ');
  assert(normalizeEmployeeCode(codeBOM) === '200733604', 'Test 1.3: Bỏ BOM ở mã cán bộ');
  assert(normalizeEmployeeCode(codeFullWidth) === '200733604', 'Test 1.4: Chuyển full-width số sang half-width');
  assert(normalizeEmployeeCode(codeLower) === 'NV008899', 'Test 1.5: Chuyển chữ thường sang hoa ở mã cán bộ');

  const elearnMessy = '  \u200BHanTT\u00A0 ';
  assert(normalizeElearning(elearnMessy) === 'hantt', 'Test 1.6: Chuẩn hóa eLearning (chữ thường, bỏ khoảng trắng & ký tự ẩn)');
}

// ----------------------------------------------------
// TEST 2: Khớp mã chứa ký tự ẩn & full-width qua Validation Engine
// ----------------------------------------------------
{
  const rows: ParsedRowData[] = [
    {
      rowIndex: 2,
      employeeCode: '２００７３３６０４\u200B', // Full-width + Zero-width
      elearningAccount: ' HanTT\u00A0', // Hoa + khoảng trắng + NBSP
      fullName: 'Nguyễn Thị Thu Hà',
      rawData: {},
      isCandidateRow: true
    }
  ];

  const valRes = validateCandidateBatch(db, rows, '8802');
  const rec = valRes.records[0];

  assert(rec.status === 'VALID', 'Test 2.1: Nhận diện thành công cán bộ khi mã full-width + zero-width + eLearning lệch hoa/thường');
  assert(rec.employeeId === 1, 'Test 2.2: Gán đúng employee_id = 1', `Thực tế: ${rec.employeeId}`);
  assert(rec.unitCodeAtValidation === '8802', 'Test 2.3: Gán đúng unit_code_at_validation = 8802', `Thực tế: ${rec.unitCodeAtValidation}`);
}

// ----------------------------------------------------
// TEST 3: Khớp mã khác nhau ở số 0 đầu ("0200733604" vs "200733604")
// ----------------------------------------------------
{
  // Master DB có '200733604', thí sinh nộp '0200733604'
  const rows: ParsedRowData[] = [
    {
      rowIndex: 2,
      employeeCode: '0200733604',
      elearningAccount: 'hantt',
      fullName: 'Nguyễn Thị Thu Hà',
      rawData: {},
      isCandidateRow: true
    }
  ];

  const valRes = validateCandidateBatch(db, rows, '8802');
  const rec = valRes.records[0];

  assert(rec.status === 'VALID', 'Test 3.1: Vẫn tính là VALID khi khớp qua chuẩn hóa số 0 đầu');
  assert(rec.employeeId === 1, 'Test 3.2: Gán đúng employee_id = 1 khi bỏ số 0 đầu');
  const hasZeroWarning = rec.errors.some(e => e.errorType === 'LEADING_ZERO_NORMALIZED' && e.severity === 'WARNING');
  assert(hasZeroWarning, 'Test 3.3: Ghi nhận đúng WARNING LEADING_ZERO_NORMALIZED');
}

// ----------------------------------------------------
// TEST 4: Trường hợp ngược lại: Master DB có "012345", thí sinh nộp "12345"
// ----------------------------------------------------
{
  const rows: ParsedRowData[] = [
    {
      rowIndex: 2,
      employeeCode: '12345',
      elearningAccount: 'minhnv',
      fullName: 'Nguyễn Văn Minh',
      rawData: {},
      isCandidateRow: true
    }
  ];

  const valRes = validateCandidateBatch(db, rows, '8803');
  const rec = valRes.records[0];

  assert(rec.status === 'VALID', 'Test 4.1: Khớp thành công khi Master có số 0 đầu nhưng thí sinh nộp thiếu số 0');
  assert(rec.employeeId === 3, 'Test 4.2: Gán đúng employee_id = 3');
  const hasZeroWarning = rec.errors.some(e => e.errorType === 'LEADING_ZERO_NORMALIZED');
  assert(hasZeroWarning, 'Test 4.3: Ghi nhận WARNING LEADING_ZERO_NORMALIZED');
}

// ----------------------------------------------------
// TEST 5: Phòng chống xung đột số 0 đầu trong Master DB
// ----------------------------------------------------
{
  // Giả lập DB có 2 cán bộ trùng mã sau khi bỏ số 0: '0099' và '99'
  const collisionDb = new DatabaseSync(':memory:');
  collisionDb.exec(`
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY,
      employee_code VARCHAR(50),
      elearning_account VARCHAR(100),
      full_name VARCHAR(150),
      unit_code VARCHAR(50),
      unit_name VARCHAR(150),
      status VARCHAR(20) DEFAULT 'ACTIVE'
    );
    INSERT INTO employees VALUES 
      (10, '0099', 'user_a', 'Cán bộ A', '8802', 'Chi nhánh Hà Nội', 'ACTIVE'),
      (11, '99', 'user_b', 'Cán bộ B', '8802', 'Chi nhánh Hà Nội', 'ACTIVE');
  `);

  // Thí sinh nộp '099'
  const rows: ParsedRowData[] = [
    {
      rowIndex: 2,
      employeeCode: '099',
      elearningAccount: 'user_a',
      fullName: 'Cán bộ A',
      rawData: {},
      isCandidateRow: true
    }
  ];

  const valRes = validateCandidateBatch(collisionDb, rows, '8802');
  const rec = valRes.records[0];
  // Vì Master có cả 0099 và 99 (xung đột khi bỏ số 0 đầu), hệ thống KHÔNG ĐƯỢC tự ý đoán bừa
  assert(rec.status === 'INVALID', 'Test 5.1: Không tự ý bỏ số 0 đầu khi Master tồn tại 2 mã xung đột');
}

// ----------------------------------------------------
// TEST 6: Đối chiếu Họ và tên (NAME_MISMATCH)
// ----------------------------------------------------
{
  // 6a: Tên sai lệch hẳn
  const rowsDiffName: ParsedRowData[] = [
    {
      rowIndex: 2,
      employeeCode: '200733604',
      elearningAccount: 'hantt',
      fullName: 'Trần Thị Bích Ngọc', // Lệch họ tên
      rawData: {},
      isCandidateRow: true
    }
  ];

  const resDiff = validateCandidateBatch(db, rowsDiffName, '8802');
  const recDiff = resDiff.records[0];

  assert(recDiff.status === 'VALID', 'Test 6.1: Lệch họ tên KHÔNG CHẶN nộp (status vẫn VALID)');
  const hasNameWarning = recDiff.errors.some(e => e.errorType === 'NAME_MISMATCH' && e.severity === 'WARNING');
  assert(hasNameWarning, 'Test 6.2: Ghi nhận đúng WARNING NAME_MISMATCH khi họ tên khác biệt');

  // 6b: Tên chỉ khác dấu/hoa thường/khoảng trắng thừa -> KHÔNG BÁO LỖI
  const rowsSameNameDiffFormat: ParsedRowData[] = [
    {
      rowIndex: 3,
      employeeCode: '200733604',
      elearningAccount: 'hantt',
      fullName: '  NGUYEN   THI THU HA  ', // Không dấu, chữ hoa, khoảng trắng thừa
      rawData: {},
      isCandidateRow: true
    }
  ];

  const resSame = validateCandidateBatch(db, rowsSameNameDiffFormat, '8802');
  const recSame = resSame.records[0];
  const hasUnexpectedNameWarning = recSame.errors.some(e => e.errorType === 'NAME_MISMATCH');
  assert(!hasUnexpectedNameWarning, 'Test 6.3: Tên chỉ khác chữ hoa/thường, không dấu, khoảng trắng thừa thì KHÔNG phát sinh cảnh báo');
}

console.log(`\n====================================================`);
console.log(`KẾT QUẢ KIỂM THỬ: ${passCount} PASS, ${failCount} FAIL`);
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('TẤT CẢ 15/15 CA KIỂM THỬ HỒI QUY ĐÃ VƯỢT QUA HOÀN TOÀN!');
}
