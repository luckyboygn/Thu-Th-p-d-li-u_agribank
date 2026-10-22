import { DatabaseSync } from 'node:sqlite';
import { validateCandidateBatch } from '../src/lib/validation';
import { ParsedRowData } from '../src/lib/excel';

console.log('=== KIỂM TRA & XÁC MINH: UNIT_CODE, PHẠM VI ĐƠN VỊ VÀ MẪU SỐ TIẾN ĐỘ ===\n');

const db = new DatabaseSync('data/database.sqlite');

// -------------------------------------------------------------------------
// VẤN ĐỀ 1: employees.unit_code vs units.unit_code
// -------------------------------------------------------------------------
console.log('--- VẤN ĐỀ 1: Kiểm tra khóa ngoại ngầm giữa employees và units ---');
const units = db.prepare('SELECT id, unit_code, unit_name, status, unit_type, parent_unit_id FROM units').all() as any[];
const unitCodeMap = new Map<string, any>();
units.forEach(u => unitCodeMap.set(String(u.unit_code).trim(), u));

const emps = db.prepare('SELECT id, employee_code, full_name, unit_code FROM employees').all() as any[];
const orphanEmps: any[] = [];
for (const e of emps) {
  const code = e.unit_code ? String(e.unit_code).trim() : '';
  if (!code || !unitCodeMap.has(code)) {
    orphanEmps.push(e);
  }
}

console.log(`- Tổng số cán bộ trong CSDL Master: ${emps.length}`);
console.log(`- Số cán bộ có unit_code không tồn tại trong bảng units: ${orphanEmps.length}`);
if (orphanEmps.length > 0) {
  orphanEmps.slice(0, 5).forEach(e => console.log(`  -> Mã CB: ${e.employee_code}, Tên: ${e.full_name}, Unit: ${e.unit_code}`));
} else {
  console.log('  -> Hiện tại tất cả 245 cán bộ đều có unit_code hợp lệ trong bảng units.');
}

// -------------------------------------------------------------------------
// VẤN ĐỀ 2: Mô phỏng UNIT_MISMATCH khi Chi nhánh loại 1 nộp cán bộ thuộc Chi nhánh loại 2 / PGD trực thuộc
// -------------------------------------------------------------------------
console.log('\n--- VẤN ĐỀ 2: Mô phỏng Chi nhánh loại 1 nộp cán bộ của Chi nhánh loại 2 trực thuộc ---');
// Giả lập cặp đơn vị cha - con: Chi nhánh Hà Nội (8802) và PGD Cầu Giấy (880201, parent = 8802)
const mockDb = new DatabaseSync(':memory:');
mockDb.exec(`
  CREATE TABLE units (
    id INTEGER PRIMARY KEY,
    unit_code VARCHAR(50),
    unit_name VARCHAR(150),
    unit_type VARCHAR(50),
    parent_unit_id INTEGER
  );
  INSERT INTO units VALUES
    (1, '8802', 'Agribank Chi nhánh Hà Nội (Loại 1)', 'BRANCH_L1', NULL),
    (2, '880201', 'Agribank PGD Cầu Giấy (Trực thuộc CN Hà Nội)', 'BRANCH_L2', 1);

  CREATE TABLE employees (
    id INTEGER PRIMARY KEY,
    employee_code VARCHAR(50),
    elearning_account VARCHAR(100),
    full_name VARCHAR(150),
    unit_code VARCHAR(50),
    unit_name VARCHAR(150),
    status VARCHAR(20) DEFAULT 'ACTIVE'
  );
  INSERT INTO employees VALUES 
    (100, '200799999', 'canbo_con', 'Nguyễn Văn Con', '880201', 'Agribank PGD Cầu Giấy (Trực thuộc CN Hà Nội)', 'ACTIVE');
`);

const rowFromParentUpload: ParsedRowData = {
  rowIndex: 2,
  employeeCode: '200799999',
  elearningAccount: 'canbo_con',
  fullName: 'Nguyễn Văn Con',
  rawData: {},
  isCandidateRow: true
};

// Chi nhánh cha nộp file (targetUnitCode = '8802')
const valResult = validateCandidateBatch(mockDb, [rowFromParentUpload], '8802');
const rec = valResult.records[0];

console.log(`Mô phỏng: Chi nhánh cha [8802] nộp cán bộ [200799999] có unit_code trong Master là PGD trực thuộc [880201]:`);
console.log(`  - Trạng thái dòng: ${rec.status}`);
console.log(`  - Danh sách lỗi/cảnh báo:`);
rec.errors.forEach(err => {
  console.log(`    -> [${err.errorType}] ${err.errorMessage} (Severity: ${err.severity})`);
});
const hasUnitMismatch = rec.errors.some(e => e.errorType === 'UNIT_MISMATCH');
console.log(`  => KẾT LUẬN VẤN ĐỀ 2: ${hasUnitMismatch ? 'CÓ BỊ CẢNH BÁO UNIT_MISMATCH (Do code hiện tại chỉ so sánh bằng chuỗi targetUnitCode, hoàn toàn không xét parent_unit_id).' : 'Không bị cảnh báo'}`);


// -------------------------------------------------------------------------
// VẤN ĐỀ 3: Xác định mẫu số "tổng số đơn vị" ở các câu truy vấn hiện có
// -------------------------------------------------------------------------
console.log('\n--- VẤN ĐỀ 3: Phân tích mẫu số "Tổng số đơn vị" trên toàn hệ thống ---');
const totalAll = db.prepare('SELECT COUNT(*) as c FROM units').get() as any;
const totalActive = db.prepare("SELECT COUNT(*) as c FROM units WHERE status = 'ACTIVE'").get() as any;
const totalInactive = db.prepare("SELECT COUNT(*) as c FROM units WHERE status != 'ACTIVE'").get() as any;
const totalHO = db.prepare("SELECT COUNT(*) as c FROM units WHERE unit_type = 'HO'").get() as any;
const totalSubsidiary = db.prepare("SELECT COUNT(*) as c FROM units WHERE unit_type = 'SUBSIDIARY'").get() as any;
const totalBranchL1 = db.prepare("SELECT COUNT(*) as c FROM units WHERE unit_type = 'BRANCH_L1'").get() as any;
const totalBranchL2 = db.prepare("SELECT COUNT(*) as c FROM units WHERE unit_type = 'BRANCH_L2'").get() as any;

console.log(`1. SELECT COUNT(*) FROM units (Đang dùng tại /api/training-reports dòng 54): ${totalAll.c}`);
console.log(`2. allUnits.length tại /api/dashboard/admin dòng 327: ${totalAll.c}`);
console.log(`3. Phân tách theo Trạng thái & Loại đơn vị:`);
console.log(`   - Chi nhánh Loại 1 (BRANCH_L1): ${totalBranchL1.c}`);
console.log(`   - Chi nhánh Loại 2 (BRANCH_L2): ${totalBranchL2.c}`);
console.log(`   - Trụ sở chính / Ban / Trung tâm (HO): ${totalHO.c}`);
console.log(`   - Công ty con / Sự nghiệp (SUBSIDIARY): ${totalSubsidiary.c}`);
console.log(`   - Đơn vị ACTIVE: ${totalActive.c} | Đơn vị INACTIVE: ${totalInactive.c}`);

console.log(`\n=> KẾT LUẬN VẤN ĐỀ 3:`);
console.log(`Cả 2 màn hình (Dashboard Admin và Báo cáo Đào tạo) hiện đều lấy mẫu số là ${totalAll.c} đơn vị, bao gồm cả ${totalHO.c} phòng ban/trung tâm Trụ sở chính (HO) và ${totalSubsidiary.c} công ty con, vốn không phải đối tượng nộp bài thi/khảo sát của chi nhánh.`);
