import * as xlsx from 'xlsx';
import { detectHeaderAndMapping, parseSheetRecords, unmergeSheetCells } from '../src/lib/excel';

console.log('=== CHẠY BỘ KIỂM THỬ HỒI QUY (REGRESSION TESTS) CHO EXCEL PARSER ===\n');

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
// TEST 1: So khớp từ khóa bẫy không bị nhận nhầm
// ----------------------------------------------------
{
  const headers = [
    'STT',
    'Tài khoản ngân hàng',
    'Mã cán bộ giới thiệu',
    'Mã chi nhánh',
    'Tên đăng nhập hệ thống khác',
    'Mã cán bộ',
    'Tài khoản eLearning',
    'Họ và tên'
  ];
  const row1 = [1, '1234567890', '99999', 'CN8800', 'other_user', '200733604', 'hantt', 'Nguyễn Thị Thu Hà'];
  const data = [headers, row1];

  const detection = detectHeaderAndMapping(data);
  assert(
    detection.suggestedMapping.employeeCodeCol === 'Mã cán bộ',
    'Test 1.1: "Mã cán bộ" được chọn chính xác thay vì "Mã cán bộ giới thiệu" hay "Mã chi nhánh"',
    `Thực tế: ${detection.suggestedMapping.employeeCodeCol}`
  );

  assert(
    detection.suggestedMapping.elearningAccountCol === 'Tài khoản eLearning',
    'Test 1.2: "Tài khoản eLearning" được chọn chính xác thay vì "Tài khoản ngân hàng" hay "Tên đăng nhập hệ thống khác"',
    `Thực tế: ${detection.suggestedMapping.elearningAccountCol}`
  );
}

// ----------------------------------------------------
// TEST 2: Phát hiện tính mơ hồ (Ambiguity) khi có nhiều cột cùng khớp
// ----------------------------------------------------
{
  const headers = ['STT', 'Mã cán bộ', 'Mã nhân viên', 'Tài khoản eLearning', 'Họ tên'];
  const row1 = [1, '200733604', 'NV01', 'hantt', 'Nguyễn Thu Hà'];
  const data = [headers, row1];

  const detection = detectHeaderAndMapping(data);
  assert(
    detection.isAmbiguous === true,
    'Test 2.1: Cảnh báo mơ hồ (isAmbiguous === true) khi có cả "Mã cán bộ" và "Mã nhân viên"',
    `isAmbiguous: ${detection.isAmbiguous}`
  );
  assert(
    detection.ambiguityWarnings && detection.ambiguityWarnings.length > 0,
    'Test 2.2: Có thông báo cảnh báo rõ ràng cho người dùng',
    JSON.stringify(detection.ambiguityWarnings)
  );
}

// ----------------------------------------------------
// TEST 3: Tiêu đề 2 dòng & Ô gộp (Merged Cells)
// ----------------------------------------------------
{
  const ws = xlsx.utils.aoa_to_sheet([
    ['DANH SÁCH THÍ SINH'],
    ['STT', 'Thông tin cán bộ', '', 'Tài khoản', 'Ghi chú'],
    ['', 'Mã CB', 'Họ tên', 'eLearning', ''],
    [1, '001234', 'Nguyễn Văn A', 'anv', '']
  ]);
  // Merge row 1, col 1-2: "Thông tin cán bộ"
  ws['!merges'] = [
    { s: { r: 1, c: 1 }, e: { r: 1, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
    { s: { r: 1, c: 3 }, e: { r: 1, c: 3 } }
  ];

  unmergeSheetCells(ws);
  const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  assert(
    data[1][2] === 'Thông tin cán bộ',
    'Test 3.1: unmergeSheetCells đã điền giá trị cho ô C2 bị khuyết trong ô gộp',
    `Giá trị C2: "${data[1][2]}"`
  );

  const detection = detectHeaderAndMapping(data);
  assert(
    detection.suggestedMapping.employeeCodeCol === 'Mã CB' &&
    detection.suggestedMapping.elearningAccountCol === 'eLearning',
    'Test 3.2: Nhận diện chính xác dòng tiêu đề con tại row 2',
    `Dòng tiêu đề: ${detection.headerRowIndex}`
  );
}

// ----------------------------------------------------
// TEST 4: Bảo toàn số 0 đầu, công thức, số khoa học (raw: false)
// ----------------------------------------------------
{
  const ws = xlsx.utils.aoa_to_sheet([
    ['Mã cán bộ', 'Tài khoản eLearning', 'Họ và tên'],
    [12345, 'anv', 'Nguyễn Văn A']
  ]);
  // Định dạng hiển thị chuỗi có số 0 đầu
  ws['A2'].w = '00012345';

  const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  assert(
    data[1][0] === '00012345',
    'Test 4.1: Đọc mã cán bộ dưới dạng chuỗi hiển thị bảo toàn số 0 đầu',
    `Giá trị đọc được: "${data[1][0]}" (type: ${typeof data[1][0]})`
  );
}

// ----------------------------------------------------
// TEST 5: Parse report ghi lại đầy đủ và không âm thầm nuốt dữ liệu
// ----------------------------------------------------
{
  const data = [
    ['Mã cán bộ', 'Tài khoản eLearning', 'Họ và tên'],
    ['001234', 'anv', 'Nguyễn Văn A'],
    ['', '', ''], // dòng trống
    ['I. DANH SÁCH THI CA 1', '', ''], // dòng phân ca
    ['', 'bnv', 'Trần Văn B'], // dòng thiếu mã cán bộ nhưng CÓ DỮ LIỆU CÁN BỘ -> KHÔNG ĐƯỢC LOẠI ÂM THẦM
    ['Tổng cộng: 1 thí sinh', '', ''] // dòng tổng cộng
  ];

  const { records, parseReport } = parseSheetRecords(data, 0, {
    employeeCodeCol: 'Mã cán bộ',
    elearningAccountCol: 'Tài khoản eLearning',
    fullNameCol: 'Họ và tên'
  }, { sheetName: 'TestSheet' });

  assert(
    records.length === 2,
    'Test 5.1: Nhận cả dòng hợp lệ và dòng thiếu thông tin để Validation bắt lỗi (không nuốt mất dòng)',
    `Số records nhận: ${records.length} (kỳ vọng 2)`
  );

  assert(
    parseReport.rowsSkipped === 3,
    'Test 5.2: Báo cáo parse ghi nhận chính xác 3 dòng bị bỏ qua',
    `Số dòng bỏ: ${parseReport.rowsSkipped}`
  );

  assert(
    parseReport.warnings.length >= 2,
    'Test 5.3: Cảnh báo rõ ràng cho người dùng về các dòng bị bỏ qua (phân ca, tổng cộng)',
    `Warnings: ${JSON.stringify(parseReport.warnings)}`
  );
}

console.log(`\n====================================================`);
console.log(`KẾT QUẢ: ${passCount} PASS, ${failCount} FAIL`);
if (failCount > 0) {
  process.exit(1);
} else {
  console.log('TẤT CẢ CÁC CA KIỂM THỬ HỒI QUY ĐÃ VƯỢT QUA XUẤT SẮC!');
}
