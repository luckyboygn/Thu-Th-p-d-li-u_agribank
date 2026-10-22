import { getDatabase } from '../src/lib/db';
import { 
  normalizeEmployeeCode, 
  normalizeElearning, 
  stripLeadingZeros 
} from '../src/lib/normalization';

console.log('=== SCRIPT BACKFILL EMPLOYEE_ID & UNIT_CODE CHO EXAM_RECORDS ===\n');

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isDryRun = args.includes('--dry-run') || !isApply;

console.log(`Chế độ chạy: ${isApply ? '>>> APPLY (GHI THAY ĐỔI VÀO CSDL) <<<' : '*** DRY-RUN (CHỈ KIỂM TRA, KHÔNG GHI CSDL) ***'}`);
if (isDryRun && !isApply) {
  console.log('(Để thực hiện ghi vào CSDL, hãy chạy lại với tham số: --apply)\n');
}

const db = getDatabase();

// 1. Tải danh mục Master Employees
interface MasterEmp {
  id: number;
  employee_code: string;
  elearning_account: string;
  full_name: string;
  unit_code: string;
}

const masterEmployees = db.prepare(`
  SELECT id, employee_code, elearning_account, full_name, unit_code
  FROM employees
`).all() as unknown as MasterEmp[];

const masterByCode = new Map<string, MasterEmp>();
const masterByElearn = new Map<string, MasterEmp>();
const masterByStrippedCode = new Map<string, MasterEmp[]>();

for (const emp of masterEmployees) {
  const normCode = normalizeEmployeeCode(emp.employee_code);
  const normElearn = normalizeElearning(emp.elearning_account);

  if (normCode) {
    masterByCode.set(normCode, emp);
    const stripped = stripLeadingZeros(normCode);
    if (!masterByStrippedCode.has(stripped)) {
      masterByStrippedCode.set(stripped, []);
    }
    masterByStrippedCode.get(stripped)!.push(emp);
  }
  if (normElearn) {
    masterByElearn.set(normElearn, emp);
  }
}

console.log(`Đã nạp ${masterEmployees.length} cán bộ từ CSDL Master.`);

// 2. Lấy các bản ghi exam_records cần backfill
const recordsToBackfill = db.prepare(`
  SELECT id, upload_id, row_index, employee_code, elearning_account, full_name, employee_id, unit_code_at_validation
  FROM exam_records
  WHERE employee_id IS NULL OR unit_code_at_validation IS NULL
  ORDER BY id ASC
`).all() as any[];

console.log(`Tìm thấy ${recordsToBackfill.length} bản ghi exam_records chưa có employee_id hoặc unit_code_at_validation.\n`);

let matchedCount = 0;
let unmatchedCount = 0;
let leadingZeroMatchedCount = 0;

const updateStmt = isApply ? db.prepare(`
  UPDATE exam_records
  SET employee_id = ?, unit_code_at_validation = ?
  WHERE id = ?
`) : null;

if (isApply) {
  db.exec('BEGIN TRANSACTION;');
}

try {
  for (const r of recordsToBackfill) {
    const normCode = normalizeEmployeeCode(r.employee_code);
    const normElearn = normalizeElearning(r.elearning_account);

    let matchedEmp: MasterEmp | null = null;
    let isLeadingZero = false;

    // Tìm theo code chuẩn hóa
    const empByCode = masterByCode.get(normCode);
    const empByElearn = masterByElearn.get(normElearn);

    if (empByCode && empByElearn && empByCode.id === empByElearn.id) {
      matchedEmp = empByCode;
    } else if (!empByCode && empByElearn) {
      // Thử chuẩn hóa bỏ số 0 đầu
      const stripped = stripLeadingZeros(normCode);
      const candidates = masterByStrippedCode.get(stripped) || [];
      if (candidates.length === 1 && candidates[0].id === empByElearn.id) {
        matchedEmp = candidates[0];
        isLeadingZero = true;
      }
    } else if (empByCode && !empByElearn) {
      // Trường hợp elearn bị sai nhưng code đúng
      matchedEmp = empByCode;
    }

    if (matchedEmp) {
      matchedCount++;
      if (isLeadingZero) leadingZeroMatchedCount++;

      console.log(`[KHỚP] ID=${r.id} (Dòng ${r.row_index}): Mã=[${r.employee_code}], eLearning=[${r.elearning_account}] -> Cán bộ ID=${matchedEmp.id} (${matchedEmp.full_name}, ĐV: ${matchedEmp.unit_code})${isLeadingZero ? ' (khớp qua chuẩn hóa số 0 đầu)' : ''}`);

      if (isApply && updateStmt) {
        updateStmt.run(matchedEmp.id, matchedEmp.unit_code, r.id);
      }
    } else {
      unmatchedCount++;
      console.log(`[KHÔNG KHỚP] ID=${r.id} (Dòng ${r.row_index}): Mã=[${r.employee_code}], eLearning=[${r.elearning_account}], Tên=[${r.full_name}]`);
    }
  }

  if (isApply) {
    db.exec('COMMIT;');
  }
} catch (err) {
  if (isApply) {
    db.exec('ROLLBACK;');
  }
  console.error('Lỗi trong quá trình backfill:', err);
  process.exit(1);
}

console.log('\n====================================================');
console.log(`TỔNG KẾT BACKFILL (${isApply ? 'APPLY' : 'DRY-RUN'}):`);
console.log(`- Tổng số bản ghi duyệt: ${recordsToBackfill.length}`);
console.log(`- Số bản ghi khớp thành công: ${matchedCount} (trong đó ${leadingZeroMatchedCount} bản ghi khớp nhờ bỏ số 0 đầu)`);
console.log(`- Số bản ghi không khớp: ${unmatchedCount}`);
if (isDryRun) {
  console.log(`\nLƯU Ý: Đây là chế độ DRY-RUN. Chưa có dữ liệu nào bị thay đổi.`);
  console.log(`Chạy lại lệnh với --apply để ghi nhận kết quả: node scripts/backfill_exam_records_employee_match.js --apply (hoặc npx tsx)`);
} else {
  console.log(`\nTHÀNH CÔNG: Đã cập nhật xong ${matchedCount} bản ghi vào CSDL.`);
}
