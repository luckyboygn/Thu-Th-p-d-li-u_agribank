const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('--- SEEDING DATABASE ---');

// 1. Tạo đơn vị mẫu (bao gồm các chi nhánh từ file thực tế)
const sampleUnits = [
  { code: '8802', name: 'Chi nhánh Lào Cai II' },
  { code: '3160', name: 'Chi nhánh Sóc Sơn' },
  { code: '1400', name: 'Chi nhánh Tây Hồ' },
  { code: '6900', name: 'Chi nhánh Đồng Tháp' },
  { code: '1500', name: 'Chi nhánh Hà Nội' },
  { code: '1600', name: 'Chi nhánh TP. Hồ Chí Minh' },
  { code: '1700', name: 'Chi nhánh Đà Nẵng' },
  { code: '1800', name: 'Chi nhánh Cần Thơ' },
  { code: '1900', name: 'Chi nhánh Hải Phòng' },
  { code: '2000', name: 'Chi nhánh Nghệ An' },
];

// Tạo thêm các đơn vị để đủ chính xác 162 đơn vị
let idx = 1;
while (sampleUnits.length < 162) {
  const code = (3000 + idx).toString();
  if (!sampleUnits.some(u => u.code === code)) {
    sampleUnits.push({
      code: code,
      name: `Chi nhánh Đơn vị ${code}`
    });
  }
  idx++;
}

const insertUnit = db.prepare(`
  INSERT OR IGNORE INTO units (unit_code, unit_name, status)
  VALUES (?, ?, 'ACTIVE')
`);

sampleUnits.forEach(u => {
  insertUnit.run(u.code, u.name);
});
console.log(`✅ Đã nạp ${sampleUnits.length} đơn vị vào bảng units.`);

// 2. Tạo tài khoản Admin và Unit Admin
const salt = bcrypt.genSaltSync(10);
const adminPassHash = bcrypt.hashSync('Admin@123456', salt);
const unitPassHash = bcrypt.hashSync('Unit@123456', salt);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password_hash, full_name, role, unit_id, status)
  VALUES (?, ?, ?, ?, ?, 'ACTIVE')
`);

// Tài khoản Super Admin
insertUser.run('admin', adminPassHash, 'Quản trị viên Trung tâm', 'SUPER_ADMIN', null);

// Lấy danh sách units từ DB để map unit_id
const unitsInDb = db.prepare('SELECT id, unit_code, unit_name FROM units').all();
const unitMap = {};
unitsInDb.forEach(u => { unitMap[u.unit_code] = u.id; });

// Tài khoản cho các chi nhánh mẫu
['8802', '3160', '1400', '6900', '1500', '1600'].forEach(code => {
  if (unitMap[code]) {
    insertUser.run(
      `unit_${code}`,
      unitPassHash,
      `Quản trị ${sampleUnits.find(u => u.code === code)?.name || code}`,
      'UNIT_ADMIN',
      unitMap[code]
    );
  }
});
console.log('✅ Đã tạo tài khoản Quản trị viên (admin / Admin@123456) và các Unit Admin (unit_8802, unit_1400... / Unit@123456)');

// 3. Tạo kỳ thi mẫu
const insertExam = db.prepare(`
  INSERT OR IGNORE INTO exams (code, title, description, status, start_date, end_date)
  VALUES (?, ?, ?, ?, ?, ?)
`);
insertExam.run(
  'EXAM_DOT_2_2026',
  'Kỳ kiểm tra chuyên môn nghiệp vụ định kỳ Đợt II năm 2026',
  'Kiểm tra định kỳ toàn hệ thống 162 đơn vị Agribank năm 2026',
  'OPEN',
  '2026-09-01',
  '2026-10-31'
);
console.log('✅ Đã tạo kỳ thi mặc định: EXAM_DOT_2_2026');

// 4. Import Master Employees từ sample_data/master_users.xlsx nếu có
const masterFile = path.join(__dirname, '..', 'sample_data', 'master_users.xlsx');
if (fs.existsSync(masterFile)) {
  const wb = xlsx.readFile(masterFile);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);
  
  const insertEmp = db.prepare(`
    INSERT OR IGNORE INTO employees (employee_code, elearning_account, full_name, unit_code, raw_info)
    VALUES (?, ?, ?, ?, ?)
  `);

  let importedCount = 0;
  for (const r of rows) {
    const code = String(r['Mã cán bộ'] || '').trim();
    const elearn = String(r['Tên đăng nhập'] || '').trim().toLowerCase();
    const name = String(r['Họ và tên'] || '').trim();
    if (code && elearn) {
      insertEmp.run(code, elearn, name, 'CENTRAL', JSON.stringify(r));
      importedCount++;
    }
  }
  console.log(`✅ Đã nạp ${importedCount} cán bộ từ master_users.xlsx vào Central Database.`);
}

// 5. Nạp thêm các cán bộ từ file đơn vị Lào Cai II vào Central Database để phục vụ kiểm thử đối chiếu
const laocaiFile = path.join(__dirname, '..', 'sample_data', 'unit_submission_laocai.xlsx');
if (fs.existsSync(laocaiFile)) {
  const wb = xlsx.readFile(laocaiFile);
  const sheet = wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  const insertEmp = db.prepare(`
    INSERT OR IGNORE INTO employees (employee_code, elearning_account, full_name, unit_code, raw_info)
    VALUES (?, ?, ?, ?, ?)
  `);

  let lcCount = 0;
  for (let i = 12; i < rows.length; i++) {
    const r = rows[i];
    const code = String(r[4] || '').trim();
    const name = String(r[5] || '').trim();
    const elearn = String(r[9] || '').trim().toLowerCase();
    if (code && elearn && /^\d+$/.test(code)) {
      insertEmp.run(code, elearn, name, '8802', JSON.stringify({ raw_row: r }));
      lcCount++;
    }
  }
  console.log(`✅ Đã nạp bổ sung ${lcCount} cán bộ mẫu chuẩn từ Lào Cai II vào Central Database.`);
}

const totalEmp = db.prepare('SELECT count(*) as count FROM employees').get();
console.log(`Tổng số cán bộ trong Database trung tâm hiện tại: ${totalEmp.count}`);
