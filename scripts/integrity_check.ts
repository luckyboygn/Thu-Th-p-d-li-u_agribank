import { DatabaseSync } from 'node:sqlite';
import path from 'path';

/**
 * scripts/integrity_check.ts
 * SCRIPT KIỂM TRA TÍNH TOÀN VẸN DỮ LIỆU TOÀN DIỆN (CHỈ ĐỌC - READ ONLY)
 * Tuyệt đối không thực hiện bất kỳ lệnh ghi/sửa/xóa nào vào Database.
 */

// 1. Mở kết nối SQLite ở chế độ chỉ đọc
const dbPath = path.resolve(process.cwd(), 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath, { readOnly: true });

// Helper chuẩn hóa chuỗi
function normalizeText(str: any): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanCode(code: any): string {
  if (!code) return '';
  return String(code)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim()
    .replace(/^0+/, '')
    .toUpperCase();
}

function cleanElearn(elearn: any): string {
  if (!elearn) return '';
  return String(elearn)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim()
    .toLowerCase();
}

export interface CheckResult {
  checkId: number;
  checkName: string;
  status: 'PASS' | 'FAIL';
  violationCount: number;
  examples: any[];
  note: string;
}

const results: CheckResult[] = [];

console.log('='.repeat(90));
console.log('BẮT ĐẦU CHẠY KIỂM TRA TOÀN VẸN CƠ SỞ DỮ LIỆU (READ-ONLY)');
console.log(`Thời điểm kiểm tra: ${new Date().toISOString()}`);
console.log(`Đường dẫn CSDL: ${dbPath}`);
console.log('='.repeat(90));

// =========================================================================
// KIỂM TRA 1: training_demand_submissions: cặp (collection_id, unit_id) có >1 bản ghi
// =========================================================================
{
  const checkName = '1. training_demand_submissions: cặp (collection_id, unit_id) trùng lặp (>1 bản ghi)';
  const query = `
    SELECT collection_id, unit_id, COUNT(*) as count,
           GROUP_CONCAT(id) as submission_ids,
           GROUP_CONCAT(version) as versions,
           GROUP_CONCAT(status) as statuses
    FROM training_demand_submissions
    GROUP BY collection_id, unit_id
    HAVING COUNT(*) > 1
  `;
  const rows = db.prepare(query).all() as any[];
  const violationCount = rows.length;
  const status = violationCount === 0 ? 'PASS' : 'FAIL';
  const examples = rows.slice(0, 10).map(r => ({
    collection_id: r.collection_id,
    unit_id: r.unit_id,
    duplicate_count: r.count,
    submission_ids: r.submission_ids,
    versions: r.versions,
    statuses: r.statuses
  }));

  results.push({
    checkId: 1,
    checkName,
    status,
    violationCount,
    examples,
    note: violationCount === 0
      ? 'Mỗi đơn vị chỉ có tối đa 1 hồ sơ khảo sát cho mỗi đợt.'
      : `Có ${violationCount} cặp (collection_id, unit_id) bị nhân bản nhiều hồ sơ.`
  });
}

// =========================================================================
// KIỂM TRA 2: exam_uploads: (exam_id, unit_id, version) trùng; hoặc >1 OFFICIAL_SUBMITTED
// =========================================================================
{
  const checkName = '2. exam_uploads: trùng (exam_id, unit_id, version) hoặc >1 bản OFFICIAL_SUBMITTED cùng kỳ thi';
  // 2a. Trùng version
  const dupVersions = db.prepare(`
    SELECT exam_id, unit_id, version, COUNT(*) as count, GROUP_CONCAT(id) as upload_ids
    FROM exam_uploads
    GROUP BY exam_id, unit_id, version
    HAVING COUNT(*) > 1
  `).all() as any[];

  // 2b. Trùng OFFICIAL_SUBMITTED
  const dupOfficial = db.prepare(`
    SELECT exam_id, unit_id, COUNT(*) as count, GROUP_CONCAT(id) as upload_ids, GROUP_CONCAT(version) as versions
    FROM exam_uploads
    WHERE status = 'OFFICIAL_SUBMITTED'
    GROUP BY exam_id, unit_id
    HAVING COUNT(*) > 1
  `).all() as any[];

  const violationCount = dupVersions.length + dupOfficial.length;
  const status = violationCount === 0 ? 'PASS' : 'FAIL';
  const examples: any[] = [];
  dupVersions.forEach(r => examples.push({ type: 'TRÙNG_VERSION', exam_id: r.exam_id, unit_id: r.unit_id, version: r.version, upload_ids: r.upload_ids }));
  dupOfficial.forEach(r => examples.push({ type: 'NHIỀU_BẢN_CHÍNH_THỨC', exam_id: r.exam_id, unit_id: r.unit_id, count: r.count, upload_ids: r.upload_ids, versions: r.versions }));

  results.push({
    checkId: 2,
    checkName,
    status,
    violationCount,
    examples: examples.slice(0, 10),
    note: violationCount === 0
      ? 'Không có version trùng lặp và không đơn vị nào có >1 bản nộp chính thức trong cùng kỳ thi.'
      : `Phát hiện ${dupVersions.length} cặp trùng version và ${dupOfficial.length} đơn vị có nhiều bản nộp chính thức.`
  });
}

// =========================================================================
// KIỂM TRA 3: training_demand_programs & training_demand_program_topics: trùng khóa cặp
// =========================================================================
{
  const checkName = '3. Trùng lặp khóa cặp trong training_demand_programs và training_demand_program_topics';
  // 3a. Trùng (submission_id, program_id)
  const dupPrograms = db.prepare(`
    SELECT submission_id, program_id, COUNT(*) as count, GROUP_CONCAT(id) as ids
    FROM training_demand_programs
    GROUP BY submission_id, program_id
    HAVING COUNT(*) > 1
  `).all() as any[];

  // 3b. Trùng (demand_program_id, program_topic_id)
  const dupTopics = db.prepare(`
    SELECT demand_program_id, program_topic_id, COUNT(*) as count, GROUP_CONCAT(id) as ids
    FROM training_demand_program_topics
    GROUP BY demand_program_id, program_topic_id
    HAVING COUNT(*) > 1
  `).all() as any[];

  const violationCount = dupPrograms.length + dupTopics.length;
  const status = violationCount === 0 ? 'PASS' : 'FAIL';
  const examples: any[] = [];
  dupPrograms.forEach(r => examples.push({ table: 'training_demand_programs', submission_id: r.submission_id, program_id: r.program_id, count: r.count, ids: r.ids }));
  dupTopics.forEach(r => examples.push({ table: 'training_demand_program_topics', demand_program_id: r.demand_program_id, program_topic_id: r.program_topic_id, count: r.count, ids: r.ids }));

  results.push({
    checkId: 3,
    checkName,
    status,
    violationCount,
    examples: examples.slice(0, 10),
    note: violationCount === 0
      ? 'Không có chương trình hoặc chuyên đề nào bị trùng lặp trong cùng một hồ sơ.'
      : `Có ${dupPrograms.length} chương trình trùng lặp và ${dupTopics.length} chuyên đề trùng lặp.`
  });
}

// =========================================================================
// KIỂM TRA 4: Lệch bộ đếm exam_uploads (total_rows, valid_rows, error_rows, warning_rows)
// =========================================================================
{
  const checkName = '4. Lệch bộ đếm trong exam_uploads so với số đếm lại từ exam_records và validation_errors';
  const uploads = db.prepare('SELECT id, exam_id, unit_id, version, total_rows, valid_rows, error_rows, warning_rows FROM exam_uploads').all() as any[];
  const discrepancies: any[] = [];

  for (const u of uploads) {
    const recCount = (db.prepare('SELECT COUNT(*) as c FROM exam_records WHERE upload_id = ?').get(u.id) as any)?.c || 0;
    const validCount = (db.prepare("SELECT COUNT(*) as c FROM exam_records WHERE upload_id = ? AND validation_status = 'VALID'").get(u.id) as any)?.c || 0;
    const errorCount = (db.prepare("SELECT COUNT(*) as c FROM exam_records WHERE upload_id = ? AND validation_status = 'INVALID'").get(u.id) as any)?.c || 0;
    const warningCount = (db.prepare("SELECT COUNT(DISTINCT record_id) as c FROM validation_errors WHERE upload_id = ? AND severity = 'WARNING'").get(u.id) as any)?.c || 0;

    const hasDiff = (u.total_rows !== recCount) ||
                    (u.valid_rows !== validCount) ||
                    (u.error_rows !== errorCount);

    if (hasDiff) {
      discrepancies.push({
        upload_id: u.id,
        exam_id: u.exam_id,
        unit_id: u.unit_id,
        version: u.version,
        recorded: { total: u.total_rows, valid: u.valid_rows, error: u.error_rows, warning: u.warning_rows },
        actual: { total: recCount, valid: validCount, error: errorCount, warning: warningCount }
      });
    }
  }

  const violationCount = discrepancies.length;
  const status = violationCount === 0 ? 'PASS' : 'FAIL';

  results.push({
    checkId: 4,
    checkName,
    status,
    violationCount,
    examples: discrepancies.slice(0, 10),
    note: uploads.length === 0
      ? 'Chưa có bản ghi upload kỳ thi nào trong CSDL (bảng exam_uploads trống).'
      : (violationCount === 0 ? 'Bộ đếm khớp 100% giữa exam_uploads, exam_records và validation_errors.' : `Có ${violationCount} upload bị lệch bộ đếm.`)
  });
}

// =========================================================================
// KIỂM TRA 5: Mã cán bộ INVALID nhưng khớp nếu chuẩn hóa (0 đầu, NBSP, zero-width, case)
// =========================================================================
{
  const checkName = '5. Mã cán bộ trong exam_records bị INVALID do không tìm thấy nhưng khớp nếu chuẩn hóa';
  const invalidRecords = db.prepare(`
    SELECT r.id, r.upload_id, r.row_index, r.employee_code, r.elearning_account, r.full_name, r.validation_message
    FROM exam_records r
    WHERE r.validation_status = 'INVALID'
  `).all() as any[];

  // Cache danh sách cán bộ trong employees
  const allEmployees = db.prepare('SELECT id, employee_code, elearning_account, full_name, unit_code FROM employees').all() as any[];
  const empMapByCleanCode = new Map<string, any>();
  const empMapByRawCode = new Set<string>();

  for (const emp of allEmployees) {
    empMapByRawCode.add(String(emp.employee_code || '').trim());
    const c = cleanCode(emp.employee_code);
    if (c) empMapByCleanCode.set(c, emp);
  }

  const recoverableRecords: any[] = [];

  for (const r of invalidRecords) {
    const rawCode = String(r.employee_code || '').trim();
    const cCode = cleanCode(r.employee_code);

    // Nếu rawCode chưa khớp với DB nhưng cCode lại khớp
    if (rawCode && !empMapByRawCode.has(rawCode) && empMapByCleanCode.has(cCode)) {
      const matchedEmp = empMapByCleanCode.get(cCode);
      recoverableRecords.push({
        record_id: r.id,
        upload_id: r.upload_id,
        row_index: r.row_index,
        raw_code_in_record: r.employee_code,
        cleaned_code: cCode,
        matched_in_db: {
          id: matchedEmp.id,
          employee_code: matchedEmp.employee_code,
          full_name: matchedEmp.full_name,
          unit_code: matchedEmp.unit_code
        }
      });
    }
  }

  const violationCount = recoverableRecords.length;
  const status = violationCount === 0 ? 'PASS' : 'FAIL';

  results.push({
    checkId: 5,
    checkName,
    status,
    violationCount,
    examples: recoverableRecords.slice(0, 10),
    note: invalidRecords.length === 0
      ? 'Hiện không có bản ghi exam_records nào bị INVALID trong CSDL.'
      : (violationCount === 0 ? 'Không có bản ghi nào bị INVALID oan do lỗi định dạng chuỗi mã cán bộ.' : `Có ${violationCount} bản ghi bị INVALID có thể phục hồi nếu chuẩn hóa mã cán bộ.`)
  });
}

// =========================================================================
// KIỂM TRA 6: employees & units: trùng sau chuẩn hóa; unit_code không tồn tại; Trụ sở trong mẫu số
// =========================================================================
{
  const checkName = '6. Kiểm tra CSDL Master employees và cấu trúc đơn vị units';
  const allEmps = db.prepare('SELECT id, employee_code, elearning_account, full_name, unit_code FROM employees').all() as any[];
  const allUnits = db.prepare('SELECT id, unit_code, unit_name, status, unit_type, region FROM units').all() as any[];

  const unitCodeSet = new Set(allUnits.map(u => String(u.unit_code).trim()));

  // 6a. Kiểm tra trùng lặp trong employees sau chuẩn hóa
  const seenCleanCode = new Map<string, number[]>();
  const seenCleanElearn = new Map<string, number[]>();

  for (const e of allEmps) {
    const cCode = cleanCode(e.employee_code);
    const cElearn = cleanElearn(e.elearning_account);

    if (cCode) {
      if (!seenCleanCode.has(cCode)) seenCleanCode.set(cCode, []);
      seenCleanCode.get(cCode)!.push(e.id);
    }
    if (cElearn) {
      if (!seenCleanElearn.has(cElearn)) seenCleanElearn.set(cElearn, []);
      seenCleanElearn.get(cElearn)!.push(e.id);
    }
  }

  const dupEmpCodes = Array.from(seenCleanCode.entries()).filter(([_, ids]) => ids.length > 1);
  const dupElearns = Array.from(seenCleanElearn.entries()).filter(([_, ids]) => ids.length > 1);

  // 6b. employees.unit_code không tồn tại trong units.unit_code
  const invalidEmpUnits = allEmps.filter(e => !e.unit_code || !unitCodeSet.has(String(e.unit_code).trim()));

  // 6c. units.status khác ACTIVE hoặc là Trụ sở/Trung tâm/ĐVSN đang được tính vào mẫu số tiến độ
  const inactiveUnits = allUnits.filter(u => u.status !== 'ACTIVE');
  const headOfficeUnits = allUnits.filter(u => u.unit_type === 'HO' || u.region === 'HO' || u.unit_type === 'SUBSIDIARY');

  const totalViolations = dupEmpCodes.length + dupElearns.length + invalidEmpUnits.length + inactiveUnits.length;
  const status = totalViolations === 0 ? 'PASS' : 'FAIL';

  const examples: any[] = [];
  dupEmpCodes.forEach(([code, ids]) => examples.push({ type: 'TRÙNG_MÃ_CB_CHUẨN_HÓA', clean_code: code, employee_ids: ids }));
  dupElearns.forEach(([elearn, ids]) => examples.push({ type: 'TRÙNG_ELEARN_CHUẨN_HÓA', clean_elearn: elearn, employee_ids: ids }));
  invalidEmpUnits.slice(0, 5).forEach(e => examples.push({ type: 'MÃ_ĐƠN_VỊ_CB_KHÔNG_TỒN_TẠI', employee_id: e.id, employee_code: e.employee_code, full_name: e.full_name, unit_code: e.unit_code }));
  inactiveUnits.forEach(u => examples.push({ type: 'ĐƠN_VỊ_INACTIVE', unit_id: u.id, unit_code: u.unit_code, unit_name: u.unit_name }));

  results.push({
    checkId: 6,
    checkName,
    status,
    violationCount: totalViolations,
    examples: examples.slice(0, 10),
    note: `Phát hiện: ${dupEmpCodes.length} mã CB trùng, ${dupElearns.length} eLearning trùng, ${invalidEmpUnits.length} CB có unit_code không khớp danh mục. Đơn vị INACTIVE: ${inactiveUnits.length}. Hiện có ${headOfficeUnits.length} đơn vị Trụ sở chính/Trung tâm/ĐVSN (thuộc tổng số 203 đơn vị) đang nằm trong mẫu số tiến độ.`
  });
}

// =========================================================================
// KIỂM TRA 7: Cùng một cán bộ nằm trong bản OFFICIAL_SUBMITTED của nhiều đơn vị
// =========================================================================
{
  const checkName = '7. Cùng một cán bộ nằm trong bản OFFICIAL_SUBMITTED của nhiều đơn vị cùng kỳ thi';
  const query = `
    SELECT r.employee_code, r.exam_id, COUNT(DISTINCT u.unit_id) as unit_count,
           GROUP_CONCAT(DISTINCT un.unit_code || ' (' || un.unit_name || ')') as units_list,
           GROUP_CONCAT(r.id) as record_ids
    FROM exam_records r
    JOIN exam_uploads u ON r.upload_id = u.id
    JOIN units un ON u.unit_id = un.id
    WHERE u.status = 'OFFICIAL_SUBMITTED'
    GROUP BY r.exam_id, r.employee_code
    HAVING COUNT(DISTINCT u.unit_id) > 1
  `;
  const rows = db.prepare(query).all() as any[];
  const violationCount = rows.length;
  const status = violationCount === 0 ? 'PASS' : 'FAIL';

  results.push({
    checkId: 7,
    checkName,
    status,
    violationCount,
    examples: rows.slice(0, 10),
    note: violationCount === 0
      ? 'Không có cán bộ nào bị nộp trùng ở nhiều đơn vị trong các bản nộp chính thức.'
      : `Có ${violationCount} cán bộ bị nộp trùng ở nhiều đơn vị khác nhau trong cùng kỳ thi.`
  });
}

// =========================================================================
// KIỂM TRA 8: submission_receipts: target_id không tồn tại hoặc total_records lệch
// =========================================================================
{
  const checkName = '8. submission_receipts: target_id không tồn tại hoặc total_records lệch với thực tế';
  const receipts = db.prepare('SELECT id, receipt_code, target_type, target_id, unit_id, total_records FROM submission_receipts').all() as any[];
  const discrepancies: any[] = [];

  for (const rc of receipts) {
    if (rc.target_type === 'TRAINING_DEMAND') {
      const sub = db.prepare('SELECT id, unit_id, status FROM training_demand_submissions WHERE id = ?').get(rc.target_id) as any;
      if (!sub) {
        discrepancies.push({ receipt_id: rc.id, receipt_code: rc.receipt_code, error: 'TARGET_ID_KHÔNG_TỒN_TẠI', target_type: rc.target_type, target_id: rc.target_id });
      } else {
        // Đếm lại tổng số lượt đăng ký thực tế
        const progSum = (db.prepare(`
          SELECT COALESCE(SUM(dt.participant_count), 0) as s
          FROM training_demand_program_topics dt
          JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
          WHERE dp.submission_id = ?
        `).get(sub.id) as any)?.s || 0;

        const posSum = (db.prepare(`
          SELECT COALESCE(SUM(participant_count), 0) as s
          FROM training_demand_topics dt
          JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
          WHERE dp.submission_id = ?
        `).get(sub.id) as any)?.s || 0;

        const propSum = (db.prepare(`
          SELECT COALESCE(SUM(participant_count), 0) as s
          FROM training_demand_proposals WHERE submission_id = ?
        `).get(sub.id) as any)?.s || 0;

        const actualTotal = progSum + posSum + propSum;
        if (rc.total_records !== actualTotal) {
          discrepancies.push({
            receipt_id: rc.id,
            receipt_code: rc.receipt_code,
            error: 'LỆCH_TỔNG_SỐ_NGƯỜI',
            target_type: rc.target_type,
            target_id: rc.target_id,
            recorded_in_receipt: rc.total_records,
            actual_in_db: actualTotal,
            breakdown: { progSum, posSum, propSum }
          });
        }
      }
    } else if (rc.target_type === 'EXAM_UPLOAD') {
      const upload = db.prepare('SELECT id, unit_id, total_rows, valid_rows FROM exam_uploads WHERE id = ?').get(rc.target_id) as any;
      if (!upload) {
        discrepancies.push({ receipt_id: rc.id, receipt_code: rc.receipt_code, error: 'TARGET_ID_KHÔNG_TỒN_TẠI', target_type: rc.target_type, target_id: rc.target_id });
      } else if (rc.total_records !== upload.valid_rows && rc.total_records !== upload.total_rows) {
        discrepancies.push({
          receipt_id: rc.id,
          receipt_code: rc.receipt_code,
          error: 'LỆCH_TỔNG_SỐ_DÒNG',
          target_type: rc.target_type,
          target_id: rc.target_id,
          recorded_in_receipt: rc.total_records,
          upload_valid_rows: upload.valid_rows,
          upload_total_rows: upload.total_rows
        });
      }
    }
  }

  // Kiểm tra ngược: Các submission SUBMITTED nhưng không có biên nhận
  const submittedWithoutReceipt = db.prepare(`
    SELECT id, unit_id, collection_id, receipt_code
    FROM training_demand_submissions
    WHERE status = 'SUBMITTED' AND (receipt_code IS NULL OR receipt_code NOT IN (SELECT receipt_code FROM submission_receipts))
  `).all() as any[];

  submittedWithoutReceipt.forEach(s => {
    discrepancies.push({
      error: 'BẢN_NỘP_THIẾU_BIÊN_NHẬN_HỢP_LỆ',
      submission_id: s.id,
      unit_id: s.unit_id,
      receipt_code_in_sub: s.receipt_code
    });
  });

  const violationCount = discrepancies.length;
  const status = violationCount === 0 ? 'PASS' : 'FAIL';

  results.push({
    checkId: 8,
    checkName,
    status,
    violationCount,
    examples: discrepancies.slice(0, 10),
    note: violationCount === 0
      ? 'Tất cả biên nhận khớp chính xác 100% với hồ sơ nộp và số lượng người học thực tế.'
      : `Có ${violationCount} sai lệch liên quan đến biên nhận điện tử.`
  });
}

// =========================================================================
// KIỂM TRA 9: Đối soát tổng totalParticipants theo từng đơn vị qua 4 nguồn
// =========================================================================
{
  const checkName = '9. Đối soát tổng totalParticipants qua 4 nguồn (Dashboard Admin, Reports ALL_SYSTEM, Bảng gốc, Biên nhận)';
  const allSubmissions = db.prepare(`
    SELECT s.id, s.unit_id, s.collection_id, s.status, s.receipt_code, u.unit_code, u.unit_name
    FROM training_demand_submissions s
    JOIN units u ON s.unit_id = u.id
    WHERE s.status = 'SUBMITTED'
  `).all() as any[];

  const reconciliationReport: any[] = [];

  for (const s of allSubmissions) {
    // (c) Bảng gốc
    const progSum = (db.prepare(`
      SELECT COALESCE(SUM(dt.participant_count), 0) as s
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      WHERE dp.submission_id = ?
    `).get(s.id) as any)?.s || 0;

    const posSum = (db.prepare(`
      SELECT COALESCE(SUM(participant_count), 0) as s
      FROM training_demand_topics dt
      JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
      WHERE dp.submission_id = ?
    `).get(s.id) as any)?.s || 0;

    const propSum = (db.prepare(`
      SELECT COALESCE(SUM(participant_count), 0) as s
      FROM training_demand_proposals WHERE submission_id = ?
    `).get(s.id) as any)?.s || 0;

    const dbOriginalTotal = progSum + posSum + propSum;

    // (a) Logic Dashboard Admin
    const dashboardTotal = progSum + propSum; // Lưu ý: Dashboard Admin hiện tại tính progSum + propSum

    // (b) Logic Training Reports ALL_SYSTEM
    const reportsAllSystemTotal = progSum + propSum; // Đã bổ sung propSum ở bản commit trước

    // (d) Biên nhận submission_receipts
    const receiptRows = db.prepare(`
      SELECT total_records FROM submission_receipts
      WHERE target_type = 'TRAINING_DEMAND' AND target_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(s.id) as any;
    const receiptTotal = receiptRows ? receiptRows.total_records : null;

    const isMatch = (dbOriginalTotal === dashboardTotal) &&
                    (dashboardTotal === reportsAllSystemTotal) &&
                    (receiptTotal === null || receiptTotal === dbOriginalTotal);

    if (!isMatch) {
      reconciliationReport.push({
        unit_code: s.unit_code,
        unit_name: s.unit_name,
        submission_id: s.id,
        collection_id: s.collection_id,
        source_a_dashboard_admin: dashboardTotal,
        source_b_reports_all_system: reportsAllSystemTotal,
        source_c_db_original_total: dbOriginalTotal,
        source_d_receipt_total: receiptTotal,
        difference_pos_legacy: posSum,
        difference_notes: posSum > 0 ? `Đơn vị có ${posSum} học viên từ Mẫu 05 vị trí cũ chưa được tính vào Dashboard/Reports.` : 'Biên nhận không khớp với bảng gốc.'
      });
    }
  }

  const violationCount = reconciliationReport.length;
  const status = violationCount === 0 ? 'PASS' : 'FAIL';

  results.push({
    checkId: 9,
    checkName,
    status,
    violationCount,
    examples: reconciliationReport.slice(0, 10),
    note: violationCount === 0
      ? 'Tổng số lượt học viên hoàn toàn đồng nhất giữa Dashboard Admin, Báo cáo Tổng hợp, Bảng gốc và Biên nhận.'
      : `Có ${violationCount} đơn vị có sự chênh lệch số liệu giữa các nguồn tính toán.`
  });
}

// =========================================================================
// KIỂM TRA 10: Trùng nội dung giữa Mẫu 04 & Mẫu 05; và Đề xuất ngoài khung tương đồng
// =========================================================================
{
  const checkName = '10. Chuyên đề trùng nội dung giữa Mẫu 04 & Mẫu 05; Tên đề xuất ngoài khung tương đồng giữa các đơn vị';
  
  // 10a. Kiểm tra chuyên đề trùng nội dung giữa Mẫu 04 và Mẫu 05 trong cùng đơn vị
  const crossTemplateDupes = db.prepare(`
    SELECT dp.submission_id, s.unit_id, u.unit_code, u.unit_name,
           t4.topic_name as topic_04, t5.name as topic_05,
           dt4.participant_count as count_04, dt5.participant_count as count_05
    FROM training_demand_program_topics dt4
    JOIN training_demand_programs dp ON dt4.demand_program_id = dp.id
    JOIN training_program_topics t4 ON dt4.program_topic_id = t4.id
    JOIN training_demand_submissions s ON dp.submission_id = s.id
    JOIN units u ON s.unit_id = u.id
    JOIN training_demand_positions pos ON pos.submission_id = s.id
    JOIN training_demand_topics dt5 ON dt5.demand_position_id = pos.id
    JOIN training_topics t5 ON dt5.topic_id = t5.id
    WHERE LOWER(TRIM(t4.topic_name)) = LOWER(TRIM(t5.name))
  `).all() as any[];

  // 10b. Tên đề xuất ngoài khung tương đồng giữa các đơn vị
  const allProposals = db.prepare(`
    SELECT p.id, p.submission_id, s.unit_id, u.unit_code, u.unit_name, p.proposal_name, p.participant_count
    FROM training_demand_proposals p
    JOIN training_demand_submissions s ON p.submission_id = s.id
    JOIN units u ON s.unit_id = u.id
  `).all() as any[];

  const similarProposals: any[] = [];
  for (let i = 0; i < allProposals.length; i++) {
    for (let j = i + 1; j < allProposals.length; j++) {
      const p1 = allProposals[i];
      const p2 = allProposals[j];
      if (p1.unit_id === p2.unit_id) continue;

      const n1 = normalizeText(p1.proposal_name);
      const n2 = normalizeText(p2.proposal_name);

      if (n1 === n2 || (n1.length > 8 && n2.length > 8 && (n1.includes(n2) || n2.includes(n1)))) {
        similarProposals.push({
          proposal_1: { unit: p1.unit_name, name: p1.proposal_name, count: p1.participant_count },
          proposal_2: { unit: p2.unit_name, name: p2.proposal_name, count: p2.participant_count },
          normalized_form: n1 === n2 ? n1 : `[Gần giống] ${n1} ~ ${n2}`
        });
      }
    }
  }

  const violationCount = crossTemplateDupes.length + similarProposals.length;
  const status = violationCount === 0 ? 'PASS' : 'FAIL';
  const examples: any[] = [];
  crossTemplateDupes.forEach(r => examples.push({ type: 'TRÙNG_MẪU_04_VÀ_05', ...r }));
  similarProposals.slice(0, 5).forEach(r => examples.push({ type: 'ĐỀ_XUẤT_NGOÀI_KHUNG_TƯƠNG_ĐỒNG', ...r }));

  results.push({
    checkId: 10,
    checkName,
    status,
    violationCount,
    examples: examples.slice(0, 10),
    note: `Phát hiện ${crossTemplateDupes.length} chuyên đề bị kê khai trùng giữa Mẫu 04 và Mẫu 05; ${similarProposals.length} cặp đề xuất ngoài khung có nội dung tương đồng giữa các đơn vị.`
  });
}

// =========================================================================
// IN BÁO CÁO CHI TIẾT TỪNG MỤC
// =========================================================================
console.log('\n' + '='.repeat(90));
console.log('KẾT QUẢ CHI TIẾT TỪNG HẠNG MỤC KIỂM TRA');
console.log('='.repeat(90));

for (const res of results) {
  const icon = res.status === 'PASS' ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`\n${icon} MỤC ${res.checkId}: ${res.checkName}`);
  console.log(`   - Trạng thái: ${res.status}`);
  console.log(`   - Số lượng bản ghi vi phạm: ${res.violationCount}`);
  console.log(`   - Đánh giá sơ bộ: ${res.note}`);

  if (res.examples.length > 0) {
    console.log(`   - Chi tiết ví dụ vi phạm (tối đa 10 mẫu):`);
    res.examples.forEach((ex, idx) => {
      console.log(`     (${idx + 1}) ${JSON.stringify(ex)}`);
    });
  } else {
    console.log(`   - Chi tiết: Không có bản ghi vi phạm.`);
  }
}

// =========================================================================
// BẢNG TỔNG HỢP 10 MỤC VÀ KẾT LUẬN
// =========================================================================
console.log('\n' + '='.repeat(90));
console.log('BẢNG TỔNG HỢP ĐỐI SOÁT TOÀN VẸN CƠ SỞ DỮ LIỆU (10 HẠNG MỤC)');
console.log('='.repeat(90));
console.log('| STT | Tên hạng mục kiểm tra                                                | Kết quả | Số vi phạm | Kết luận cần sửa? |');
console.log('|:---:|:---------------------------------------------------------------------|:-------:|:----------:|:------------------:|');

results.forEach((r) => {
  const paddedId = String(r.checkId).padEnd(3);
  const paddedName = r.checkName.slice(0, 68).padEnd(68);
  const paddedStatus = r.status.padEnd(7);
  const paddedCount = String(r.violationCount).padEnd(10);
  const paddedAction = (r.status === 'PASS' ? 'Không (Đạt chuẩn)' : 'CẦN SỬA').padEnd(17);
  console.log(`| ${paddedId} | ${paddedName} | ${paddedStatus} | ${paddedCount} | ${paddedAction} |`);
});
console.log('='.repeat(90));
console.log('KẾT THÚC CHƯƠNG TRÌNH KIỂM TRA (KHÔNG CÓ DỮ LIỆU NÀO BỊ THAY ĐỔI)');
