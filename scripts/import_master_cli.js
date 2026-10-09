const { DatabaseSync } = require('node:sqlite');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = process.argv[2] || path.join(__dirname, '..', 'sample_data', 'master_users.xlsx');

if (!fs.existsSync(filePath)) {
  console.error(`❌ Không tìm thấy file tại đường dẫn: ${filePath}`);
  console.log('Cách dùng: node scripts/import_master_cli.js "duong_dan_den_file.xlsx"');
  process.exit(1);
}

console.log(`Đang đọc file Database gốc: ${filePath} ...`);
const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

const wb = xlsx.readFile(filePath);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
const rows = xlsx.utils.sheet_to_json(ws);

if (rows.length === 0) {
  console.error('❌ File không có dòng dữ liệu nào.');
  process.exit(1);
}

const firstRow = rows[0];
const codeKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('mã cán bộ') || k.toLowerCase().includes('mã cb') || k.toLowerCase() === 'macb');
const elearnKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('tên đăng nhập') || k.toLowerCase().includes('e-learning') || k.toLowerCase().includes('elearning'));
const nameKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('họ') || k.toLowerCase().includes('tên'));
const unitKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('đơn vị') || k.toLowerCase().includes('chi nhánh'));

if (!codeKey || !elearnKey) {
  console.error(`❌ Không tìm thấy cột bắt buộc trong file. Cần có cột Mã cán bộ và Tên đăng nhập/eLearning.`);
  console.error(`Các cột tìm thấy: ${Object.keys(firstRow).join(', ')}`);
  process.exit(1);
}

console.log(`- Cột Mã cán bộ nhận diện: "${codeKey}"`);
console.log(`- Cột eLearning nhận diện:   "${elearnKey}"`);
console.log(`- Cột Họ và tên:            "${nameKey || 'Không có'}"`);

// Kiểm tra toàn vẹn 1-1
const seenCodes = new Map();
const seenElearns = new Map();
const qualityErrors = [];
const validItems = [];

rows.forEach((r, idx) => {
  const code = String(r[codeKey] || '').trim();
  const elearn = String(r[elearnKey] || '').trim().toLowerCase();
  const name = nameKey ? String(r[nameKey] || '').trim() : '';
  const unit = unitKey ? String(r[unitKey] || '').trim() : '';

  if (!code || !elearn) return;

  if (seenCodes.has(code) && seenCodes.get(code) !== elearn) {
    qualityErrors.push(`Dòng ${idx + 2}: Mã CB ${code} có nhiều eLearning (${seenCodes.get(code)} và ${elearn})`);
  }
  if (seenElearns.has(elearn) && seenElearns.get(elearn) !== code) {
    qualityErrors.push(`Dòng ${idx + 2}: eLearning ${elearn} có nhiều Mã CB (${seenElearns.get(elearn)} và ${code})`);
  }

  seenCodes.set(code, elearn);
  seenElearns.set(elearn, code);
  validItems.push({ code, elearn, name, unit, raw: r });
});

if (qualityErrors.length > 0) {
  console.error(`❌ File vi phạm nguyên tắc quan hệ 1-1! Có ${qualityErrors.length} lỗi.`);
  console.error('Mẫu 5 lỗi đầu tiên:');
  qualityErrors.slice(0, 5).forEach(e => console.error(' - ' + e));
  process.exit(1);
}

// Ghi vào Database
const insertOrUpdate = db.prepare(`
  INSERT INTO employees (employee_code, elearning_account, full_name, unit_code, raw_info)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(employee_code) DO UPDATE SET
    elearning_account = excluded.elearning_account,
    full_name = excluded.full_name,
    unit_code = excluded.unit_code,
    raw_info = excluded.raw_info,
    updated_at = CURRENT_TIMESTAMP
`);

db.exec('BEGIN TRANSACTION;');
let count = 0;
try {
  for (const item of validItems) {
    insertOrUpdate.run(item.code, item.elearn, item.name, item.unit, JSON.stringify(item.raw));
    count++;
  }
  db.exec('COMMIT;');
  console.log(`✅ Đã nạp thành công ${count} cán bộ vào Database trung tâm làm căn cứ đối chiếu!`);
  const total = db.prepare('SELECT count(*) as count FROM employees').get().count;
  console.log(`Tổng số cán bộ trong Database trung tâm hiện tại: ${total}`);
} catch (e) {
  db.exec('ROLLBACK;');
  console.error('❌ Lỗi khi ghi Database:', e.message);
  process.exit(1);
}
