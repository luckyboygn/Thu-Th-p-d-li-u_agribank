const { DatabaseSync } = require('node:sqlite');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

const laocaiFile = path.join(__dirname, '..', 'sample_data', 'unit_submission_laocai.xlsx');
console.log('Testing file:', laocaiFile);

const wb = xlsx.readFile(laocaiFile);
const sheetName = 'Sheet1';
const ws = wb.Sheets[sheetName];
const rawData = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Test header detection
console.log('--- 1. HEADER DETECTION ---');
let bestRow = -1;
let bestScore = -1;
for (let r = 0; r < Math.min(25, rawData.length); r++) {
  const row = rawData[r];
  let score = 0;
  for (const cell of row) {
    const s = String(cell).toLowerCase();
    if (s.includes('mã cán bộ') || s.includes('mã cb')) score += 10;
    if (s.includes('e-learning') || s.includes('elearning')) score += 10;
    if (s.includes('họ và tên')) score += 5;
  }
  if (score > bestScore) {
    bestScore = score;
    bestRow = r;
  }
}
console.log(`Detected header row at index: ${bestRow} (Line ${bestRow + 1} in Excel)`);
console.log('Headers:', rawData[bestRow]);

// Test parsing records
console.log('\n--- 2. PARSING ROWS ---');
const headers = rawData[bestRow];
const codeIdx = headers.findIndex(h => String(h).toLowerCase().includes('mã cán bộ'));
const elearnIdx = headers.findIndex(h => String(h).toLowerCase().includes('e-learning'));
const nameIdx = headers.findIndex(h => String(h).toLowerCase().includes('họ và tên'));

const records = [];
for (let r = bestRow + 1; r < rawData.length; r++) {
  const row = rawData[r];
  const code = String(row[codeIdx] || '').trim();
  const elearn = String(row[elearnIdx] || '').trim().toLowerCase();
  const name = String(row[nameIdx] || '').trim();
  if (code && elearn && /^\d+$/.test(code)) {
    const rowObj = {};
    headers.forEach((h, i) => { rowObj[h] = row[i]; });
    records.push({
      rowIndex: r + 1,
      employeeCode: code,
      elearningAccount: elearn,
      fullName: name,
      rawData: rowObj
    });
  }
}
console.log(`Extracted valid candidate records: ${records.length}`);

// Test validation against Central DB
console.log('\n--- 3. BIDIRECTIONAL VALIDATION AGAINST CENTRAL DB ---');
const findByCodeStmt = db.prepare('SELECT * FROM employees WHERE employee_code = ?');
const findByElearnStmt = db.prepare('SELECT * FROM employees WHERE LOWER(elearning_account) = LOWER(?)');

let validCount = 0;
let errorCount = 0;
const errors = [];

for (const rec of records) {
  const recCode = findByCodeStmt.get(rec.employeeCode);
  const recElearn = findByElearnStmt.get(rec.elearningAccount);

  if (recCode && recElearn && recCode.id === recElearn.id) {
    validCount++;
  } else {
    errorCount++;
    errors.push({ rec, recCode, recElearn });
  }
}

console.log(`Kết quả: Hợp lệ = ${validCount}/${records.length}, Lỗi = ${errorCount}`);
if (errorCount > 0) {
  console.log('Chi tiết lỗi:', errors.slice(0, 5));
} else {
  console.log('✅ Toàn bộ danh sách mẫu chi nhánh Lào Cai II khớp hoàn toàn 100% với Central Database!');
}
