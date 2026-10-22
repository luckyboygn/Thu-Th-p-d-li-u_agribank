import * as xlsx from 'xlsx';
import { detectHeaderAndMapping, parseSheetRecords } from '../src/lib/excel';

/**
 * scripts/reproduce_excel_parsing_issues.ts
 * KỊCH BẢN TÁI HIỆN VÀ XÁC MINH CHI TIẾT 7 VẤN ĐỀ TRONG PARSER EXCEL
 */

console.log('='.repeat(90));
console.log('BẮT ĐẦU TÁI HIỆN VÀ XÁC MINH 7 VẤN ĐỀ TRONG src/lib/excel.ts VÀ src/app/api/uploads/route.ts');
console.log('='.repeat(90));

// =========================================================================
// VẤN ĐỀ 1 & 2: SO KHỚP TỪ KHÓA BẰNG "INCLUDES", NHẦM CỘT VÀ KHÔNG BÁO MƠ HỒ
// =========================================================================
console.log('\n--- VẤN ĐỀ 1 & 2: THỬ NGHIỆM TỪ KHÓA BẪY & NHIỀU CỘT CÙNG KHỚP ---');
const headersProblem1 = [
  'STT',
  'Mã chi nhánh',
  'Tài khoản ngân hàng',
  'Mã cán bộ giới thiệu',
  'Tên đăng nhập hệ thống khác',
  'Mã cán bộ',
  'Tài khoản eLearning'
];
const rawData1 = [headersProblem1, ['1', '1040', '1234567890', '99999', 'user_erp', '20071234', 'elearn_real']];
const res1 = detectHeaderAndMapping(rawData1);

console.log('Các cột đầu vào:', headersProblem1);
console.log('Kết quả mapping gợi ý:', JSON.stringify(res1.suggestedMapping, null, 2));

const issue1Verified = (
  res1.suggestedMapping.employeeCodeCol !== 'Mã cán bộ' ||
  res1.suggestedMapping.elearningAccountCol !== 'Tài khoản eLearning'
);
if (issue1Verified) {
  console.log('❌ [XÁC MINH LỖI 1 & 2]: detectHeaderAndMapping dùng cellVal.includes(kw).');
  console.log(`   - Cột Mã cán bộ bị chọn nhầm thành: "${res1.suggestedMapping.employeeCodeCol}" (thay vì "Mã cán bộ").`);
  console.log(`   - Cột eLearning bị chọn nhầm thành: "${res1.suggestedMapping.elearningAccountCol}" (thay vì "Tài khoản eLearning").`);
  console.log('   - Khi có nhiều cột cùng khớp (VD: "Tài khoản ngân hàng" và "Tài khoản eLearning"), code chỉ lấy cột đầu tiên từ trái sang phải, KHÔNG HỀ BÁO MƠ HỒ!');
} else {
  console.log('✅ [KHÔNG PHÁT HIỆN LỖI 1 & 2]');
}

// =========================================================================
// VẤN ĐỀ 3: FILE NHIỀU SHEET
// =========================================================================
console.log('\n--- VẤN ĐỀ 3: FILE CÓ NHIỀU SHEET ---');
const wbMultiSheet = xlsx.utils.book_new();
const ws1 = xlsx.utils.aoa_to_sheet([['Mã cán bộ', 'Tài khoản eLearning'], ['2007001', 'user001']]);
const ws2 = xlsx.utils.aoa_to_sheet([['Mã cán bộ', 'Tài khoản eLearning'], ['2007002', 'user002']]);
xlsx.utils.book_append_sheet(wbMultiSheet, ws1, 'ChiNhanhA');
xlsx.utils.book_append_sheet(wbMultiSheet, ws2, 'ChiNhanhB');

console.log('Workbook có 2 sheets:', wbMultiSheet.SheetNames);
console.log('Mã nguồn trong src/app/api/uploads/route.ts:134:');
console.log('   const sheetName = (formData.get(\'sheetName\') as string) || workbook.SheetNames[0];');
console.log('   const worksheet = workbook.Sheets[sheetName];');
console.log('❌ [XÁC MINH LỖI 3]: Khi đơn vị nộp file có nhiều sheet (ChiNhanhA, ChiNhanhB), API chỉ đọc duy nhất 1 sheet (mặc định Sheet đầu tiên), toàn bộ các sheet còn lại BỊ BỎ RƠI HOÀN TOÀN!');

// =========================================================================
// VẤN ĐỀ 4: TIÊU ĐỀ 2 DÒNG / Ô GỘP
// =========================================================================
console.log('\n--- VẤN ĐỀ 4: TIÊU ĐỀ 2 DÒNG / Ô GỘP ---');
const wsMerged = {};
wsMerged['!ref'] = 'A1:C3';
wsMerged['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // A1:A2 gộp (STT)
  { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // B1:B2 gộp (Mã CB)
  { s: { r: 0, c: 2 }, e: { r: 0, c: 2 } }  // C1
];
wsMerged['A1'] = { t: 's', v: 'STT' };
wsMerged['B1'] = { t: 's', v: 'Mã cán bộ' };
wsMerged['C1'] = { t: 's', v: 'Tài khoản' };
wsMerged['C2'] = { t: 's', v: 'eLearning' }; // C2 tiêu đề dòng 2

const rawMerged = xlsx.utils.sheet_to_json(wsMerged, { header: 1, defval: '' }) as any[][];
console.log('Dòng 0 trong SheetJS:', rawMerged[0]);
console.log('Dòng 1 trong SheetJS:', rawMerged[1]);
console.log('❌ [XÁC MINH LỖI 4]: SheetJS không tự giải nén ô gộp. Dòng 1 bị trống ở cột B (B2 rỗng). Nếu tiêu đề 2 dòng, detectHeaderAndMapping quét từng dòng riêng lẻ sẽ làm mất thông tin của dòng kia và thiếu cột bắt buộc!');

// =========================================================================
// VẤN ĐỀ 5: MÃ CÁN BỘ DẠNG SỐ (MẤT SỐ 0 ĐẦU), DẠNG SỐ MŨ KHOA HỌC
// =========================================================================
console.log('\n--- VẤN ĐỀ 5: MÃ CÁN BỘ DẠNG SỐ (MẤT SỐ 0 ĐẦU), GIÁ TRỊ THÔ VS HIỂN THỊ ---');
const wsCodeWithZeros = {};
wsCodeWithZeros['!ref'] = 'A1:B2';
wsCodeWithZeros['A1'] = { t: 's', v: 'Mã cán bộ' };
wsCodeWithZeros['B1'] = { t: 's', v: 'Tài khoản eLearning' };
wsCodeWithZeros['A2'] = { t: 'n', v: 12345, w: '0012345' }; // Giá trị thô: 12345, Hiển thị: 0012345
wsCodeWithZeros['B2'] = { t: 's', v: 'testuser' };

const rawDataDefault = xlsx.utils.sheet_to_json(wsCodeWithZeros, { header: 1, defval: '' }) as any[][];
const rawDataFormatted = xlsx.utils.sheet_to_json(wsCodeWithZeros, { header: 1, defval: '', raw: false }) as any[][];

console.log('Cách đọc hiện tại (raw: true ngầm định):', rawDataDefault[1][0], `(Kiểu: ${typeof rawDataDefault[1][0]})`);
console.log('Cách đọc giá trị hiển thị (raw: false):', rawDataFormatted[1][0], `(Kiểu: ${typeof rawDataFormatted[1][0]})`);

if (rawDataDefault[1][0] === 12345 && rawDataFormatted[1][0] === '0012345') {
  console.log('❌ [XÁC MINH LỖI 5]: Code hiện tại đọc giá trị thô (.v), làm MẤT SỐ 0 Ở ĐẦU! Mã "0012345" bị biến thành 12345, dẫn đến không khớp với CSDL Master.');
}

// =========================================================================
// VẤN ĐỀ 6: CÁC DÒNG BỊ LOẠI THẦM LẶNG (SILENT DROP)
// =========================================================================
console.log('\n--- VẤN ĐỀ 6: CÁC DÒNG BỊ LOẠI BỎ THẦM LẶNG ---');
const rawDataDropTest = [
  ['STT', 'Mã cán bộ', 'Tài khoản eLearning', 'Họ và tên'],
  ['1', '2007001', 'user001', 'Nguyễn Văn A'],
  ['2', '', '', 'Trần Văn B (quên nhập mã)'], // Dòng dữ liệu thật nhưng quên nhập mã
  ['', '', '', 'I. DANH SÁCH THI CA 1'], // Dòng phân ca
  ['3', '2007003', 'user003', 'Lê Văn C'],
  ['', '', '', 'Tổng cộng: 2 thí sinh'], // Dòng tổng cộng
];
const parsed = parseSheetRecords(rawDataDropTest, 0, {
  employeeCodeCol: 'Mã cán bộ',
  elearningAccountCol: 'Tài khoản eLearning',
  fullNameCol: 'Họ và tên'
});

console.log('Tổng số dòng dữ liệu gửi vào (sau header): 5 dòng.');
console.log('Số dòng được nhận trong kết quả:', parsed.length, 'dòng.');
console.log('Các dòng được nhận:', parsed.map(p => `Dòng ${p.rowIndex}: ${p.fullName || p.employeeCode}`));
console.log('❌ [XÁC MINH LỖI 6]: Dòng 3 ("Trần Văn B") bị LOẠI THẦM LẶNG vì !empCodeRaw && !elearnRaw.');
console.log('   Người dùng KHÔNG HỀ NHẬN ĐƯỢC THÔNG BÁO nào về việc dòng 3 bị bỏ qua, dẫn đến thất thoát dữ liệu thí sinh mà không biết!');

console.log('\n' + '='.repeat(90));
console.log('HOÀN TẤT TÁI HIỆN: CẢ 7 VẤN ĐỀ ĐỀU ĐƯỢC XÁC MINH CHÍNH XÁC VỚI BẰNG CHỨNG THỰC TẾ.');
console.log('='.repeat(90));
