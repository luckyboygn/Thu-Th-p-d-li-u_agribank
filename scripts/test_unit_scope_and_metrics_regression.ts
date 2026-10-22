import { DatabaseSync } from 'node:sqlite';
import { 
  normalizeUnitCode, 
  isUnitInScope, 
  getParticipatingUnits, 
  PARTICIPATING_UNIT_TYPES 
} from '../src/lib/units';
import { validateCandidateBatch } from '../src/lib/validation';
import { ParsedRowData } from '../src/lib/excel';

console.log('=== CHẠY BỘ TEST HỒI QUY: PHẠM VI ĐƠN VỊ VÀ MẪU SỐ TIẾN ĐỘ ===\n');

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

// ----------------------------------------------------
// TEST 1: Chuẩn hóa Mã đơn vị (normalizeUnitCode)
// ----------------------------------------------------
{
  assert(normalizeUnitCode(' 8802 \u200B') === '8802', 'Test 1.1: Bỏ khoảng trắng & zero-width space ở mã đơn vị');
  assert(normalizeUnitCode('８８０２') === '8802', 'Test 1.2: Chuyển full-width số sang half-width ASCII');
  assert(normalizeUnitCode('cn_hanoi\u00A0') === 'CN_HANOI', 'Test 1.3: Chuyển chữ hoa và bỏ NBSP');
}

// ----------------------------------------------------
// TEST 2: Hàm isUnitInScope (Chế độ EXACT_ONLY vs INCLUDE_SUBSIDIARIES)
// ----------------------------------------------------
{
  const testDb = new DatabaseSync(':memory:');
  testDb.exec(`
    CREATE TABLE units (
      id INTEGER PRIMARY KEY,
      unit_code VARCHAR(50),
      unit_name VARCHAR(150),
      unit_type VARCHAR(50),
      parent_unit_id INTEGER
    );
    INSERT INTO units VALUES
      (1, '8802', 'Chi nhánh Hà Nội (Loại 1)', 'BRANCH_L1', NULL),
      (2, '880201', 'Chi nhánh Cầu Giấy (Loại 2)', 'BRANCH_L2', 1),
      (3, '88020101', 'PGD Dịch Vọng (Thuộc Cầu Giấy)', 'BRANCH_L2', 2),
      (4, '8803', 'Chi nhánh Hà Tây (Loại 1)', 'BRANCH_L1', NULL);
  `);

  // EXACT_ONLY
  assert(
    isUnitInScope(testDb, '8802', '8802', 'EXACT_ONLY') === true,
    'Test 2.1: EXACT_ONLY - Cùng mã đơn vị -> TRUE'
  );
  assert(
    isUnitInScope(testDb, '8802', '880201', 'EXACT_ONLY') === false,
    'Test 2.2: EXACT_ONLY - Cán bộ thuộc đơn vị con -> FALSE'
  );

  // INCLUDE_SUBSIDIARIES
  assert(
    isUnitInScope(testDb, '8802', '880201', 'INCLUDE_SUBSIDIARIES') === true,
    'Test 2.3: INCLUDE_SUBSIDIARIES - CN Cha (8802) nộp cho CN Con (880201) -> TRUE'
  );
  assert(
    isUnitInScope(testDb, '8802', '88020101', 'INCLUDE_SUBSIDIARIES') === true,
    'Test 2.4: INCLUDE_SUBSIDIARIES - CN Cha (8802) nộp cho PGD Cháu (88020101) đa cấp -> TRUE'
  );
  assert(
    isUnitInScope(testDb, '8802', '8803', 'INCLUDE_SUBSIDIARIES') === false,
    'Test 2.5: INCLUDE_SUBSIDIARIES - CN Khác không cùng nhánh (8803) -> FALSE'
  );
}

// ----------------------------------------------------
// TEST 3: Validation Engine tôn trọng unit_scope_mode từ system_settings
// ----------------------------------------------------
{
  const valDb = new DatabaseSync(':memory:');
  valDb.exec(`
    CREATE TABLE units (
      id INTEGER PRIMARY KEY,
      unit_code VARCHAR(50),
      unit_name VARCHAR(150),
      unit_type VARCHAR(50),
      parent_unit_id INTEGER
    );
    INSERT INTO units VALUES
      (1, '8802', 'CN Hà Nội (L1)', 'BRANCH_L1', NULL),
      (2, '880201', 'PGD Cầu Giấy (L2)', 'BRANCH_L2', 1);

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
      (10, '20070001', 'canbo_con', 'Nguyễn Cán Bộ Con', '880201', 'PGD Cầu Giấy', 'ACTIVE');

    CREATE TABLE system_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row: ParsedRowData = {
    rowIndex: 2,
    employeeCode: '20070001',
    elearningAccount: 'canbo_con',
    fullName: 'Nguyễn Cán Bộ Con',
    rawData: {},
    isCandidateRow: true
  };

  // 3a. Mặc định (EXACT_ONLY): Cảnh báo UNIT_MISMATCH
  const resExact = validateCandidateBatch(valDb, [row], '8802');
  assert(
    resExact.records[0].errors.some(e => e.errorType === 'UNIT_MISMATCH'),
    'Test 3.1: Ở chế độ mặc định (EXACT_ONLY), nộp cán bộ đơn vị con có phát sinh cảnh báo UNIT_MISMATCH'
  );

  // 3b. Khi cấu hình INCLUDE_SUBSIDIARIES: KHÔNG cảnh báo UNIT_MISMATCH
  valDb.exec("INSERT INTO system_settings (key, value) VALUES ('unit_scope_mode', 'INCLUDE_SUBSIDIARIES');");
  const resSubs = validateCandidateBatch(valDb, [row], '8802');
  assert(
    !resSubs.records[0].errors.some(e => e.errorType === 'UNIT_MISMATCH'),
    'Test 3.2: Khi cấu hình unit_scope_mode=INCLUDE_SUBSIDIARIES, nộp cán bộ đơn vị trực thuộc KHÔNG bị cảnh báo UNIT_MISMATCH'
  );
}

// ----------------------------------------------------
// TEST 4: Danh mục Đơn vị tham gia khảo sát (getParticipatingUnits)
// ----------------------------------------------------
{
  const scopeDb = new DatabaseSync(':memory:');
  scopeDb.exec(`
    CREATE TABLE units (
      id INTEGER PRIMARY KEY,
      unit_code VARCHAR(50),
      unit_name VARCHAR(150),
      user_account VARCHAR(50),
      unit_type VARCHAR(50),
      region VARCHAR(50),
      status VARCHAR(20),
      parent_unit_id INTEGER
    );
    INSERT INTO units VALUES
      (1, '8801', 'CN Hải Phòng', '8801_admin', 'BRANCH_L1', 'MIEN_BAC', 'ACTIVE', NULL),
      (2, '8802', 'CN Hà Nội', '8802_admin', 'BRANCH_L1', 'MIEN_BAC', 'ACTIVE', NULL),
      (3, '880201', 'PGD Cầu Giấy', '880201_admin', 'BRANCH_L2', 'MIEN_BAC', 'ACTIVE', 2),
      (4, '1001', 'Ban Tín dụng Trụ sở', '1001_admin', 'HO', 'HO', 'ACTIVE', NULL),
      (5, '1002', 'Trung tâm CNTT', '1002_admin', 'HO', 'HO', 'ACTIVE', NULL),
      (6, '9999', 'CN Đã giải thể', '9999_admin', 'BRANCH_L1', 'MIEN_BAC', 'INACTIVE', NULL);
  `);

  const participating = getParticipatingUnits(scopeDb);
  assert(
    participating.length === 5,
    'Test 4.1: getParticipatingUnits lấy đúng 5 đơn vị ACTIVE (gồm cả chi nhánh và trụ sở theo quyết định nghiệp vụ)',
    `Thực tế: ${participating.length}`
  );
  assert(
    !participating.some(u => u.status === 'INACTIVE'),
    'Test 4.2: Loại bỏ hoàn toàn đơn vị INACTIVE khỏi mẫu số tiến độ'
  );
}

console.log(`\n====================================================`);
console.log(`KẾT QUẢ KIỂM THỬ: ${passCount} PASS, ${failCount} FAIL`);
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('TẤT CẢ CÁC BÀI TEST HỒI QUY VỀ PHẠM VI ĐƠN VỊ ĐÃ VƯỢT QUA XUẤT SẮC!');
}
