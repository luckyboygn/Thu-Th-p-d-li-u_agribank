import { getDatabase } from '../src/lib/db';
import { validateCandidateBatch } from '../src/lib/validation';
import { ParsedRowData } from '../src/lib/excel';

const db = getDatabase();

console.log('=== TÁI HIỆN VÀ XÁC MINH CÁC CA NHẬN DẠNG CÁN BỘ HIỆN TẠI ===\n');

// Tìm 1 cán bộ thật trong CSDL để làm mẫu test
const sampleEmp = db.prepare('SELECT id, employee_code, elearning_account, full_name, unit_code FROM employees LIMIT 1').get() as any;
if (!sampleEmp) {
  console.error('Không tìm thấy cán bộ mẫu trong database!');
  process.exit(1);
}

console.log(`Cán bộ mẫu từ Master DB: ID=${sampleEmp.id}, Mã=[${sampleEmp.employee_code}], eLearning=[${sampleEmp.elearning_account}], Tên=[${sampleEmp.full_name}]\n`);

const testCases = [
  {
    name: '1. Mã chứa số 0 đầu khác biệt ("0" + code vs code)',
    code: '0' + sampleEmp.employee_code,
    elearn: sampleEmp.elearning_account,
    fullName: sampleEmp.full_name
  },
  {
    name: '2. Mã chứa ký tự ẩn: NBSP (\\u00A0)',
    code: `${sampleEmp.employee_code}\u00A0`,
    elearn: sampleEmp.elearning_account,
    fullName: sampleEmp.full_name
  },
  {
    name: '3. Mã chứa ký tự ẩn: Zero-width space (\\u200B)',
    code: `\u200B${sampleEmp.employee_code}`,
    elearn: sampleEmp.elearning_account,
    fullName: sampleEmp.full_name
  },
  {
    name: '4. Mã chứa BOM (\\uFEFF)',
    code: `\uFEFF${sampleEmp.employee_code}`,
    elearn: sampleEmp.elearning_account,
    fullName: sampleEmp.full_name
  },
  {
    name: '5. Mã full-width (chữ số độ rộng đầy đủ ví dụ ２００７...)',
    code: sampleEmp.employee_code.replace(/[0-9]/g, (ch: string) => String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)),
    elearn: sampleEmp.elearning_account,
    fullName: sampleEmp.full_name
  },
  {
    name: '6. Mã chữ thường (nếu mã có chữ cái, ví dụ nv...)',
    code: sampleEmp.employee_code.toLowerCase() === sampleEmp.employee_code ? sampleEmp.employee_code.toUpperCase() : sampleEmp.employee_code.toLowerCase(),
    elearn: sampleEmp.elearning_account,
    fullName: sampleEmp.full_name
  },
  {
    name: '7. Họ tên bị lệch (Sai lệch họ tên so với Master DB)',
    code: sampleEmp.employee_code,
    elearn: sampleEmp.elearning_account,
    fullName: 'Tên Hoàn Toàn Khác Không Khớp Master'
  }
];

testCases.forEach((tc, idx) => {
  const row: ParsedRowData = {
    rowIndex: idx + 2,
    employeeCode: tc.code,
    elearningAccount: tc.elearn,
    fullName: tc.fullName,
    rawData: {},
    isCandidateRow: true
  };

  const valRes = validateCandidateBatch(db, [row], sampleEmp.unit_code);
  const rec = valRes.records[0];
  const isMatch = rec.status === 'VALID' && rec.errors.length === 0;

  console.log(`Ca ${idx + 1}: ${tc.name}`);
  console.log(`  - Input: Mã=[${tc.code}], eLearning=[${tc.elearn}], Tên=[${tc.fullName}]`);
  console.log(`  - Trạng thái: ${rec.status}`);
  console.log(`  - Kết quả khớp: ${isMatch ? 'KHỚP THÀNH CÔNG' : 'KHÔNG KHỚP / CÓ LỖI'}`);
  if (rec.errors.length > 0) {
    rec.errors.forEach(err => {
      console.log(`    -> Lỗi/Cảnh báo: [${err.errorType}] ${err.errorMessage} (Severity: ${err.severity})`);
    });
  }
  console.log('');
});
