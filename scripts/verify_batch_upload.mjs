import { getDatabase } from '../src/lib/db.ts';
import { matchUnitFromFilename } from '../src/lib/unit-matcher.ts';

console.log('=== BẮT ĐẦU KIỂM THỬ XÁC MINH HỆ THỐNG NHẬN DIỆN & CẢNH BÁO BATCH UPLOAD ===\n');

const db = getDatabase();
const units = db.prepare('SELECT id, unit_code, unit_name FROM units').all();
console.log(`[PASS] Đã tải ${units.length} đơn vị từ cơ sở dữ liệu SQLite.\n`);

const testCases = [
  // Nhóm 1: Các file chuẩn khớp mã hoặc tên
  { filename: '2700- CN Phu Tho - Mau 04.xlsx', expectedStatus: 'MATCHED', shouldAutoSelect: true },
  { filename: '8600-Bac Kan - Mau so 04.xlsx', expectedStatus: 'MATCHED', shouldAutoSelect: true },
  { filename: '1482-Hung Vuong - Mau so 04.xlsx', expectedStatus: 'MATCHED', shouldAutoSelect: true },
  { filename: 'Bac Giang II - Mau so 04.xlsx', expectedStatus: 'MATCHED', shouldAutoSelect: true },
  { filename: 'Agribank Chi nhanh Ha Thanh - Mau 04.xlsx', expectedStatus: 'MATCHED', shouldAutoSelect: true },
  
  // Nhóm 2: File có xung đột mã và tên (1200 là Sở Giao Dịch, nhưng tên ghi Nam Định)
  { filename: '1200 Nam Dinh - Mau so 04.xlsx', expectedStatus: 'CONFLICT', shouldAutoSelect: false },

  // Nhóm 3: Các file phòng ban Trụ sở chính không thuộc 155 chi nhánh gửi Mẫu 04
  { filename: 'TTCSKH - Mau so 04.xlsx', expectedStatus: 'NOT_FOUND', shouldAutoSelect: false },
  { filename: 'QLLE3 - Mau so 04.xlsx', expectedStatus: 'NOT_FOUND', shouldAutoSelect: false },
  { filename: 'Ban Truyen thong - Mau so 04.xlsx', expectedStatus: 'NOT_FOUND', shouldAutoSelect: false },
  { filename: '1030-TT The - Mau so 04.xlsx', expectedStatus: 'NOT_FOUND', shouldAutoSelect: false }
];

let allPassed = true;

testCases.forEach((tc, idx) => {
  const result = matchUnitFromFilename(tc.filename, units);
  const statusOk = result.status === tc.expectedStatus;
  const autoSelect = result.status === 'MATCHED';
  const autoSelectOk = autoSelect === tc.shouldAutoSelect;

  if (statusOk && autoSelectOk) {
    console.log(`✓ Test ${idx + 1} PASSED: "${tc.filename}"`);
    console.log(`   -> Trạng thái: [${result.status}] | Tự động chọn: ${autoSelect}`);
    if (result.unit) {
      console.log(`   -> Đơn vị: [${result.unit.unitCode}] ${result.unit.unitName} (Khớp theo: ${result.matchedBy})`);
    } else {
      console.log(`   -> Cảnh báo: ${result.warning || 'Không tìm thấy chi nhánh khớp'}`);
    }
  } else {
    allPassed = false;
    console.error(`✗ Test ${idx + 1} FAILED: "${tc.filename}"`);
    console.error(`   -> Mong muốn: ${tc.expectedStatus}, Thực tế: ${result.status}`);
  }
  console.log('');
});

if (allPassed) {
  console.log('=== TẤT CẢ 10/10 TEST CASES ĐÃ VƯỢT QUA 100%! HỆ THỐNG AN TOÀN VÀ ĐẠT CHUẨN ===');
} else {
  console.error('=== CÓ TEST CASE THẤT BẠI ===');
  process.exit(1);
}
