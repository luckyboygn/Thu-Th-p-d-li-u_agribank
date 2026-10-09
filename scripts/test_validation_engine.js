const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');

// Khởi tạo một in-memory DB để test nhanh và độc lập
const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    elearning_account VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    unit_code VARCHAR(50),
    unit_name VARCHAR(255),
    raw_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

const insertEmp = db.prepare(`
  INSERT INTO employees (employee_code, elearning_account, full_name, unit_code)
  VALUES (?, ?, ?, ?)
`);

// Dữ liệu chuẩn trong Database:
// Người 1: Mã 200903092 ↔ abc123 (Nguyễn Văn A)
// Người 2: Mã 200902238 ↔ xyz456 (Trần Thị B)
insertEmp.run('200903092', 'abc123', 'Nguyễn Văn A', '8802');
insertEmp.run('200902238', 'xyz456', 'Trần Thị B', '8802');

console.log('--- KHỞI CHẠY KIỂM THỬ AUTOMATED TESTS CHO VALIDATION ENGINE ---\n');

// Import logic validation engine (phiên bản JS thuần hoặc test logic)
function validateCandidateBatch(db, rows, currentUnitCode) {
  const recordsResult = [];
  const allErrors = [];

  const targetUnitCode = currentUnitCode ? String(currentUnitCode).trim() : '';

  const seenCodes = new Map();
  const seenElearns = new Map();

  for (const r of rows) {
    const code = String(r.employeeCode || '').trim();
    const elearn = String(r.elearningAccount || '').trim().toLowerCase();

    if (code) {
      if (!seenCodes.has(code)) seenCodes.set(code, []);
      seenCodes.get(code).push(r.rowIndex);
    }
    if (elearn) {
      if (!seenElearns.has(elearn)) seenElearns.set(elearn, []);
      seenElearns.get(elearn).push(r.rowIndex);
    }
  }

  const findByCodeStmt = db.prepare(`
    SELECT id, employee_code, elearning_account, full_name, unit_code, unit_name
    FROM employees WHERE employee_code = ?
  `);

  const findByElearnStmt = db.prepare(`
    SELECT id, employee_code, elearning_account, full_name, unit_code, unit_name
    FROM employees WHERE LOWER(elearning_account) = LOWER(?)
  `);

  for (const r of rows) {
    const rowErrors = [];
    const code = String(r.employeeCode || '').trim();
    const elearn = String(r.elearningAccount || '').trim().toLowerCase();

    // 1. Kiểm tra thiếu trường
    if (!code || !elearn) {
      rowErrors.push({
        rowIndex: r.rowIndex,
        errorType: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'Thiếu trường bắt buộc Mã cán bộ hoặc eLearning.',
        severity: 'ERROR'
      });
    }

    // 2. Trùng lặp trong file
    if (code && (seenCodes.get(code)?.length || 0) > 1) {
      const others = seenCodes.get(code).filter(x => x !== r.rowIndex);
      rowErrors.push({
        rowIndex: r.rowIndex,
        errorType: 'DUPLICATE_EMPLOYEE_CODE_IN_FILE',
        errorMessage: `LỖI – Mã cán bộ xuất hiện nhiều lần trong file (trùng với dòng ${others.join(', ')}).`,
        severity: 'ERROR'
      });
    }

    if (elearn && (seenElearns.get(elearn)?.length || 0) > 1) {
      const others = seenElearns.get(elearn).filter(x => x !== r.rowIndex);
      rowErrors.push({
        rowIndex: r.rowIndex,
        errorType: 'DUPLICATE_ELEARNING_IN_FILE',
        errorMessage: `LỖI – Tài khoản eLearning xuất hiện nhiều lần trong file (trùng với dòng ${others.join(', ')}).`,
        severity: 'ERROR'
      });
    }

    // 3. Đối chiếu 2 chiều với Database
    if (code && elearn) {
      const recordByCode = findByCodeStmt.get(code);
      const recordByElearn = findByElearnStmt.get(elearn);

      if (!recordByCode && !recordByElearn) {
        rowErrors.push({
          rowIndex: r.rowIndex,
          errorType: 'UNKNOWN_BOTH',
          errorMessage: 'LỖI – Không tìm thấy cả Mã cán bộ và tài khoản eLearning trong Database.',
          severity: 'ERROR'
        });
      } else if (recordByCode && !recordByElearn) {
        const isSameUnit = !targetUnitCode || !recordByCode.unit_code || String(recordByCode.unit_code).trim() === targetUnitCode;
        const msg = isSameUnit
          ? `Mã cán bộ ${code} tồn tại trong Database nhưng tài khoản eLearning do đơn vị kê khai không đúng. Tài khoản đúng trong Database là ${recordByCode.elearning_account}.`
          : `Thông tin không khớp cơ sở dữ liệu cán bộ, vui lòng liên hệ Trung tâm.`;

        rowErrors.push({
          rowIndex: r.rowIndex,
          errorType: 'WRONG_ELEARNING',
          errorMessage: msg,
          severity: 'ERROR'
        });
      } else if (!recordByCode && recordByElearn) {
        const isSameUnit = !targetUnitCode || !recordByElearn.unit_code || String(recordByElearn.unit_code).trim() === targetUnitCode;
        const msg = isSameUnit
          ? `Tài khoản eLearning ${elearn} thuộc Mã cán bộ ${recordByElearn.employee_code}, nhưng đơn vị kê khai Mã cán bộ ${code}.`
          : `Thông tin không khớp cơ sở dữ liệu cán bộ, vui lòng liên hệ Trung tâm.`;

        rowErrors.push({
          rowIndex: r.rowIndex,
          errorType: 'WRONG_EMPLOYEE_CODE',
          errorMessage: msg,
          severity: 'ERROR'
        });
      } else if (recordByCode && recordByElearn) {
        if (recordByCode.id === recordByElearn.id) {
          // Hợp lệ, kiểm tra đơn vị (WARNING)
          if (targetUnitCode && recordByCode.unit_code && String(recordByCode.unit_code).trim() !== targetUnitCode) {
            rowErrors.push({
              rowIndex: r.rowIndex,
              errorType: 'UNIT_MISMATCH',
              errorMessage: `Cảnh báo: Cán bộ thuộc đơn vị khác trong hệ thống (Đơn vị trong CSDL: ${recordByCode.unit_code}).`,
              severity: 'WARNING'
            });
          }
        } else {
          const isSameUnit = !targetUnitCode || (
            (!recordByCode.unit_code || String(recordByCode.unit_code).trim() === targetUnitCode) &&
            (!recordByElearn.unit_code || String(recordByElearn.unit_code).trim() === targetUnitCode)
          );

          const msg = isSameUnit
            ? `LỖI – Mã cán bộ và tài khoản eLearning thuộc hai người khác nhau.`
            : `Thông tin không khớp cơ sở dữ liệu cán bộ, vui lòng liên hệ Trung tâm.`;

          rowErrors.push({
            rowIndex: r.rowIndex,
            errorType: 'CROSS_PERSON_MISMATCH',
            errorMessage: msg,
            severity: 'ERROR'
          });
        }
      }
    }

    const hasHardError = rowErrors.some(e => (e.severity || 'ERROR') === 'ERROR');
    const isValid = !hasHardError;

    recordsResult.push({
      rowIndex: r.rowIndex,
      employeeCode: code,
      elearningAccount: elearn,
      rawData: r.rawData,
      status: isValid ? 'VALID' : 'INVALID',
      errors: rowErrors
    });

    if (rowErrors.length > 0) {
      allErrors.push(...rowErrors);
    }
  }

  return {
    totalRows: recordsResult.length,
    validRows: recordsResult.filter(r => r.status === 'VALID').length,
    errorRows: recordsResult.filter(r => r.status === 'INVALID').length,
    warningRows: recordsResult.filter(r => r.status === 'VALID' && r.errors.length > 0).length,
    records: recordsResult,
    allErrors
  };
}

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`✅ [PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] Test ${total}: ${name}`);
    console.error(err);
  }
}

// TEST 1: CASE 1 - Cả hai chính xác
runTest('CASE 1: Cả hai chính xác -> HỢP LỆ', () => {
  const rows = [{ rowIndex: 10, employeeCode: '200903092', elearningAccount: 'abc123', rawData: { Chức_vụ: 'Phó phòng' } }];
  const res = validateCandidateBatch(db, rows);
  assert.strictEqual(res.validRows, 1);
  assert.strictEqual(res.errorRows, 0);
  assert.strictEqual(res.records[0].status, 'VALID');
  assert.strictEqual(res.records[0].rawData.Chức_vụ, 'Phó phòng'); // Giữ nguyên chức vụ theo Excel
});

// TEST 2: CASE 2 - Đúng Mã cán bộ nhưng sai eLearning
runTest('CASE 2: Đúng Mã cán bộ nhưng sai eLearning -> WRONG_ELEARNING', () => {
  const rows = [{ rowIndex: 11, employeeCode: '200903092', elearningAccount: 'xyz999', rawData: {} }];
  const res = validateCandidateBatch(db, rows);
  assert.strictEqual(res.errorRows, 1);
  assert.strictEqual(res.records[0].errors[0].errorType, 'WRONG_ELEARNING');
  assert.ok(res.records[0].errors[0].errorMessage.includes('Tài khoản đúng trong Database là abc123'));
});

// TEST 3: CASE 3 - Đúng eLearning nhưng sai Mã cán bộ (BẮT BUỘC)
runTest('CASE 3: Đúng eLearning nhưng sai Mã cán bộ -> WRONG_EMPLOYEE_CODE (BẮT BUỘC)', () => {
  const rows = [{ rowIndex: 12, employeeCode: '200999999', elearningAccount: 'abc123', rawData: {} }];
  const res = validateCandidateBatch(db, rows);
  assert.strictEqual(res.errorRows, 1);
  assert.strictEqual(res.records[0].errors[0].errorType, 'WRONG_EMPLOYEE_CODE');
  assert.ok(res.records[0].errors[0].errorMessage.includes('Tài khoản eLearning abc123 thuộc Mã cán bộ 200903092, nhưng đơn vị kê khai Mã cán bộ 200999999'));
});

// TEST 4: CASE 4 - Cả hai đều tồn tại nhưng thuộc 2 người khác nhau
runTest('CASE 4: Cả hai tồn tại nhưng thuộc hai người khác nhau -> CROSS_PERSON_MISMATCH', () => {
  const rows = [{ rowIndex: 13, employeeCode: '200903092', elearningAccount: 'xyz456', rawData: {} }];
  const res = validateCandidateBatch(db, rows);
  assert.strictEqual(res.errorRows, 1);
  assert.strictEqual(res.records[0].errors[0].errorType, 'CROSS_PERSON_MISMATCH');
  assert.ok(res.records[0].errors[0].errorMessage.includes('thuộc hai người khác nhau'));
});

// TEST 5 & 7: CASE 7 - Cả hai đều không tồn tại
runTest('CASE 7: Cả hai đều không tồn tại -> UNKNOWN_BOTH', () => {
  const rows = [{ rowIndex: 14, employeeCode: '999999999', elearningAccount: 'unknown_user', rawData: {} }];
  const res = validateCandidateBatch(db, rows);
  assert.strictEqual(res.errorRows, 1);
  assert.strictEqual(res.records[0].errors[0].errorType, 'UNKNOWN_BOTH');
});

// TEST 6: Trùng Mã cán bộ trong file Excel
runTest('CASE 8: Trùng Mã cán bộ trong chính file Excel', () => {
  const rows = [
    { rowIndex: 20, employeeCode: '200903092', elearningAccount: 'abc123', rawData: {} },
    { rowIndex: 50, employeeCode: '200903092', elearningAccount: 'abc123', rawData: {} }
  ];
  const res = validateCandidateBatch(db, rows);
  assert.strictEqual(res.errorRows, 2);
  assert.ok(res.allErrors.some(e => e.errorType === 'DUPLICATE_EMPLOYEE_CODE_IN_FILE'));
});

// TEST 7: Trùng eLearning trong file Excel
runTest('CASE 9: Trùng tài khoản eLearning trong file Excel', () => {
  const rows = [
    { rowIndex: 30, employeeCode: '200903092', elearningAccount: 'abc123', rawData: {} },
    { rowIndex: 35, employeeCode: '200902238', elearningAccount: 'abc123', rawData: {} }
  ];
  const res = validateCandidateBatch(db, rows);
  assert.strictEqual(res.errorRows, 2);
  assert.ok(res.allErrors.some(e => e.errorType === 'DUPLICATE_ELEARNING_IN_FILE'));
});

// TEST 8: Thiếu trường bắt buộc
runTest('CASE 10: Thiếu trường bắt buộc -> MISSING_REQUIRED_FIELD', () => {
  const rows = [{ rowIndex: 40, employeeCode: '', elearningAccount: 'abc123', rawData: {} }];
  const res = validateCandidateBatch(db, rows);
  assert.strictEqual(res.errorRows, 1);
  assert.strictEqual(res.records[0].errors[0].errorType, 'MISSING_REQUIRED_FIELD');
});

// TEST 9: Bảo toàn dữ liệu gốc (không ghi đè chức vụ từ DB)
runTest('NGUYÊN TẮC BẢO TOÀN DỮ LIỆU: Không ghi đè chức vụ/đối tượng từ DB vào Excel', () => {
  const rows = [{
    rowIndex: 55,
    employeeCode: '200903092',
    elearningAccount: 'abc123',
    rawData: {
      'Họ và tên': 'Nguyễn Văn A',
      'Chức vụ': 'Phó giám đốc phụ trách',
      'Đối tượng': 'Đối tượng B',
      'Nghiệp vụ': 'Nghiệp vụ Tín dụng nâng cao',
      'Ngày thi': '28/10/2026'
    }
  }];
  const res = validateCandidateBatch(db, rows);
  assert.strictEqual(res.records[0].status, 'VALID');
  assert.strictEqual(res.records[0].rawData['Chức vụ'], 'Phó giám đốc phụ trách');
  assert.strictEqual(res.records[0].rawData['Ngày thi'], '28/10/2026');
});

// TEST 10: Cán bộ thuộc đơn vị khác -> UNIT_MISMATCH (WARNING) nhưng vẫn VALID và không tính vào errorRows
runTest('MỤC 1.7: Cán bộ thuộc đơn vị khác -> UNIT_MISMATCH (WARNING, không chặn nộp)', () => {
  // DB có cán bộ 200903092 thuộc unit_code '8802'
  // Upload bởi unit '1600'
  const rows = [{ rowIndex: 60, employeeCode: '200903092', elearningAccount: 'abc123', rawData: {} }];
  const res = validateCandidateBatch(db, rows, '1600');
  assert.strictEqual(res.validRows, 1);
  assert.strictEqual(res.errorRows, 0);
  assert.strictEqual(res.warningRows, 1);
  assert.strictEqual(res.records[0].status, 'VALID');
  assert.strictEqual(res.allErrors[0].errorType, 'UNIT_MISMATCH');
  assert.strictEqual(res.allErrors[0].severity, 'WARNING');
  assert.ok(res.allErrors[0].errorMessage.includes('Cán bộ thuộc đơn vị khác'));
});

// TEST 11: Che thông tin liên đơn vị khi WRONG_ELEARNING cho cán bộ thuộc đơn vị khác
runTest('MỤC 1.7: Che thông tin liên đơn vị khi WRONG_ELEARNING', () => {
  // Cán bộ 200903092 thuộc unit '8802'. Người upload là '1600' (khác đơn vị).
  const rows = [{ rowIndex: 61, employeeCode: '200903092', elearningAccount: 'wrong_elearn', rawData: {} }];
  const res = validateCandidateBatch(db, rows, '1600');
  assert.strictEqual(res.errorRows, 1);
  assert.strictEqual(res.records[0].errors[0].errorType, 'WRONG_ELEARNING');
  assert.strictEqual(res.records[0].errors[0].errorMessage, 'Thông tin không khớp cơ sở dữ liệu cán bộ, vui lòng liên hệ Trung tâm.');
});

// TEST 12: Cán bộ thuộc cùng đơn vị khi WRONG_ELEARNING -> giữ nguyên gợi ý sửa chi tiết
runTest('MỤC 1.7: Cùng đơn vị khi WRONG_ELEARNING -> Giữ nguyên gợi ý sửa chi tiết', () => {
  // Cán bộ 200903092 thuộc unit '8802'. Người upload là '8802' (cùng đơn vị).
  const rows = [{ rowIndex: 62, employeeCode: '200903092', elearningAccount: 'wrong_elearn', rawData: {} }];
  const res = validateCandidateBatch(db, rows, '8802');
  assert.strictEqual(res.errorRows, 1);
  assert.strictEqual(res.records[0].errors[0].errorType, 'WRONG_ELEARNING');
  assert.ok(res.records[0].errors[0].errorMessage.includes('Tài khoản đúng trong Database là abc123'));
});

console.log(`\n========================================`);
console.log(`KẾT QUẢ KIỂM THỬ: ${passed}/${total} TESTS ĐÃ VƯỢT QUA!`);
console.log(`========================================\n`);

if (passed !== total) {
  process.exit(1);
}
