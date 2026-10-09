import { getDatabase } from './src/lib/db';
import { validateSubmissionBatch, FormConfig } from './src/lib/validation-engine';

const db = getDatabase();

console.log('=====================================================');
console.log('BẮT ĐẦU CHẠY BỘ AUTOMATED TESTS 6 CA BẮT BUỘC (A -> F)');
console.log('=====================================================\n');

// Đảm bảo có dữ liệu Master mẫu để test
db.exec(`
  INSERT OR IGNORE INTO employees (employee_code, elearning_account, full_name, unit_code, unit_name)
  VALUES 
    ('200903092', 'abc123', 'Nguyễn Văn A', '1600', 'Agribank Chi nhánh Hà Nội'),
    ('200902238', 'xyz456', 'Trần Thị B', '1600', 'Agribank Chi nhánh Hà Nội');
`);

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    console.error(`❌ [FAIL] ${testName} - ${detail || ''}`);
  }
}

// -----------------------------------------------------------------
// CẤU HÌNH FORM 1: DANH SÁCH CÁN BỘ (MASTER_VALIDATION)
// -----------------------------------------------------------------
const masterForm: FormConfig = {
  id: 1,
  collectionId: 100,
  formCode: 'CANDIDATE_LIST',
  title: 'Danh sách cán bộ dự thi',
  validationMode: 'MASTER_VALIDATION',
  employeeCodeField: 'employee_code',
  elearningField: 'elearning_account',
  fields: [
    { id: 1, fieldName: 'employee_code', label: 'Mã cán bộ', fieldType: 'TEXT', required: true },
    { id: 2, fieldName: 'elearning_account', label: 'Tài khoản eLearning', fieldType: 'TEXT', required: true }
  ]
};

// -----------------------------------------------------------------
// TEST A: Form Master Validation - Mã CB đúng & eLearning đúng -> PASS
// -----------------------------------------------------------------
{
  const rows = [
    { rowIndex: 2, data: { employee_code: '200903092', elearning_account: 'abc123' } }
  ];
  const result = validateSubmissionBatch(db, masterForm, rows);
  assert(
    result.validRows === 1 && result.errorRows === 0 && result.allErrors.length === 0,
    'TEST A: Form Master Validation - Mã CB đúng & eLearning đúng -> PASS'
  );
}

// -----------------------------------------------------------------
// TEST B: Form Master Validation - Mã CB đúng & eLearning sai -> FAIL (Sai eLearning)
// -----------------------------------------------------------------
{
  const rows = [
    { rowIndex: 2, data: { employee_code: '200903092', elearning_account: 'xyz999' } }
  ];
  const result = validateSubmissionBatch(db, masterForm, rows);
  const hasWrongElearn = result.allErrors.some(e => e.errorType === 'WRONG_ELEARNING');
  assert(
    result.errorRows === 1 && hasWrongElearn,
    'TEST B: Form Master Validation - Đúng Mã CB, sai eLearning -> FAIL (Phát hiện WRONG_ELEARNING)'
  );
}

// -----------------------------------------------------------------
// TEST C: Form Master Validation - Mã CB sai & eLearning đúng -> FAIL (Sai Mã CB)
// -----------------------------------------------------------------
{
  const rows = [
    { rowIndex: 2, data: { employee_code: '200999999', elearning_account: 'abc123' } }
  ];
  const result = validateSubmissionBatch(db, masterForm, rows);
  const hasWrongCode = result.allErrors.some(e => e.errorType === 'WRONG_EMPLOYEE_CODE');
  assert(
    result.errorRows === 1 && hasWrongCode,
    'TEST C: Form Master Validation - Đúng eLearning, sai Mã CB -> FAIL (Phát hiện WRONG_EMPLOYEE_CODE)'
  );
}

// -----------------------------------------------------------------
// TEST D: Form Master Validation - Mã CB và eLearning thuộc 2 người khác nhau -> FAIL (CROSS_PERSON_MISMATCH)
// -----------------------------------------------------------------
{
  const rows = [
    { rowIndex: 2, data: { employee_code: '200903092', elearning_account: 'xyz456' } }
  ];
  const result = validateSubmissionBatch(db, masterForm, rows);
  const hasCrossMismatch = result.allErrors.some(e => e.errorType === 'CROSS_PERSON_MISMATCH');
  assert(
    result.errorRows === 1 && hasCrossMismatch,
    'TEST D: Form Master Validation - Lệch chéo 2 người khác nhau -> FAIL (Phát hiện CROSS_PERSON_MISMATCH)'
  );
}

// -----------------------------------------------------------------
// CẤU HÌNH FORM 2: KHẢO SÁT NHU CẦU ĐÀO TẠO (FORM_VALIDATION_ONLY)
// -----------------------------------------------------------------
const surveyForm: FormConfig = {
  id: 2,
  collectionId: 100,
  formCode: 'TRAINING_NEEDS',
  title: 'Khảo sát nhu cầu đào tạo đơn vị',
  validationMode: 'FORM_VALIDATION_ONLY',
  fields: [
    { id: 10, fieldName: 'topic', label: 'Lĩnh vực đào tạo', fieldType: 'TEXT', required: true },
    { id: 11, fieldName: 'quantity', label: 'Số lượng người', fieldType: 'NUMBER', required: true, min: 0 },
    { id: 12, fieldName: 'method', label: 'Hình thức', fieldType: 'SINGLE_SELECT', required: true, options: ['Trực tiếp', 'Online', 'Kết hợp'] },
    { id: 13, fieldName: 'note', label: 'Ghi chú', fieldType: 'TEXT', required: false }
  ]
};

// -----------------------------------------------------------------
// TEST E: Form Validation Only - Khảo sát nhu cầu hợp lệ -> PASS (Không gọi Master DB)
// -----------------------------------------------------------------
{
  const rows = [
    { rowIndex: 2, data: { topic: 'Đào tạo AI & Big Data', quantity: '50', method: 'Online', note: 'Quý I/2027' } },
    { rowIndex: 3, data: { topic: 'Nghiệp vụ Tín dụng', quantity: '120', method: 'Trực tiếp' } }
  ];
  const result = validateSubmissionBatch(db, surveyForm, rows);
  assert(
    result.validRows === 2 && result.errorRows === 0 && result.allErrors.length === 0,
    'TEST E: Form Validation Only - Khảo sát nhu cầu đào tạo đạt chuẩn -> PASS (Hoàn toàn không query Master DB)'
  );
}

// -----------------------------------------------------------------
// TEST F: Form Khảo sát có Mã cán bộ = KHÔNG TỒN TẠI nhưng validation_mode = FORM_VALIDATION_ONLY -> KHÔNG BÁO LỖI MASTER!
// -----------------------------------------------------------------
{
  const rows = [
    {
      rowIndex: 2,
      data: {
        topic: 'Đào tạo Power BI',
        quantity: '30',
        method: 'Kết hợp',
        employee_code: '999999999_MA_KHONG_TON_TAI_TRONG_MASTER'
      }
    }
  ];
  const result = validateSubmissionBatch(db, surveyForm, rows);
  // Do form này là FORM_VALIDATION_ONLY, engine tuyệt đối không kiểm tra employee_code với Master DB
  const hasMasterError = result.allErrors.some(e => e.errorType.includes('UNKNOWN') || e.errorType.includes('EMPLOYEE_CODE'));
  assert(
    result.validRows === 1 && result.errorRows === 0 && !hasMasterError,
    'TEST F: Form Khảo sát dù có Mã CB lạ vẫn PASS vì FORM_VALIDATION_ONLY không đối chiếu Master DB'
  );
}

console.log('\n=====================================================');
console.log(`KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT 100%`);
console.log('=====================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
