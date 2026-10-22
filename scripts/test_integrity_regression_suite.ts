import { DatabaseSync } from 'node:sqlite';
import path from 'path';

/**
 * scripts/test_integrity_regression_suite.ts
 * Kịch bản kiểm thử hồi quy (Regression Test Suite)
 * Kiểm tra các ca lỗi đã được xử lý để ngăn chặn tái phát sinh lỗi:
 * 1. Đảm bảo không còn cán bộ nào có unit_code rỗng trong employees.
 * 2. Đảm bảo toàn bộ submission SUBMITTED đều có biên nhận tương ứng và total_records khớp tuyệt đối.
 * 3. Đảm bảo không có biên nhận rác/lệch số liệu còn sót lại trong submission_receipts.
 * 4. Đảm bảo hàm cleanCode chuẩn hóa số 0 đầu, ký tự ẩn và khoảng trắng chính xác.
 */

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath, { readOnly: true });

function cleanCode(code: any): string {
  if (!code) return '';
  return String(code)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim()
    .replace(/^0+/, '')
    .toUpperCase();
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName} - ${detail || ''}`);
    process.exitCode = 1;
  }
}

console.log('='.repeat(80));
console.log('CHẠY KIỂM THỬ HỒI QUY: BẢO VỆ TÍNH TOÀN VẸN DỮ LIỆU');
console.log('='.repeat(80));

// Test 1: Không còn cán bộ có unit_code rỗng trong employees
const emptyUnitEmps = db.prepare("SELECT count(*) as c FROM employees WHERE unit_code IS NULL OR unit_code = ''").get() as any;
assert(emptyUnitEmps.c === 0, 'Test 1: Bảng employees không còn bản ghi có unit_code rỗng', `Còn ${emptyUnitEmps.c} bản ghi vi phạm`);

// Test 2: Mọi cán bộ trong employees đều trỏ tới mã đơn vị tồn tại trong units
const invalidUnitEmps = db.prepare("SELECT count(*) as c FROM employees WHERE unit_code NOT IN (SELECT unit_code FROM units)").get() as any;
assert(invalidUnitEmps.c === 0, 'Test 2: Mọi cán bộ đều có unit_code hợp lệ trong danh mục đơn vị', `Có ${invalidUnitEmps.c} bản ghi vi phạm`);

// Test 3: Toàn bộ training_demand_submissions có status='SUBMITTED' đều có receipt trong submission_receipts
const unreceiptedSubs = db.prepare(`
  SELECT count(*) as c FROM training_demand_submissions s
  WHERE s.status = 'SUBMITTED'
    AND s.receipt_code NOT IN (SELECT receipt_code FROM submission_receipts)
`).get() as any;
assert(unreceiptedSubs.c === 0, 'Test 3: Tất cả hồ sơ nộp chính thức đều có biên nhận tương ứng', `Có ${unreceiptedSubs.c} hồ sơ thiếu biên nhận`);

// Test 4: Không có biên nhận nào bị lệch total_records so với số lượt người học thực tế trong DB
const receipts = db.prepare("SELECT id, receipt_code, target_id, total_records FROM submission_receipts WHERE target_type = 'TRAINING_DEMAND'").all() as any[];
let receiptMismatch = 0;
for (const rc of receipts) {
  const progSum = (db.prepare(`
    SELECT COALESCE(SUM(dt.participant_count), 0) as s
    FROM training_demand_program_topics dt
    JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
    WHERE dp.submission_id = ?
  `).get(rc.target_id) as any)?.s || 0;

  const propSum = (db.prepare(`
    SELECT COALESCE(SUM(participant_count), 0) as s
    FROM training_demand_proposals WHERE submission_id = ?
  `).get(rc.target_id) as any)?.s || 0;

  if (rc.total_records !== (progSum + propSum)) {
    receiptMismatch++;
  }
}
assert(receiptMismatch === 0, 'Test 4: Số lượt học viên trong biên nhận khớp 100% với bảng gốc CSDL', `Có ${receiptMismatch} biên nhận lệch số`);

// Test 5: Kiểm tra hàm cleanCode chuẩn hóa chính xác
assert(cleanCode('0012345') === '12345', 'Test 5.1: cleanCode loại bỏ số 0 ở đầu');
assert(cleanCode('012345\u00A0') === '12345', 'Test 5.2: cleanCode loại bỏ khoảng trắng NBSP và số 0 đầu');
assert(cleanCode('  ab123  ') === 'AB123', 'Test 5.3: cleanCode viết hoa và trim khoảng trắng');
assert(cleanCode('\u200B009988\u200C') === '9988', 'Test 5.4: cleanCode loại bỏ zero-width characters');

console.log('='.repeat(80));
console.log(`KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} tests thành công.`);
console.log('='.repeat(80));
