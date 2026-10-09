import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const backupPath = path.resolve(process.cwd(), 'data', `database.sqlite.bak_155_${Date.now()}`);

console.log('1. Backing up database to:', backupPath);
fs.copyFileSync(dbPath, backupPath);

const db = new DatabaseSync(dbPath);

export const UNITS_155 = [
  { id: 1, code: '2500', name: 'Agribank Chi nhánh Bắc Giang' },
  { id: 2, code: '2501', name: 'Agribank Chi nhánh Bắc Giang II' },
  { id: 3, code: '8600', name: 'Agribank Chi nhánh Bắc Kạn' },
  { id: 4, code: '3200', name: 'Agribank Chi nhánh Nam Định' },
  { id: 5, code: '3203', name: 'Agribank Chi nhánh Bắc Nam Định' },
  { id: 6, code: '2600', name: 'Agribank Chi nhánh Bắc Ninh' },
  { id: 7, code: '2603', name: 'Agribank Chi nhánh Bắc Ninh II' },
  { id: 8, code: '8300', name: 'Agribank Chi nhánh Cao Bằng' },
  { id: 9, code: '8900', name: 'Agribank Chi nhánh Điện Biên' },
  { id: 10, code: '8200', name: 'Agribank Chi nhánh Hà Giang' },
  { id: 11, code: '2900', name: 'Agribank Chi nhánh Hà Nam' },
  { id: 12, code: '2906', name: 'Agribank Chi nhánh Hà Nam II' },
  { id: 13, code: '2300', name: 'Agribank Chi nhánh Hải Dương' },
  { id: 14, code: '2311', name: 'Agribank Chi nhánh Hải Dương II' },
  { id: 15, code: '2100', name: 'Agribank Chi nhánh Hải Phòng' },
  { id: 16, code: '2112', name: 'Agribank Chi nhánh Đông Hải Phòng' },
  { id: 17, code: '2111', name: 'Agribank Chi nhánh Bắc Hải Phòng' },
  { id: 18, code: '3000', name: 'Agribank Chi nhánh Hòa Bình' },
  { id: 19, code: '2400', name: 'Agribank Chi nhánh Hưng Yên' },
  { id: 20, code: '2407', name: 'Agribank Chi nhánh Hưng Yên II' },
  { id: 21, code: '7800', name: 'Agribank Chi nhánh Lai Châu' },
  { id: 22, code: '8400', name: 'Agribank Chi nhánh Lạng Sơn' },
  { id: 23, code: '8800', name: 'Agribank Chi nhánh Lào Cai' },
  { id: 24, code: '8802', name: 'Agribank Chi nhánh Lào Cai II' },
  { id: 25, code: '3300', name: 'Agribank Chi nhánh Ninh Bình' },
  { id: 26, code: '3303', name: 'Agribank Chi nhánh Nam Ninh Bình' },
  { id: 27, code: '2700', name: 'Agribank Chi nhánh Phú Thọ' },
  { id: 28, code: '2707', name: 'Agribank Chi nhánh Phú Thọ II' },
  { id: 29, code: '8000', name: 'Agribank Chi nhánh Quảng Ninh' },
  { id: 30, code: '8003', name: 'Agribank Chi nhánh Tây Quảng Ninh' },
  { id: 31, code: '8090', name: 'Agribank Chi nhánh Đông Quảng Ninh' },
  { id: 32, code: '7900', name: 'Agribank Chi nhánh Sơn La' },
  { id: 33, code: '7902', name: 'Agribank Chi nhánh Sơn La II' },
  { id: 34, code: '3400', name: 'Agribank Chi nhánh Thái Bình' },
  { id: 35, code: '3401', name: 'Agribank Chi nhánh Bắc Thái Bình' },
  { id: 36, code: '8500', name: 'Agribank Chi nhánh Thái Nguyên' },
  { id: 37, code: '8501', name: 'Agribank Chi nhánh Nam Thái Nguyên' },
  { id: 38, code: '8100', name: 'Agribank Chi nhánh Tuyên Quang' },
  { id: 39, code: '2800', name: 'Agribank Chi nhánh Vĩnh Phúc' },
  { id: 40, code: '2890', name: 'Agribank Chi nhánh Vĩnh Phúc II' },
  { id: 41, code: '8700', name: 'Agribank Chi nhánh Yên Bái' },
  { id: 42, code: '8702', name: 'Agribank Chi nhánh Bắc Yên Bái' },
  { id: 43, code: '1080', name: 'Agribank Chi nhánh Ngân quỹ miền Bắc' },
  { id: 44, code: '1440', name: 'Agribank Chi nhánh Bắc Hà Nội' },
  { id: 45, code: '1500', name: 'Agribank Chi nhánh Hà Nội' },
  { id: 46, code: '1507', name: 'Agribank Chi nhánh Cầu Giấy' },
  { id: 47, code: '3140', name: 'Agribank Chi nhánh Đông Anh' },
  { id: 48, code: '1504', name: 'Agribank Chi nhánh Đống Đa' },
  { id: 49, code: '3120', name: 'Agribank Chi nhánh Gia Lâm' },
  { id: 50, code: '2200', name: 'Agribank Chi nhánh Hà Tây' },
  { id: 51, code: '2203', name: 'Agribank Chi nhánh Hà Tây I' },
  { id: 52, code: '1505', name: 'Agribank Chi nhánh Hà Nội II' },
  { id: 53, code: '1401', name: 'Agribank Chi nhánh Hà Nội I' },
  { id: 54, code: '1240', name: 'Agribank Chi nhánh Hoàng Mai' },
  { id: 55, code: '1303', name: 'Agribank Chi nhánh Hà Thành' },
  { id: 56, code: '1482', name: 'Agribank Chi nhánh Hùng Vương' },
  { id: 57, code: '1400', name: 'Agribank Chi nhánh Láng Hạ' },
  { id: 58, code: '1220', name: 'Agribank Chi nhánh Sông Hồng' },
  { id: 59, code: '2802', name: 'Agribank Chi nhánh Mê Linh' },
  { id: 60, code: '1410', name: 'Agribank Chi nhánh Mỹ Đình' },
  { id: 61, code: '1200', name: 'Agribank Chi nhánh Sở Giao dịch' },
  { id: 62, code: '3160', name: 'Agribank Chi nhánh Sóc Sơn' },
  { id: 63, code: '1508', name: 'Agribank Chi nhánh Tam Trinh' },
  { id: 64, code: '1506', name: 'Agribank Chi nhánh Tây Hồ' },
  { id: 65, code: '1300', name: 'Agribank Chi nhánh Thăng Long' },
  { id: 66, code: '3180', name: 'Agribank Chi nhánh Thanh Trì' },
  { id: 67, code: '1305', name: 'Agribank Chi nhánh Tràng An' },
  { id: 68, code: '1302', name: 'Agribank Chi nhánh Trung Yên' },
  { id: 69, code: '3100', name: 'Agribank Chi nhánh Từ Liêm' },
  { id: 70, code: '2208', name: 'Agribank Chi nhánh Thường Tín' },
  { id: 71, code: '5200', name: 'Agribank Chi nhánh Đắk Lắk' },
  { id: 72, code: '5219', name: 'Agribank Chi nhánh Bắc Đắk Lắk' },
  { id: 73, code: '4300', name: 'Agribank Chi nhánh Bình Định' },
  { id: 74, code: '4800', name: 'Agribank Chi nhánh Bình Thuận' },
  { id: 75, code: '5300', name: 'Agribank Chi nhánh Đắk Nông' },
  { id: 76, code: '5000', name: 'Agribank Chi nhánh Gia Lai' },
  { id: 77, code: '5020', name: 'Agribank Chi nhánh Đông Gia Lai' },
  { id: 78, code: '3700', name: 'Agribank Chi nhánh Hà Tĩnh' },
  { id: 79, code: '3701', name: 'Agribank Chi nhánh Hà Tĩnh II' },
  { id: 80, code: '4700', name: 'Agribank Chi nhánh Khánh Hòa' },
  { id: 81, code: '5100', name: 'Agribank Chi nhánh Kon Tum' },
  { id: 82, code: '5400', name: 'Agribank Chi nhánh Lâm Đồng' },
  { id: 83, code: '5402', name: 'Agribank Chi nhánh Lâm Đồng II' },
  { id: 84, code: '3600', name: 'Agribank Chi nhánh Nghệ An' },
  { id: 85, code: '3611', name: 'Agribank Chi nhánh Tây Nghệ An' },
  { id: 86, code: '3601', name: 'Agribank Chi nhánh Nam Nghệ An' },
  { id: 87, code: '4900', name: 'Agribank Chi nhánh Ninh Thuận' },
  { id: 88, code: '4600', name: 'Agribank Chi nhánh Phú Yên' },
  { id: 89, code: '3800', name: 'Agribank Chi nhánh Quảng Bình' },
  { id: 90, code: '3801', name: 'Agribank Chi nhánh Bắc Quảng Bình' },
  { id: 91, code: '4200', name: 'Agribank Chi nhánh Quảng Nam' },
  { id: 92, code: '4500', name: 'Agribank Chi nhánh Quảng Ngãi' },
  { id: 93, code: '3900', name: 'Agribank Chi nhánh Quảng Trị' },
  { id: 94, code: '3500', name: 'Agribank Chi nhánh Thanh Hóa' },
  { id: 95, code: '3519', name: 'Agribank Chi nhánh Nam Thanh Hóa' },
  { id: 96, code: '3590', name: 'Agribank Chi nhánh Bắc Thanh Hóa' },
  { id: 97, code: '4000', name: 'Agribank Chi nhánh Thừa Thiên Huế' },
  { id: 98, code: '2000', name: 'Agribank Chi nhánh Đà Nẵng' },
  { id: 99, code: '2001', name: 'Agribank Chi nhánh Nam Đà Nẵng' },
  { id: 100, code: '1606', name: 'Agribank Chi nhánh An Phú' },
  { id: 101, code: '6321', name: 'Agribank Chi nhánh Bắc Sài Gòn' },
  { id: 102, code: '6440', name: 'Agribank Chi nhánh Nam TP.HCM' },
  { id: 103, code: '1090', name: 'Agribank Chi nhánh Bến Thành' },
  { id: 104, code: '6200', name: 'Agribank Chi nhánh Bình Tân' },
  { id: 105, code: '6380', name: 'Agribank Chi nhánh Bình Thạnh' },
  { id: 106, code: '6110', name: 'Agribank Chi nhánh Bình Triệu' },
  { id: 107, code: '6180', name: 'Agribank Chi nhánh Cần Giờ' },
  { id: 108, code: '6420', name: 'Agribank Chi nhánh 10' },
  { id: 109, code: '1602', name: 'Agribank Chi nhánh Tân Định' },
  { id: 110, code: '6170', name: 'Agribank Chi nhánh 7' },
  { id: 111, code: '6300', name: 'Agribank Chi nhánh 9' },
  { id: 112, code: '6120', name: 'Agribank Chi nhánh Củ Chi' },
  { id: 113, code: '6280', name: 'Agribank Chi nhánh Đông Sài Gòn' },
  { id: 114, code: '6140', name: 'Agribank Chi nhánh Hóc Môn' },
  { id: 115, code: '6421', name: 'Agribank Chi nhánh Bắc TP.HCM' },
  { id: 116, code: '1603', name: 'Agribank Chi nhánh Lý Thường Kiệt' },
  { id: 117, code: '6160', name: 'Agribank Chi nhánh Nam Sài Gòn' },
  { id: 118, code: '6340', name: 'Agribank Chi nhánh Nhà Bè' },
  { id: 119, code: '1604', name: 'Agribank Chi nhánh Phú Nhuận' },
  { id: 120, code: '6222', name: 'Agribank Chi nhánh 5' },
  { id: 121, code: '1600', name: 'Agribank Chi nhánh Sài Gòn' },
  { id: 122, code: '6360', name: 'Agribank Chi nhánh Tân Bình' },
  { id: 123, code: '6460', name: 'Agribank Chi nhánh Tân Phú' },
  { id: 124, code: '6320', name: 'Agribank Chi nhánh Tây Sài Gòn' },
  { id: 125, code: '6100', name: 'Agribank Chi nhánh Thủ Đức' },
  { id: 126, code: '1700', name: 'Agribank Chi nhánh TP.Hồ Chí Minh' },
  { id: 127, code: '1900', name: 'Agribank Chi nhánh Trung tâm Sài Gòn' },
  { id: 128, code: '6700', name: 'Agribank Chi nhánh An Giang' },
  { id: 129, code: '6000', name: 'Agribank Chi nhánh Bà Rịa - Vũng Tàu' },
  { id: 130, code: '7200', name: 'Agribank Chi nhánh Bạc Liêu' },
  { id: 131, code: '7100', name: 'Agribank Chi nhánh Bến Tre' },
  { id: 132, code: '5500', name: 'Agribank Chi nhánh Bình Dương' },
  { id: 133, code: '5600', name: 'Agribank Chi nhánh Bình Phước' },
  { id: 134, code: '5601', name: 'Agribank Chi nhánh Tây Bình Phước' },
  { id: 135, code: '7500', name: 'Agribank Chi nhánh Cà Mau' },
  { id: 136, code: '1800', name: 'Agribank Chi nhánh Cần Thơ II' },
  { id: 137, code: '5900', name: 'Agribank Chi nhánh Đồng Nai' },
  { id: 138, code: '5990', name: 'Agribank Chi nhánh Bắc Đồng Nai' },
  { id: 139, code: '5911', name: 'Agribank Chi nhánh Nam Đồng Nai' },
  { id: 140, code: '6500', name: 'Agribank Chi nhánh Đồng Tháp' },
  { id: 141, code: '7000', name: 'Agribank Chi nhánh Hậu Giang' },
  { id: 142, code: '5590', name: 'Agribank Chi nhánh KCN Sóng Thần' },
  { id: 143, code: '7700', name: 'Agribank Chi nhánh Kiên Giang' },
  { id: 144, code: '7709', name: 'Agribank Chi nhánh Kiên Giang II' },
  { id: 145, code: '6600', name: 'Agribank Chi nhánh Long An' },
  { id: 146, code: '6612', name: 'Agribank Chi nhánh Bắc Long An' },
  { id: 147, code: '6603', name: 'Agribank Chi nhánh Đông Long An' },
  { id: 148, code: '7790', name: 'Agribank Chi nhánh Phú Quốc' },
  { id: 149, code: '7600', name: 'Agribank Chi nhánh Sóc Trăng' },
  { id: 150, code: '5700', name: 'Agribank Chi nhánh Tây Ninh' },
  { id: 151, code: '6900', name: 'Agribank Chi nhánh Tiền Giang' },
  { id: 152, code: '7400', name: 'Agribank Chi nhánh Trà Vinh' },
  { id: 153, code: '7300', name: 'Agribank Chi nhánh Vĩnh Long' },
  { id: 154, code: '6090', name: 'Agribank Chi nhánh Vũng Tàu' },
  { id: 155, code: '9300', name: 'Agribank Chi nhánh Cambodia Branch' }
];

console.log('2. Disabling foreign keys and cleaning data...');
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('BEGIN TRANSACTION;');

try {
  // Clear any uploads / submissions / logs that were dummy
  db.exec(`
    DELETE FROM exam_records;
    DELETE FROM validation_errors;
    DELETE FROM exam_uploads;
    DELETE FROM submission_records;
    DELETE FROM submissions;
    DELETE FROM training_demand_program_topics;
    DELETE FROM training_demand_programs;
    DELETE FROM training_demand_topics;
    DELETE FROM training_demand_positions;
    DELETE FROM training_demand_submissions;
    DELETE FROM audit_logs WHERE unit_id IS NOT NULL;
  `);

  console.log('3. Cleaning users table (preserving admin & viewer)...');
  db.exec("DELETE FROM users WHERE role = 'UNIT_ADMIN';");

  console.log('4. Re-creating units table with 155 units...');
  db.exec('DELETE FROM units;');
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'units';");

  const insertUnit = db.prepare(`
    INSERT INTO units (id, unit_code, unit_name, user_account, status, created_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP)
  `);

  for (const u of UNITS_155) {
    insertUnit.run(u.id, u.code, u.name, `${u.code}_Admin`);
  }

  console.log('5. Ensuring admin & viewer accounts exist...');
  const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as any;
  const adminPasswordHash = bcrypt.hashSync('Admin@123456', 10);
  if (!existingAdmin) {
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, status)
      VALUES ('admin', ?, 'Quản trị viên Hệ thống', 'SUPER_ADMIN', 'ACTIVE')
    `).run(adminPasswordHash);
  }

  const existingViewer = db.prepare("SELECT id FROM users WHERE username = 'viewer'").get() as any;
  const viewerPasswordHash = bcrypt.hashSync('Viewer@123456', 10);
  if (!existingViewer) {
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, status)
      VALUES ('viewer', ?, 'Cán bộ Giám sát Toàn hệ thống', 'VIEWER', 'ACTIVE')
    `).run(viewerPasswordHash);
  }

  // Pre-hash password once for speed: 'Unit@123456'
  console.log('6. Generating unit admin accounts (password: Unit@123456 / 123456)...');
  const unitPasswordHash = bcrypt.hashSync('Unit@123456', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, unit_id, status, created_at)
    VALUES (?, ?, ?, 'UNIT_ADMIN', ?, 'ACTIVE', CURRENT_TIMESTAMP)
  `);

  for (const u of UNITS_155) {
    insertUser.run(`${u.code}_Admin`, unitPasswordHash, u.name, u.id);
  }

  db.exec('COMMIT;');
  db.exec('PRAGMA foreign_keys = ON;');
  console.log('Successfully re-seeded 155 units and accounts!');
} catch (e) {
  db.exec('ROLLBACK;');
  db.exec('PRAGMA foreign_keys = ON;');
  console.error('Error reseeding:', e);
  process.exit(1);
}

// Verification
const totalUnits = (db.prepare('SELECT COUNT(*) as count FROM units').get() as any).count;
const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
const unitAdmins = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'UNIT_ADMIN'").get() as any).count;
const firstUnit = db.prepare('SELECT * FROM units WHERE id = 1').get() as any;
const lastUnit = db.prepare('SELECT * FROM units WHERE id = 155').get() as any;
const firstUser = db.prepare("SELECT * FROM users WHERE username = '2500_Admin'").get() as any;

console.log('\n--- VERIFICATION RESULT ---');
console.log('Total units:', totalUnits);
console.log('Total users:', totalUsers);
console.log('Unit admins count:', unitAdmins);
console.log('First unit (ID 1):', firstUnit);
console.log('Last unit (ID 155):', lastUnit);
console.log('First user account:', firstUser?.username, 'unit_id:', firstUser?.unit_id);
