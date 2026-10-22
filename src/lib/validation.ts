import { DatabaseSync } from 'node:sqlite';
import { ParsedRowData } from './excel';
import { 
  normalizeEmployeeCode, 
  normalizeElearning, 
  normalizeNameForComparison, 
  stripLeadingZeros 
} from './normalization';

export interface ValidationErrorItem {
  rowIndex: number;
  employeeCode: string;
  elearningAccount: string;
  errorType: 
    | 'MISSING_REQUIRED_FIELD'
    | 'DUPLICATE_EMPLOYEE_CODE_IN_FILE'
    | 'DUPLICATE_ELEARNING_IN_FILE'
    | 'WRONG_ELEARNING'
    | 'WRONG_EMPLOYEE_CODE'
    | 'CROSS_PERSON_MISMATCH'
    | 'UNKNOWN_BOTH'
    | 'UNKNOWN_EMPLOYEE_CODE'
    | 'UNKNOWN_ELEARNING'
    | 'UNIT_MISMATCH'
    | 'INACTIVE_EMPLOYEE'
    | 'NAME_MISMATCH'
    | 'LEADING_ZERO_NORMALIZED';
  errorMessage: string;
  severity?: 'ERROR' | 'WARNING';
  sheetName?: string;
}

export interface ValidationRecordResult {
  rowIndex: number;
  employeeCode: string;
  elearningAccount: string;
  fullName: string;
  sheetName?: string;
  employeeId?: number | null;
  unitCodeAtValidation?: string | null;
  rawData: Record<string, any>;
  status: 'VALID' | 'INVALID';
  errors: ValidationErrorItem[];
}

export interface ValidationSummaryResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  records: ValidationRecordResult[];
  allErrors: ValidationErrorItem[];
}

interface MasterEmployeeRow {
  id: number;
  employee_code: string;
  elearning_account: string;
  full_name: string;
  unit_code?: string;
  unit_name?: string;
  status?: string;
}

/**
 * Thuật toán Đối chiếu 2 chiều (Bidirectional Validation Engine)
 * Đảm bảo phát hiện chính xác tất cả các ca theo yêu cầu nghiệp vụ
 */
export function validateCandidateBatch(
  db: DatabaseSync,
  rows: ParsedRowData[],
  currentUnitCode?: string
): ValidationSummaryResult {
  const recordsResult: ValidationRecordResult[] = [];
  const allErrors: ValidationErrorItem[] = [];

  const targetUnitCode = currentUnitCode ? String(currentUnitCode).trim() : '';

  // Đọc cấu hình inactive_employee_severity từ system_settings
  let inactiveSeverity: 'ERROR' | 'WARNING' = 'WARNING';
  try {
    const setting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('inactive_employee_severity') as any;
    if (setting?.value === 'ERROR') inactiveSeverity = 'ERROR';
  } catch (e) {}

  // ==========================================
  // BƯỚC 1: TẢI DANH MỤC MASTER VÀ KIỂM TRA XUNG ĐỘT SỐ 0 ĐẦU
  // ==========================================
  const allMasterEmployees = db.prepare(`
    SELECT id, employee_code, elearning_account, full_name, unit_code, unit_name, status
    FROM employees
  `).all() as unknown as MasterEmployeeRow[];

  const masterByCode = new Map<string, MasterEmployeeRow>();
  const masterByElearn = new Map<string, MasterEmployeeRow>();
  const masterByStrippedCode = new Map<string, MasterEmployeeRow[]>();

  for (const emp of allMasterEmployees) {
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

  // ==========================================
  // BƯỚC 2: KIỂM TRA TRÙNG LẶP TRONG CHÍNH FILE EXCEL (SAU CHUẨN HÓA)
  // ==========================================
  const seenCodes = new Map<string, number[]>(); // normalizedCode -> [rowIndices]
  const seenElearns = new Map<string, number[]>(); // normalizedElearn -> [rowIndices]

  for (const r of rows) {
    const code = normalizeEmployeeCode(r.employeeCode);
    const elearn = normalizeElearning(r.elearningAccount);

    if (code) {
      if (!seenCodes.has(code)) seenCodes.set(code, []);
      seenCodes.get(code)!.push(r.rowIndex);
    }
    if (elearn) {
      if (!seenElearns.has(elearn)) seenElearns.set(elearn, []);
      seenElearns.get(elearn)!.push(r.rowIndex);
    }
  }

  // ==========================================
  // BƯỚC 3: ĐỐI CHIẾU TỪNG DÒNG VỚI DATABASE TRUNG TÂM (HAI CHIỀU)
  // ==========================================
  for (const r of rows) {
    const rowErrors: ValidationErrorItem[] = [];
    const code = normalizeEmployeeCode(r.employeeCode);
    const elearn = normalizeElearning(r.elearningAccount);

    let matchedEmployeeId: number | null = null;
    let matchedUnitCode: string | null = null;

    // 1. Kiểm tra thiếu trường bắt buộc
    if (!code || !elearn) {
      if (!code && !elearn) {
        rowErrors.push({
          rowIndex: r.rowIndex,
          employeeCode: r.employeeCode,
          elearningAccount: r.elearningAccount,
          errorType: 'MISSING_REQUIRED_FIELD',
          errorMessage: 'Thiếu cả Mã cán bộ và Tài khoản eLearning trên dòng kê khai.',
          severity: 'ERROR',
          sheetName: r.sheetName
        });
      } else if (!code) {
        rowErrors.push({
          rowIndex: r.rowIndex,
          employeeCode: r.employeeCode,
          elearningAccount: elearn,
          errorType: 'MISSING_REQUIRED_FIELD',
          errorMessage: 'Thiếu Mã cán bộ trên dòng kê khai.',
          severity: 'ERROR',
          sheetName: r.sheetName
        });
      } else {
        rowErrors.push({
          rowIndex: r.rowIndex,
          employeeCode: code,
          elearningAccount: r.elearningAccount,
          errorType: 'MISSING_REQUIRED_FIELD',
          errorMessage: 'Thiếu Tài khoản eLearning trên dòng kê khai.',
          severity: 'ERROR',
          sheetName: r.sheetName
        });
      }
    }

    // 2. Kiểm tra trùng lặp trong nội bộ file
    if (code && (seenCodes.get(code)?.length || 0) > 1) {
      const otherRows = seenCodes.get(code)!.filter(idx => idx !== r.rowIndex);
      rowErrors.push({
        rowIndex: r.rowIndex,
        employeeCode: code,
        elearningAccount: elearn,
        errorType: 'DUPLICATE_EMPLOYEE_CODE_IN_FILE',
        errorMessage: `LỖI – Mã cán bộ ${code} xuất hiện nhiều lần trong file (trùng với dòng: ${otherRows.join(', ')}).`,
        severity: 'ERROR',
        sheetName: r.sheetName
      });
    }

    if (elearn && (seenElearns.get(elearn)?.length || 0) > 1) {
      const otherRows = seenElearns.get(elearn)!.filter(idx => idx !== r.rowIndex);
      rowErrors.push({
        rowIndex: r.rowIndex,
        employeeCode: code,
        elearningAccount: elearn,
        errorType: 'DUPLICATE_ELEARNING_IN_FILE',
        errorMessage: `LỖI – Tài khoản eLearning ${elearn} xuất hiện nhiều lần trong file (trùng với dòng: ${otherRows.join(', ')}).`,
        severity: 'ERROR',
        sheetName: r.sheetName
      });
    }

    // 3. ĐỐI CHIẾU 2 CHIỀU VỚI DATABASE TRUNG TÂM
    if (code && elearn) {
      // 3.1 Tìm theo Mã cán bộ: Trước tiên tìm khớp tuyệt đối
      let recordByCode = masterByCode.get(code);
      let matchedByLeadingZero = false;

      // Nếu không khớp mã trực tiếp, kiểm tra khớp qua chuẩn hóa bỏ số 0 đầu
      if (!recordByCode) {
        const stripped = stripLeadingZeros(code);
        const candidates = masterByStrippedCode.get(stripped) || [];
        // Điều kiện an toàn: Master không có hai mã chỉ khác nhau ở số 0 đầu
        if (candidates.length === 1) {
          recordByCode = candidates[0];
          matchedByLeadingZero = true;
        }
      }

      // 3.2 Tìm theo Tài khoản eLearning
      const recordByElearn = masterByElearn.get(elearn);

      if (!recordByCode && !recordByElearn) {
        // CASE 7: Cả hai đều không tồn tại trong Database
        rowErrors.push({
          rowIndex: r.rowIndex,
          employeeCode: code,
          elearningAccount: elearn,
          errorType: 'UNKNOWN_BOTH',
          errorMessage: `LỖI – Không tìm thấy cả Mã cán bộ (${code}) và tài khoản eLearning (${elearn}) trong Database.`,
          severity: 'ERROR',
          sheetName: r.sheetName
        });
      } else if (recordByCode && !recordByElearn) {
        // CASE 2: Mã cán bộ tồn tại, nhưng eLearning không tồn tại trong DB (hoặc sai)
        const isSameUnit = !targetUnitCode || !recordByCode.unit_code || String(recordByCode.unit_code).trim() === targetUnitCode;
        const msg = isSameUnit
          ? `Mã cán bộ ${code} tồn tại trong Database nhưng tài khoản eLearning do đơn vị kê khai (${elearn}) không đúng. Tài khoản đúng trong Database là ${recordByCode.elearning_account}.`
          : `Thông tin không khớp cơ sở dữ liệu cán bộ, vui lòng liên hệ Trung tâm.`;

        rowErrors.push({
          rowIndex: r.rowIndex,
          employeeCode: code,
          elearningAccount: elearn,
          errorType: 'WRONG_ELEARNING',
          errorMessage: msg,
          severity: 'ERROR',
          sheetName: r.sheetName
        });
      } else if (!recordByCode && recordByElearn) {
        // CASE 3: Tài khoản eLearning tồn tại, nhưng Mã cán bộ sai / không tồn tại
        const isSameUnit = !targetUnitCode || !recordByElearn.unit_code || String(recordByElearn.unit_code).trim() === targetUnitCode;
        const msg = isSameUnit
          ? `Tài khoản eLearning ${elearn} thuộc Mã cán bộ ${recordByElearn.employee_code} (${recordByElearn.full_name}), nhưng đơn vị kê khai Mã cán bộ ${code}.`
          : `Thông tin không khớp cơ sở dữ liệu cán bộ, vui lòng liên hệ Trung tâm.`;

        rowErrors.push({
          rowIndex: r.rowIndex,
          employeeCode: code,
          elearningAccount: elearn,
          errorType: 'WRONG_EMPLOYEE_CODE',
          errorMessage: msg,
          severity: 'ERROR',
          sheetName: r.sheetName
        });
      } else if (recordByCode && recordByElearn) {
        // Cả hai đều tồn tại trong DB, kiểm tra xem có thuộc cùng một người không
        if (recordByCode.id === recordByElearn.id) {
          // CASE 1: HỢP LỆ VỀ MẶT ĐỐI CHIẾU 2 CHIỀU
          matchedEmployeeId = recordByCode.id;
          matchedUnitCode = recordByCode.unit_code || null;

          // Cảnh báo nếu khớp nhờ chuẩn hóa số 0 đầu
          if (matchedByLeadingZero) {
            rowErrors.push({
              rowIndex: r.rowIndex,
              employeeCode: code,
              elearningAccount: elearn,
              errorType: 'LEADING_ZERO_NORMALIZED',
              errorMessage: `Cảnh báo: Mã cán bộ [${code}] khớp với cán bộ [${recordByCode.full_name}] (Mã CSDL: [${recordByCode.employee_code}]) nhờ chuẩn hóa số 0 đầu.`,
              severity: 'WARNING',
              sheetName: r.sheetName
            });
          }

          // Đối chiếu Họ và tên (không dấu, chữ thường, bỏ khoảng trắng thừa)
          if (r.fullName && String(r.fullName).trim() !== '' && recordByCode.full_name) {
            const inputNameNorm = normalizeNameForComparison(r.fullName);
            const masterNameNorm = normalizeNameForComparison(recordByCode.full_name);
            if (inputNameNorm && masterNameNorm && inputNameNorm !== masterNameNorm) {
              rowErrors.push({
                rowIndex: r.rowIndex,
                employeeCode: code,
                elearningAccount: elearn,
                errorType: 'NAME_MISMATCH',
                errorMessage: `Cảnh báo: Họ và tên kê khai ("${r.fullName}") khác với Họ và tên trong CSDL Cán bộ ("${recordByCode.full_name}").`,
                severity: 'WARNING',
                sheetName: r.sheetName
              });
            }
          }

          // Kiểm tra xem cán bộ có ở trạng thái ngừng hoạt động không
          if (recordByCode.status === 'INACTIVE') {
            rowErrors.push({
              rowIndex: r.rowIndex,
              employeeCode: code,
              elearningAccount: elearn,
              errorType: 'INACTIVE_EMPLOYEE',
              errorMessage: `Cán bộ ${recordByCode.full_name} (${code}) đã ở trạng thái ngừng hoạt động trong cơ sở dữ liệu toàn hàng.`,
              severity: inactiveSeverity,
              sheetName: r.sheetName
            });
          }

          // Kiểm tra xem cán bộ có thuộc đơn vị đang kê khai không (dạng WARNING)
          if (targetUnitCode && recordByCode.unit_code && String(recordByCode.unit_code).trim() !== targetUnitCode) {
            const unitDisplay = recordByCode.unit_name || `Mã ĐV: ${recordByCode.unit_code}`;
            rowErrors.push({
              rowIndex: r.rowIndex,
              employeeCode: code,
              elearningAccount: elearn,
              errorType: 'UNIT_MISMATCH',
              errorMessage: `Cảnh báo: Cán bộ thuộc đơn vị khác trong hệ thống (Đơn vị trong CSDL: ${unitDisplay}).`,
              severity: 'WARNING',
              sheetName: r.sheetName
            });
          }
        } else {
          // CASE 4: Cả hai đều tồn tại nhưng thuộc 2 người khác nhau!
          const isSameUnit = !targetUnitCode || (
            (!recordByCode.unit_code || String(recordByCode.unit_code).trim() === targetUnitCode) &&
            (!recordByElearn.unit_code || String(recordByElearn.unit_code).trim() === targetUnitCode)
          );

          const msg = isSameUnit
            ? `LỖI – Mã cán bộ ${code} (thuộc cán bộ ${recordByCode.full_name}) và tài khoản eLearning ${elearn} (thuộc cán bộ ${recordByElearn.full_name} - Mã CB ${recordByElearn.employee_code}) thuộc hai người khác nhau trong Database.`
            : `Thông tin không khớp cơ sở dữ liệu cán bộ, vui lòng liên hệ Trung tâm.`;

          rowErrors.push({
            rowIndex: r.rowIndex,
            employeeCode: code,
            elearningAccount: elearn,
            errorType: 'CROSS_PERSON_MISMATCH',
            errorMessage: msg,
            severity: 'ERROR',
            sheetName: r.sheetName
          });
        }
      }
    }

    // Một bản ghi chỉ bị coi là INVALID nếu có ít nhất 1 lỗi nghiêm trọng (ERROR)
    const hasHardError = rowErrors.some(e => (e.severity || 'ERROR') === 'ERROR');
    const isRecordValid = !hasHardError;

    recordsResult.push({
      rowIndex: r.rowIndex,
      employeeCode: code || r.employeeCode,
      elearningAccount: elearn || r.elearningAccount,
      fullName: r.fullName,
      sheetName: r.sheetName,
      employeeId: matchedEmployeeId,
      unitCodeAtValidation: matchedUnitCode,
      rawData: r.rawData,
      status: isRecordValid ? 'VALID' : 'INVALID',
      errors: rowErrors
    });

    if (rowErrors.length > 0) {
      allErrors.push(...rowErrors);
    }
  }

  const validCount = recordsResult.filter(r => r.status === 'VALID').length;
  const errorCount = recordsResult.filter(r => r.status === 'INVALID').length;
  // Số dòng chỉ có cảnh báo (WARNING) mà không có lỗi (ERROR)
  const warningCount = recordsResult.filter(r => r.status === 'VALID' && r.errors.length > 0).length;

  return {
    totalRows: rows.length,
    validRows: validCount,
    errorRows: errorCount,
    warningRows: warningCount,
    records: recordsResult,
    allErrors
  };
}
