import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import * as xlsx from 'xlsx';
import { validateCandidateBatch } from '../src/lib/validation';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 BẮT ĐẦU TEST SUITE: MỤC 2.4 - VÒNG ĐỜI MASTER DB');
  console.log('====================================================\n');

  const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
  const db = new DatabaseSync(dbPath);

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      process.exitCode = 1;
    }
  }

  // 1. Kiểm tra cấu trúc CSDL
  console.log('--- 1. Kiểm tra Schema employees & employee_history ---');
  const empCols = db.prepare('PRAGMA table_info(employees)').all() as any[];
  const hasStatusCol = empCols.some(c => c.name === 'status');
  assert(hasStatusCol, 'Cột employees.status đã tồn tại');

  const historyTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employee_history'").get() as any;
  assert(!!historyTable, 'Bảng employee_history đã tồn tại');

  // 2. Kiểm tra system_settings cho inactive_employee_severity
  console.log('\n--- 2. Kiểm tra Cấu hình inactive_employee_severity ---');
  let setting = db.prepare("SELECT value FROM system_settings WHERE key = 'inactive_employee_severity'").get() as any;
  assert(!!setting && (setting.value === 'WARNING' || setting.value === 'ERROR'), 'Cấu hình inactive_employee_severity tồn tại trong system_settings');

  // 3. Kiểm tra Validation Engine với INACTIVE_EMPLOYEE khi severity là WARNING vs ERROR
  console.log('\n--- 3. Kiểm tra Validation Engine với Cán bộ INACTIVE ---');

  // Tạo tạm 1 cán bộ active và 1 cán bộ inactive để test
  const testCodeActive = 'TEST_EMP_ACT_01';
  const testCodeInactive = 'TEST_EMP_INACT_01';
  const testElearnActive = 'test_act_01';
  const testElearnInactive = 'test_inact_01';

  db.prepare(`
    INSERT INTO employees (employee_code, elearning_account, full_name, unit_code, status)
    VALUES (?, ?, ?, ?, 'ACTIVE')
    ON CONFLICT(employee_code) DO UPDATE SET elearning_account = excluded.elearning_account, status = 'ACTIVE'
  `).run(testCodeActive, testElearnActive, 'Cán bộ Đang Hoạt Động', '9999');

  db.prepare(`
    INSERT INTO employees (employee_code, elearning_account, full_name, unit_code, status)
    VALUES (?, ?, ?, ?, 'INACTIVE')
    ON CONFLICT(employee_code) DO UPDATE SET elearning_account = excluded.elearning_account, status = 'INACTIVE'
  `).run(testCodeInactive, testElearnInactive, 'Cán bộ Đã Nghỉ Việc', '9999');

  // Đặt severity thành WARNING
  db.prepare("UPDATE system_settings SET value = 'WARNING' WHERE key = 'inactive_employee_severity'").run();

  const testRows = [
    { rowIndex: 2, employeeCode: testCodeActive, elearningAccount: testElearnActive, fullName: 'Cán bộ Active' },
    { rowIndex: 3, employeeCode: testCodeInactive, elearningAccount: testElearnInactive, fullName: 'Cán bộ Inactive' }
  ];

  const validationResultWarn = validateCandidateBatch(db, testRows as any, '9999');
  const inactiveWarnError = validationResultWarn.allErrors.find(e => e.employeeCode === testCodeInactive && e.errorType === 'INACTIVE_EMPLOYEE');

  assert(!!inactiveWarnError, 'Phát hiện lỗi INACTIVE_EMPLOYEE khi cán bộ bị INACTIVE');
  assert(inactiveWarnError?.severity === 'WARNING', 'Mức độ là WARNING khi cấu hình system_settings = WARNING');
  assert(validationResultWarn.errorRows === 0, 'errorRows là 0 khi chỉ có WARNING (không chặn nộp)');

  // Đặt severity thành ERROR
  db.prepare("UPDATE system_settings SET value = 'ERROR' WHERE key = 'inactive_employee_severity'").run();
  const validationResultErr = validateCandidateBatch(db, testRows as any, '9999');
  const inactiveErrError = validationResultErr.allErrors.find(e => e.employeeCode === testCodeInactive && e.errorType === 'INACTIVE_EMPLOYEE');

  assert(inactiveErrError?.severity === 'ERROR', 'Mức độ chuyển thành ERROR khi cấu hình system_settings = ERROR');
  assert(validationResultErr.errorRows > 0, 'errorRows > 0 khi có ERROR (chặn nộp)');

  // Trả lại cấu hình mặc định WARNING
  db.prepare("UPDATE system_settings SET value = 'WARNING' WHERE key = 'inactive_employee_severity'").run();

  // 4. Kiểm tra Ghi vết Lịch sử Biến động Nhân sự
  console.log('\n--- 4. Kiểm tra Ghi vết Lịch sử (employee_history) ---');
  const targetEmp = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get(testCodeActive) as any;
  const historyInsert = db.prepare(`
    INSERT INTO employee_history (employee_id, employee_code, action_type, old_values, new_values, changed_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  historyInsert.run(targetEmp.id, testCodeActive, 'UPDATED', JSON.stringify({ unit: '9999' }), JSON.stringify({ unit: '8888' }), 1);

  const historyRow = db.prepare('SELECT * FROM employee_history WHERE employee_code = ? ORDER BY id DESC LIMIT 1').get(testCodeActive) as any;
  assert(historyRow?.action_type === 'UPDATED', 'Bảng employee_history ghi nhận đúng action_type');
  assert(historyRow?.old_values.includes('9999') && historyRow?.new_values.includes('8888'), 'Lưu đúng old_values và new_values');

  // 5. Dọn dẹp dữ liệu test
  db.prepare('DELETE FROM employee_history WHERE employee_code IN (?, ?)').run(testCodeActive, testCodeInactive);
  db.prepare('DELETE FROM employees WHERE employee_code IN (?, ?)').run(testCodeActive, testCodeInactive);

  console.log('\n====================================================');
  console.log(`🎉 KẾT QUẢ TEST MỤC 2.4: ${passed}/${total} PASS`);
  console.log('====================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
