const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function runMigration() {
  console.log('[MIGRATION 2.3] Bắt đầu migration Phân cấp đơn vị & Vùng miền (Hierarchy & Regions)...');

  const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupPath = path.join(backupDir, `pre_hierarchy_backup_${timestamp}.sqlite`);

  const db = new DatabaseSync(dbPath);

  try {
    // 1. Sao lưu an toàn CSDL
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    console.log(`[MIGRATION 2.3] Sao lưu an toàn CSDL tại: ${backupPath}`);
  } catch (err) {
    console.warn('[MIGRATION 2.3] Cảnh báo sao lưu:', err.message);
  }

  // 2. Thêm các cột vào bảng units nếu chưa có
  const tableInfo = db.prepare('PRAGMA table_info(units)').all();
  const existingCols = new Set(tableInfo.map(c => c.name));

  if (!existingCols.has('unit_type')) {
    db.exec("ALTER TABLE units ADD COLUMN unit_type VARCHAR(50) DEFAULT 'BRANCH_L1';");
    console.log('[MIGRATION 2.3] Đã thêm cột unit_type vào bảng units.');
  }

  if (!existingCols.has('region')) {
    db.exec("ALTER TABLE units ADD COLUMN region VARCHAR(50) DEFAULT 'MIEN_BAC';");
    console.log('[MIGRATION 2.3] Đã thêm cột region vào bảng units.');
  }

  if (!existingCols.has('parent_unit_id')) {
    db.exec("ALTER TABLE units ADD COLUMN parent_unit_id INTEGER REFERENCES units(id);");
    console.log('[MIGRATION 2.3] Đã thêm cột parent_unit_id vào bảng units.');
  }

  // 3. Phân loại thông minh ban đầu cho 162 đơn vị hiện có
  const allUnits = db.prepare('SELECT id, unit_code, unit_name, region, unit_type FROM units').all();

  const mienTrungKeywords = ['thanh hóa', 'nghệ an', 'hà tĩnh', 'quảng bình', 'quảng trị', 'thừa thiên', 'huế', 'đà nẵng', 'quảng nam', 'quảng ngãi', 'bình định', 'phú yên', 'khánh hòa', 'ninh thuận', 'bình thuận'];
  const tayNguyenKeywords = ['kon tum', 'gia lai', 'đắk lắk', 'đắk nông', 'lâm đồng'];
  const mienNamKeywords = ['hồ chí minh', 'sài gòn', 'bình dương', 'đồng nai', 'bà rịa', 'vũng tàu', 'tây ninh', 'bình phước', 'long an', 'tiền giang', 'bến tre', 'trà vinh', 'vĩnh long', 'đồng tháp', 'an giang', 'kiên giang', 'cần thơ', 'hậu giang', 'sóc trăng', 'bạc liêu', 'cà mau', 'chợ lớn', 'nam sài gòn', 'đông sài gòn', 'gia định', 'bến thành', 'an phú'];
  const hoKeywords = ['trụ sở chính', 'hội sở', 'trung tâm công nghệ', 'trường đào tạo'];

  let updatedCount = 0;
  for (const u of allUnits) {
    const nameLower = (u.unit_name || '').toLowerCase();
    let reg = 'MIEN_BAC';
    let type = 'BRANCH_L1';

    if (hoKeywords.some(k => nameLower.includes(k))) {
      reg = 'HO';
      type = 'HO';
    } else if (tayNguyenKeywords.some(k => nameLower.includes(k))) {
      reg = 'TAY_NGUYEN';
    } else if (mienTrungKeywords.some(k => nameLower.includes(k))) {
      reg = 'MIEN_TRUNG';
    } else if (mienNamKeywords.some(k => nameLower.includes(k))) {
      reg = 'MIEN_NAM';
    }

    if (nameLower.includes(' ii') || nameLower.includes(' 2') || nameLower.includes('loại ii')) {
      type = 'BRANCH_L2';
    }

    db.prepare('UPDATE units SET region = ?, unit_type = ? WHERE id = ?').run(reg, type, u.id);
    updatedCount++;
  }

  console.log(`[MIGRATION 2.3] Đã phân vùng & loại tự động cho ${updatedCount} đơn vị.`);
  console.log('[MIGRATION 2.3] Hoàn thành migration Mục 2.3 thành công 100%!');
}

runMigration();
