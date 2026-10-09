import { DatabaseSync } from 'node:sqlite';

async function runHierarchyTests() {
  console.log('--- TEST SUITE: UNIT HIERARCHY & REGIONS (MỤC 2.3) ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      process.exitCode = 1;
    }
  }

  // Khởi tạo DB in-memory để test
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_code VARCHAR(50) UNIQUE NOT NULL,
      unit_name VARCHAR(255) NOT NULL,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      unit_type VARCHAR(50) DEFAULT 'BRANCH_L1',
      region VARCHAR(50) DEFAULT 'MIEN_BAC',
      parent_unit_id INTEGER REFERENCES units(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE exam_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'UPLOADED'
    );

    CREATE TABLE training_demand_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT'
    );

    INSERT INTO units (id, unit_code, unit_name, unit_type, region, parent_unit_id)
    VALUES (1, '0001', 'Trụ sở chính Agribank', 'HO', 'HO', NULL);

    INSERT INTO units (id, unit_code, unit_name, unit_type, region, parent_unit_id)
    VALUES (2, '2500', 'Agribank Chi nhánh Bắc Giang', 'BRANCH_L1', 'MIEN_BAC', 1);

    INSERT INTO units (id, unit_code, unit_name, unit_type, region, parent_unit_id)
    VALUES (3, '2501', 'Agribank Chi nhánh Lục Ngạn', 'BRANCH_L2', 'MIEN_BAC', 2);

    INSERT INTO units (id, unit_code, unit_name, unit_type, region, parent_unit_id)
    VALUES (4, '4100', 'Agribank Chi nhánh Đà Nẵng', 'BRANCH_L1', 'MIEN_TRUNG', 1);

    INSERT INTO units (id, unit_code, unit_name, unit_type, region, parent_unit_id)
    VALUES (5, '5200', 'Agribank Chi nhánh Đắk Lắk', 'BRANCH_L1', 'TAY_NGUYEN', 1);

    INSERT INTO units (id, unit_code, unit_name, unit_type, region, parent_unit_id)
    VALUES (6, '6100', 'Agribank Chi nhánh Sài Gòn', 'BRANCH_L1', 'MIEN_NAM', 1);
  `);

  // Test 1: Bảng units có đầy đủ các trường phân cấp và vùng miền
  const cols = (db.prepare('PRAGMA table_info(units)').all() as any[]).map(c => c.name);
  assert(cols.includes('unit_type'), 'Cột unit_type tồn tại trong schema');
  assert(cols.includes('region'), 'Cột region tồn tại trong schema');
  assert(cols.includes('parent_unit_id'), 'Cột parent_unit_id tồn tại trong schema');

  // Test 2: Đơn vị cha - con được liên kết chính xác
  const child = db.prepare(`
    SELECT u.unit_name, p.unit_name as parent_name
    FROM units u
    LEFT JOIN units p ON u.parent_unit_id = p.id
    WHERE u.id = 3
  `).get() as any;
  assert(child.parent_name === 'Agribank Chi nhánh Bắc Giang', 'Chi nhánh Lục Ngạn trực thuộc Chi nhánh Bắc Giang');

  // Test 3: Lọc đơn vị theo vùng miền
  const mienBacUnits = db.prepare('SELECT id FROM units WHERE region = ?').all('MIEN_BAC');
  assert(mienBacUnits.length === 2, `Lọc Miền Bắc trả về đúng 2 đơn vị (thực tế: ${mienBacUnits.length})`);

  const mienTrungUnits = db.prepare('SELECT id FROM units WHERE region = ?').all('MIEN_TRUNG');
  assert(mienTrungUnits.length === 1, 'Lọc Miền Trung trả về đúng 1 đơn vị');

  // Test 4: Lọc đơn vị theo phân loại cấp tổ chức
  const l1Units = db.prepare('SELECT id FROM units WHERE unit_type = ?').all('BRANCH_L1');
  assert(l1Units.length === 4, `Lọc Chi nhánh Loại 1 trả về đúng 4 đơn vị (thực tế: ${l1Units.length})`);

  const hoUnits = db.prepare('SELECT id FROM units WHERE unit_type = ?').all('HO');
  assert(hoUnits.length === 1, 'Lọc Trụ sở chính trả về đúng 1 đơn vị');

  // Test 5: Cập nhật phân cấp đơn vị
  db.prepare(`
    UPDATE units
    SET unit_type = 'BRANCH_L1', parent_unit_id = 1
    WHERE id = 3
  `).run();
  const updatedLụcNgan = db.prepare('SELECT unit_type, parent_unit_id FROM units WHERE id = 3').get() as any;
  assert(updatedLụcNgan.unit_type === 'BRANCH_L1', 'Đã thăng hạng Lục Ngạn lên BRANCH_L1 thành công');
  assert(updatedLụcNgan.parent_unit_id === 1, 'Đơn vị cấp trên chuyển về Trụ sở chính thành công');

  // Test 6: Thống kê tổng hợp Dashboard nhóm theo Vùng miền
  const summaryByRegion: Record<string, number> = {};
  const allUnits = db.prepare('SELECT region FROM units').all() as any[];
  allUnits.forEach(u => {
    summaryByRegion[u.region] = (summaryByRegion[u.region] || 0) + 1;
  });
  assert(summaryByRegion['MIEN_BAC'] === 2, 'Tổng kết Miền Bắc: 2 đơn vị');
  assert(summaryByRegion['MIEN_TRUNG'] === 1, 'Tổng kết Miền Trung: 1 đơn vị');
  assert(summaryByRegion['TAY_NGUYEN'] === 1, 'Tổng kết Tây Nguyên: 1 đơn vị');
  assert(summaryByRegion['MIEN_NAM'] === 1, 'Tổng kết Miền Nam: 1 đơn vị');
  assert(summaryByRegion['HO'] === 1, 'Tổng kết Trụ sở chính: 1 đơn vị');

  console.log(`\n=> KẾT QUẢ: ${passed}/${total} TESTS ĐẠT.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runHierarchyTests().catch(err => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});
