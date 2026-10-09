import { DatabaseSync } from 'node:sqlite';
import { ParsedRowData } from './excel';

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
    | 'INACTIVE_EMPLOYEE';
  errorMessage: string;
  severity?: 'ERROR' | 'WARNING';
}

export interface ValidationRecordResult {
  rowIndex: number;
  employeeCode: string;
  elearningAccount: string;
  fullName: string;
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
 * Đảm bảo phát hiện chính xác tất cả 10 CASE theo yêu cầu nghiệp vụ
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
  // BƯỚC 1 & 2: KIỂM TRA TRÙNG LẶP TRONG CHÍNH FILE EXCEL
  // ==========================================
  const seenCodes = new Map<string, number[]>(); // code -> [rowIndices]
  const seenElearns = new Map<string, number[]>(); // elearn -> [rowIndices]

  for (const r of rows) {
    const code = r.employeeCode.trim();
    const elearn = r.elearningAccount.trim().toLowerCase();

    if (code) {
      if (!seenCodes.has(code)) seenCodes.set(code, []);
      seenCodes.get(code)!.push(r.rowIndex);
    }
    if (elearn) {
      if (!seenElearns.has(elearn)) seenElearns.set(elearn, []);
      seenElearns.get(elearn)!.push(r.rowIndex);
    }
  }

  // Chuẩn bị statements truy vấn database trung tâm
  const findByCodeStmt = db.prepare(`
    SELECT id, employee_code, elearning_account, full_name, unit_code, unit_name, status
    FROM employees
    WHERE employee_code = ?
  `);

  const findByElearnStmt = db.prepare(`
    SELECT id, employee_code, elearning_account, full_name, unit_code, unit_name, status
    FROM employees
    WHERE LOWER(elearning_account) = LOWER(?)
  `);

  // ==========================================
  // BƯỚC 3: ĐỐI CHIẾU TỪNG DÒNG VỚI DATABASE TRUNG TÂM (HAI CHIỀU)
  // ==========================================
  for (const r of rows) {
    const rowErrors: ValidationErrorItem[] = [];
    const code = r.employeeCode.trim();
    const elearn = r.elearningAccount.trim().toLowerCase();

    // 1. Kiểm tra thiếu trường bắt buộc
    if (!code || !elearn) {
      if (!code && !elearn) {
        rowErrors.push({
          rowIndex: r.rowIndex,
          employeeCode: code,
          elearningAccount: elearn,
          errorType: 'MISSING_REQUIRED_FIELD',
          errorMessage: 'Thiếu cả Mã cán bộ và Tài khoản eLearning trên dòng kê khai.',
          severity: 'ERROR'
        });
      } else if (!code) {
        rowErrors.push({
          rowIndex: r.rowIndex,
          employeeCode: code,
          elearningAccount: elearn,
          errorType: 'MISSING_REQUIRED_FIELD',
          errorMessage: 'Thiếu Mã cán bộ trên dòng kê khai.',
          severity: 'ERROR'
        });
      } else {
        rowErrors.push({
          rowIndex: r.rowIndex,
          employeeCode: code,
          elearningAccount: elearn,
          errorType: 'MISSING_REQUIRED_FIELD',
          errorMessage: 'Thiếu Tài khoản eLearning trên dòng kê khai.',
          severity: 'ERROR'
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
        severity: 'ERROR'
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
        severity: 'ERROR'
      });
    }

    // 3. ĐỐI CHIẾU 2 CHIỀU VỚI DATABASE TRUNG TÂM
    if (code && elearn) {
      const recordByCode = findByCodeStmt.get(code) as unknown as MasterEmployeeRow | undefined;
      const recordByElearn = findByElearnStmt.get(elearn) as unknown as MasterEmployeeRow | undefined;

      if (!recordByCode && !recordByElearn) {
        // CASE 7: Cả hai đều không tồn tại trong Database
        rowErrors.push({
          rowIndex: r.rowIndex,
          employeeCode: code,
          elearningAccount: elearn,
          errorType: 'UNKNOWN_BOTH',
          errorMessage: `LỖI – Không tìm thấy cả Mã cán bộ (${code}) và tài khoản eLearning (${elearn}) trong Database.`,
          severity: 'ERROR'
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
          severity: 'ERROR'
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
          severity: 'ERROR'
        });
      } else if (recordByCode && recordByElearn) {
        // Cả hai đều tồn tại trong DB, kiểm tra xem có thuộc cùng một người không
        if (recordByCode.id === recordByElearn.id) {
          // CASE 1: HỢP LỆ VỀ MẶT ĐỐI CHIẾU 2 CHIỀU
          // Kiểm tra xem cán bộ có ở trạng thái ngừng hoạt động không
          if (recordByCode.status === 'INACTIVE') {
            rowErrors.push({
              rowIndex: r.rowIndex,
              employeeCode: code,
              elearningAccount: elearn,
              errorType: 'INACTIVE_EMPLOYEE',
              errorMessage: `Cán bộ ${recordByCode.full_name} (${code}) đã ở trạng thái ngừng hoạt động trong cơ sở dữ liệu toàn hàng.`,
              severity: inactiveSeverity
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
              severity: 'WARNING'
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
            severity: 'ERROR'
          });
        }
      }
    }

    // Một bản ghi chỉ bị coi là INVALID nếu có ít nhất 1 lỗi nghiêm trọng (ERROR)
    const hasHardError = rowErrors.some(e => (e.severity || 'ERROR') === 'ERROR');
    const isRecordValid = !hasHardError;

    recordsResult.push({
      rowIndex: r.rowIndex,
      employeeCode: code,
      elearningAccount: elearn,
      fullName: r.fullName,
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
    totalRows: recordsResult.length,
    validRows: validCount,
    errorRows: errorCount,
    warningRows: warningCount,
    records: recordsResult,
    allErrors
  };
}
