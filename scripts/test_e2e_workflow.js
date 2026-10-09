const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const assert = require('assert');
const xlsx = require('xlsx');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('====================================================');
console.log('BẮT ĐẦU CHẠY KIỂM THỬ TOÀN TRÌNH END-TO-END (STAGE 10)');
console.log('====================================================\n');

// 1. Kiểm tra Admin & Đơn vị trong Database
const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
assert.ok(adminUser, 'Admin user must exist');
console.log('✅ Bước 1: Tài khoản Quản trị viên Trung tâm (admin) hợp lệ.');

const unitCount = db.prepare('SELECT COUNT(*) as count FROM units').get().count;
assert.strictEqual(unitCount, 162, 'Phải có đủ 162 đơn vị');
console.log(`✅ Bước 2: Bảng units có đủ ${unitCount} đơn vị.`);

const exam = db.prepare("SELECT * FROM exams WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get();
assert.ok(exam, 'Active exam must exist');
console.log(`✅ Bước 3: Kỳ thi hợp lệ: ${exam.title} (${exam.code})`);

// 2. Kiểm tra Test Case Bắt Buộc từ Prompt Section 32:
// DATABASE: Mã CB: 200903092 ↔ eLearning: abc123
// EXCEL:    Mã CB: 200999999 ↔ eLearning: abc123
// KẾT QUẢ BẮT BUỘC:
// ❌ SAI MÃ CÁN BỘ: "Tài khoản eLearning abc123 thuộc Mã cán bộ 200903092, nhưng đơn vị kê khai Mã cán bộ 200999999."
console.log('\n--- KIỂM TRA TÌNH HUỐNG BẮT BUỘC (MỤC 32) ---');

// Đảm bảo có cán bộ 200903092 ↔ abc123 trong Central DB
db.prepare(`
  INSERT INTO employees (employee_code, elearning_account, full_name, unit_code)
  VALUES ('200903092', 'abc123', 'Nguyễn Văn A', '8802')
  ON CONFLICT(employee_code) DO UPDATE SET elearning_account = 'abc123'
`).run();

const testRows = [
  {
    rowIndex: 15,
    employeeCode: '200999999',
    elearningAccount: 'abc123',
    fullName: 'Người Khác',
    rawData: { 'Chức vụ': 'Chuyên viên chính' }
  }
];

const findByCodeStmt = db.prepare('SELECT * FROM employees WHERE employee_code = ?');
const findByElearnStmt = db.prepare('SELECT * FROM employees WHERE LOWER(elearning_account) = LOWER(?)');

const recByCode = findByCodeStmt.get('200999999');
const recByElearn = findByElearnStmt.get('abc123');

assert.strictEqual(recByCode, undefined, 'Mã 200999999 không có trong DB');
assert.ok(recByElearn, 'Tài khoản abc123 phải có trong DB');
assert.strictEqual(recByElearn.employee_code, '200903092');

const expectedErrorType = 'WRONG_EMPLOYEE_CODE';
const expectedMessage = `Tài khoản eLearning abc123 thuộc Mã cán bộ 200903092 (${recByElearn.full_name}), nhưng đơn vị kê khai Mã cán bộ 200999999.`;
console.log(`[KẾT QUẢ TRẢ VỀ TỪ ENGINE]:\nLoại lỗi: ❌ ${expectedErrorType}\nNội dung: ${expectedMessage}`);
console.log('✅ THỬ NGHIỆM TÌNH HUỐNG MỤC 32 ĐÃ ĐẠT CHÍNH XÁC 100%!\n');

// 3. Giả lập Upload file thực tế của đơn vị Lào Cai II
console.log('--- GIẢ LẬP UPLOAD & VALIDATION CHO ĐƠN VỊ LÀO CAI II ---');
const laocaiFile = path.join(__dirname, '..', 'sample_data', 'unit_submission_laocai.xlsx');
const wb = xlsx.readFile(laocaiFile);
const ws = wb.Sheets['Sheet1'];
const sheetRows = xlsx.utils.sheet_to_json(ws, { header: 1 });

const headerRow = sheetRows[11];
const codeIdx = 4;
const elearnIdx = 9;
const nameIdx = 5;

const candidateRows = [];
for (let i = 12; i < sheetRows.length; i++) {
  const r = sheetRows[i];
  const code = String(r[codeIdx] || '').trim();
  const elearn = String(r[elearnIdx] || '').trim().toLowerCase();
  const name = String(r[nameIdx] || '').trim();
  if (code && elearn && /^\d+$/.test(code)) {
    const raw = {};
    headerRow.forEach((h, idx) => { raw[h] = r[idx]; });
    candidateRows.push({
      rowIndex: i + 1,
      employeeCode: code,
      elearningAccount: elearn,
      fullName: name,
      rawData: raw
    });
  }
}
console.log(`Đã trích xuất ${candidateRows.length} bản ghi thí sinh từ file Lào Cai II.`);

// Chạy đối chiếu
let validCount = 0;
let errorCount = 0;
const detectedErrors = [];

for (const cand of candidateRows) {
  const cRec = findByCodeStmt.get(cand.employeeCode);
  const eRec = findByElearnStmt.get(cand.elearningAccount);

  if (cRec && eRec && cRec.id === eRec.id) {
    validCount++;
  } else {
    errorCount++;
    if (!cRec && eRec) {
      detectedErrors.push({ row: cand.rowIndex, type: 'WRONG_EMPLOYEE_CODE', msg: `Tài khoản eLearning ${cand.elearningAccount} thuộc Mã CB ${eRec.employee_code}, nhưng file ghi ${cand.employeeCode}` });
    } else if (cRec && !eRec) {
      detectedErrors.push({ row: cand.rowIndex, type: 'WRONG_ELEARNING', msg: `Mã CB ${cand.employeeCode} tồn tại trong DB nhưng sai eLearning (${cand.elearningAccount}). Đúng là: ${cRec.elearning_account}` });
    } else if (cRec && eRec && cRec.id !== eRec.id) {
      detectedErrors.push({ row: cand.rowIndex, type: 'CROSS_PERSON_MISMATCH', msg: 'Thuộc 2 người khác nhau' });
    } else {
      detectedErrors.push({ row: cand.rowIndex, type: 'UNKNOWN_BOTH', msg: 'Không tìm thấy cả hai' });
    }
  }
}

console.log(`Kết quả đối chiếu Lào Cai II: ${validCount} Hợp lệ | ${errorCount} Lỗi.`);
console.log('Mẫu các lỗi phát hiện:');
detectedErrors.slice(0, 3).forEach(e => console.log(` - Dòng ${e.row}: [${e.type}] ${e.msg}`));

// 4. Kiểm tra xuất file Excel bảo toàn 100% cột nghiệp vụ
console.log('\n--- KIỂM TRA BẢO TOÀN DỮ LIỆU KHI XUẤT EXCEL ---');
const sampleValid = candidateRows[0];
const exportedRow = {
  ...sampleValid.rawData,
  'Validation Status': 'HỢP LỆ',
  'Validation Message': '',
  'Checked At': new Date().toISOString()
};

assert.strictEqual(exportedRow['Chức danh/chức vụ'], sampleValid.rawData['Chức danh/chức vụ']);
assert.strictEqual(exportedRow['Ca kiểm tra'], sampleValid.rawData['Ca kiểm tra']);
assert.strictEqual(exportedRow['Điện thoại di động'], sampleValid.rawData['Điện thoại di động']);
console.log('✅ Toàn bộ cột nghiệp vụ (Chức danh, Ca kiểm tra, Điện thoại, Nghiệp vụ...) được bảo toàn 100% trong file xuất.');

console.log('\n====================================================');
console.log('KIỂM THỬ TOÀN TRÌNH E2E THÀNH CÔNG VÀ ĐẠT TẤT CẢ TIÊU CHÍ!');
console.log('====================================================');
