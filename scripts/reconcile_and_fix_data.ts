import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

/**
 * scripts/reconcile_and_fix_data.ts
 * Script chuẩn hóa và xử lý các điểm sai lệch dữ liệu phát hiện qua integrity_check:
 * 1. Chuẩn hóa 61 cán bộ bị rỗng unit_code trong bảng employees về đúng mã đơn vị 1040 (Trường Đào tạo CB).
 * 2. Làm sạch bảng submission_receipts:
 *    - Bổ sung bản ghi biên nhận hợp lệ cho submission 150 (unit 103, total 75) và submission 151 (unit 43, total 0).
 *    - Xóa các bản ghi biên nhận test cũ không khớp (id 8, 10 với total 223) của submission 154, bảo lưu biên nhận chính thức id 11 (total 1433).
 *
 * Chế độ chạy:
 * - Mặc định: --dry-run (chỉ hiển thị các thay đổi dự kiến, KHÔNG ghi vào DB).
 * - Thực thi: --apply (tự động sao lưu VACUUM INTO trước khi ghi, chạy trong 1 Transaction an toàn).
 */

const isApply = process.argv.includes('--apply');
const isDryRun = !isApply || process.argv.includes('--dry-run');

const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
console.log('='.repeat(90));
console.log(`SCRIPT ĐỐI SOÁT VÀ CHUẨN HÓA DỮ LIỆU CƠ SỞ DỮ LIỆU`);
console.log(`Chế độ: ${isApply ? '🚀 APPLY (GHI THỰC TẾ VÀO DB)' : '🔍 DRY-RUN (CHỈ KIỂM TRA & LIỆT KÊ)'}`);
console.log(`Thời điểm: ${new Date().toISOString()}`);
console.log(`File DB: ${dbPath}`);
console.log('='.repeat(90));

const db = new DatabaseSync(dbPath);

// Nếu chạy apply, thực hiện sao lưu trước tiên
if (isApply) {
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `database_pre_reconcile_${Date.now()}.sqlite`);
  db.exec(`VACUUM INTO '${backupPath.replace(/\\/g, '/')}';`);
  console.log(`[Backup an toàn] Đã sao lưu database thành công trước khi apply: ${backupPath}\n`);
}

// =========================================================================
// PHẦN 1: CHUẨN HÓA 61 CÁN BỘ BỊ RỖNG UNIT_CODE TRONG EMPLOYEES
// =========================================================================
console.log('--- PHẦN 1: RÀ SOÁT CÁN BỘ BỊ RỖNG UNIT_CODE ---');
const emptyUnitEmps = db.prepare(`
  SELECT id, employee_code, elearning_account, full_name, unit_code, unit_name
  FROM employees
  WHERE unit_code IS NULL OR unit_code = ''
`).all() as any[];

console.log(`Tìm thấy: ${emptyUnitEmps.length} cán bộ có unit_code bị rỗng.`);

// Kiểm tra xem đơn vị 1040 có trong bảng units không
const unit1040 = db.prepare("SELECT id, unit_code, unit_name FROM units WHERE unit_code = '1040'").get() as any;
const targetUnitCode = unit1040?.unit_code || '1040';
const targetUnitName = unit1040?.unit_name || 'Trường Đào tạo CB';

console.log(`Đơn vị chuẩn hóa gán: Mã [${targetUnitCode}] - Tên [${targetUnitName}]`);
if (emptyUnitEmps.length > 0) {
  console.log('Mẫu các cán bộ sẽ được cập nhật:', emptyUnitEmps.slice(0, 5).map(e => `${e.employee_code} - ${e.full_name} (${e.elearning_account})`));
}

// =========================================================================
// PHẦN 2: CHUẨN HÓA BẢNG SUBMISSION_RECEIPTS
// =========================================================================
console.log('\n--- PHẦN 2: RÀ SOÁT BIÊN NHẬN ĐIỆN TỬ SUBMISSION_RECEIPTS ---');

// 2a. Các biên nhận test cũ lệch số liệu của sub 154
const obsoleteReceipts = db.prepare(`
  SELECT r.id, r.receipt_code, r.target_type, r.target_id, r.total_records
  FROM submission_receipts r
  JOIN training_demand_submissions s ON r.target_type = 'TRAINING_DEMAND' AND r.target_id = s.id
  WHERE r.receipt_code != s.receipt_code
`).all() as any[];

console.log(`Biên nhận test cũ không khớp với mã biên nhận chính thức của hồ sơ: ${obsoleteReceipts.length} bản ghi.`);
obsoleteReceipts.forEach(r => {
  console.log(` - ID ${r.id}: Code [${r.receipt_code}], Target Sub ${r.target_id}, Total [${r.total_records}]`);
});

// 2b. Các hồ sơ SUBMITTED nhưng thiếu bản ghi trong submission_receipts
const missingReceiptSubs = db.prepare(`
  SELECT s.id, s.unit_id, s.collection_id, s.receipt_code, u.unit_code, u.unit_name
  FROM training_demand_submissions s
  JOIN units u ON s.unit_id = u.id
  WHERE s.status = 'SUBMITTED'
    AND s.receipt_code IS NOT NULL
    AND s.receipt_code NOT IN (SELECT receipt_code FROM submission_receipts)
`).all() as any[];

console.log(`Hồ sơ đã nộp chính thức nhưng thiếu bản ghi trong submission_receipts: ${missingReceiptSubs.length} hồ sơ.`);
const missingReceiptsToCreate: any[] = [];

for (const s of missingReceiptSubs) {
  // Tính tổng số lượt người học thực tế
  const progSum = (db.prepare(`
    SELECT COALESCE(SUM(dt.participant_count), 0) as s
    FROM training_demand_program_topics dt
    JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
    WHERE dp.submission_id = ?
  `).get(s.id) as any)?.s || 0;

  const propSum = (db.prepare(`
    SELECT COALESCE(SUM(participant_count), 0) as s
    FROM training_demand_proposals WHERE submission_id = ?
  `).get(s.id) as any)?.s || 0;

  const total = progSum + propSum;
  missingReceiptsToCreate.push({
    submission_id: s.id,
    unit_id: s.unit_id,
    unit_name: s.unit_name,
    receipt_code: s.receipt_code,
    total_records: total
  });
  console.log(` - Sub ${s.id} (${s.unit_name}): Sẽ tạo biên nhận mã [${s.receipt_code}], Tổng số lượt học viên = ${total}`);
}

// =========================================================================
// THỰC THI (NẾU CÓ CỜ --apply)
// =========================================================================
if (isApply) {
  console.log('\n' + '='.repeat(90));
  console.log('TIẾN HÀNH ÁP DỤNG THAY ĐỔI VÀO CƠ SỞ DỮ LIỆU TRONG 1 TRANSACTION...');
  console.log('='.repeat(90));

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Cập nhật 61 cán bộ
    let updatedEmpsCount = 0;
    if (emptyUnitEmps.length > 0) {
      const updateEmpStmt = db.prepare(`
        UPDATE employees
        SET unit_code = ?, unit_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE unit_code IS NULL OR unit_code = ''
      `);
      const execResult = updateEmpStmt.run(targetUnitCode, targetUnitName);
      updatedEmpsCount = Number(execResult.changes);
    }

    // 2. Xóa các biên nhận test cũ lệch số liệu (chỉ xóa khi có biên nhận mới chính thức thay thế)
    let deletedReceiptsCount = 0;
    if (obsoleteReceipts.length > 0) {
      const deleteReceiptStmt = db.prepare('DELETE FROM submission_receipts WHERE id = ?');
      for (const r of obsoleteReceipts) {
        deleteReceiptStmt.run(r.id);
        deletedReceiptsCount++;
      }
    }

    // 3. Tạo các biên nhận còn thiếu
    let createdReceiptsCount = 0;
    if (missingReceiptsToCreate.length > 0) {
      const insertReceiptStmt = db.prepare(`
        INSERT INTO submission_receipts (
          receipt_code, target_type, target_id, unit_id, submitted_by, approved_by, total_records, metadata
        ) VALUES (?, 'TRAINING_DEMAND', ?, ?, 1, 1, ?, ?)
      `);

      for (const item of missingReceiptsToCreate) {
        const metadata = JSON.stringify({
          title: 'Khảo sát Nhu cầu Đào tạo',
          totalParticipants: item.total_records,
          unitName: item.unit_name,
          reconciledAt: new Date().toISOString()
        });
        insertReceiptStmt.run(item.receipt_code, item.submission_id, item.unit_id, item.total_records, metadata);
        createdReceiptsCount++;
      }
    }

    db.exec('COMMIT;');
    console.log(`✅ [THÀNH CÔNG] Đã cập nhật ${updatedEmpsCount} cán bộ rỗng đơn vị.`);
    console.log(`✅ [THÀNH CÔNG] Đã xóa ${deletedReceiptsCount} biên nhận test cũ không khớp.`);
    console.log(`✅ [THÀNH CÔNG] Đã tạo ${createdReceiptsCount} bản ghi biên nhận bổ sung cho hồ sơ đã nộp.`);
  } catch (err: any) {
    db.exec('ROLLBACK;');
    console.error('❌ [LỖI ROLLBACK] Đã có lỗi xảy ra, toàn bộ thay đổi bị hủy bỏ:', err.message);
    process.exit(1);
  }
} else {
  console.log('\n' + '='.repeat(90));
  console.log('CHẾ ĐỘ DRY-RUN KẾT THÚC: KHÔNG CÓ THAY ĐỔI NÀO ĐƯỢC GHI VÀO DB.');
  console.log('Để thực thi các thay đổi trên, hãy chạy lệnh với cờ: --apply');
  console.log('='.repeat(90));
}
