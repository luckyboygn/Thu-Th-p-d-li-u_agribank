import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './db';

// ==========================================
// ĐỊNH NGHĨA KIỂU DỮ LIỆU CỦA VALIDATION ENGINE
// ==========================================

export type ValidationMode = 'MASTER_VALIDATION' | 'FORM_VALIDATION_ONLY';

export interface FormFieldRuleConfig {
  id: number;
  fieldName: string;
  label: string;
  fieldType: string; // 'TEXT' | 'NUMBER' | 'SINGLE_SELECT' ...
  required: boolean;
  options?: string[]; // Danh sách lựa chọn hợp lệ
  min?: number;
  max?: number;
  regex?: string;
}

export interface FormConfig {
  id: number;
  collectionId: number;
  formCode: string;
  title: string;
  validationMode: ValidationMode;
  employeeCodeField?: string;
  elearningField?: string;
  fields: FormFieldRuleConfig[];
}

export interface GenericValidationItemError {
  rowIndex: number;
  fieldName?: string;
  errorType: string;
  errorMessage: string;
}

export interface GenericValidationRecordResult {
  rowIndex: number;
  employeeCode?: string;
  elearningAccount?: string;
  fullName?: string;
  dataValues: Record<string, any>;
  status: 'VALID' | 'INVALID';
  errors: GenericValidationItemError[];
}

export interface GenericValidationSummaryResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  records: GenericValidationRecordResult[];
  allErrors: GenericValidationItemError[];
}

// ==========================================
// MODULE 1: FORM RULES VALIDATOR
// (CHỈ KIỂM TRA QUY TẮC CỦA BIỂU MẪU - HOÀN TOÀN ĐỘC LẬP VỚI MASTER DB)
// ==========================================
export function validateFormRulesOnly(
  rowValues: Record<string, any>,
  rowIndex: number,
  fields: FormFieldRuleConfig[]
): GenericValidationItemError[] {
  const errors: GenericValidationItemError[] = [];

  for (const field of fields) {
    // Tìm giá trị theo tên trường (không phân biệt hoa thường hoặc khoảng trắng)
    const normalizedKey = Object.keys(rowValues).find(
      k => k.trim().toLowerCase() === field.fieldName.trim().toLowerCase() ||
           k.trim().toLowerCase() === field.label.trim().toLowerCase()
    );
    const rawVal = normalizedKey ? rowValues[normalizedKey] : undefined;
    const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';

    // 1. Kiểm tra trường bắt buộc (Required)
    if (field.required && !strVal) {
      errors.push({
        rowIndex,
        fieldName: field.fieldName,
        errorType: 'MISSING_REQUIRED_FIELD',
        errorMessage: `Trường "${field.label}" là bắt buộc, không được để trống.`
      });
      continue;
    }

    // Nếu không có giá trị và không bắt buộc thì bỏ qua các check tiếp theo
    if (!strVal) continue;

    // 2. Kiểm tra kiểu số (NUMBER)
    if (field.fieldType === 'NUMBER') {
      const numVal = Number(strVal);
      if (isNaN(numVal)) {
        errors.push({
          rowIndex,
          fieldName: field.fieldName,
          errorType: 'INVALID_NUMBER_FORMAT',
          errorMessage: `Trường "${field.label}" phải là định dạng số hợp lệ (nhập: "${strVal}").`
        });
      } else {
        if (field.min !== undefined && numVal < field.min) {
          errors.push({
            rowIndex,
            fieldName: field.fieldName,
            errorType: 'NUMBER_OUT_OF_RANGE',
            errorMessage: `Giá trị trường "${field.label}" phải lớn hơn hoặc bằng ${field.min} (nhập: ${numVal}).`
          });
        }
        if (field.max !== undefined && numVal > field.max) {
          errors.push({
            rowIndex,
            fieldName: field.fieldName,
            errorType: 'NUMBER_OUT_OF_RANGE',
            errorMessage: `Giá trị trường "${field.label}" phải nhỏ hơn hoặc bằng ${field.max} (nhập: ${numVal}).`
          });
        }
      }
    }

    // 3. Kiểm tra danh sách lựa chọn (SINGLE_SELECT, RADIO)
    if ((field.fieldType === 'SINGLE_SELECT' || field.fieldType === 'RADIO') && field.options && field.options.length > 0) {
      const matchOption = field.options.some(opt => opt.trim().toLowerCase() === strVal.toLowerCase());
      if (!matchOption) {
        errors.push({
          rowIndex,
          fieldName: field.fieldName,
          errorType: 'INVALID_OPTION',
          errorMessage: `Trường "${field.label}" có giá trị "${strVal}" không thuộc danh mục cho phép [${field.options.join(', ')}].`
        });
      }
    }
  }

  return errors;
}

// ==========================================
// MODULE 2: MASTER BIDIRECTIONAL VALIDATOR
// (CHỈ CHẠY KHI VALIDATION_MODE = 'MASTER_VALIDATION')
// ==========================================
interface MasterEmployeeRecord {
  id: number;
  employee_code: string;
  elearning_account: string;
  full_name: string;
}

export function validateMasterBidirectional(
  db: DatabaseSync,
  code: string,
  elearn: string,
  rowIndex: number,
  seenCodes: Map<string, number[]>,
  seenElearns: Map<string, number[]>
): GenericValidationItemError[] {
  const errors: GenericValidationItemError[] = [];

  // 1. Kiểm tra thiếu trường định danh
  if (!code || !elearn) {
    if (!code && !elearn) {
      errors.push({
        rowIndex,
        fieldName: 'employee_code',
        errorType: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'Thiếu cả Mã cán bộ và Tài khoản eLearning trên dòng kê khai.'
      });
    } else if (!code) {
      errors.push({
        rowIndex,
        fieldName: 'employee_code',
        errorType: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'Thiếu Mã cán bộ trên dòng kê khai.'
      });
    } else {
      errors.push({
        rowIndex,
        fieldName: 'elearning_account',
        errorType: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'Thiếu Tài khoản eLearning trên dòng kê khai.'
      });
    }
    return errors;
  }

  // 2. Kiểm tra trùng lặp nội bộ file
  if (code && (seenCodes.get(code)?.length || 0) > 1) {
    const otherRows = seenCodes.get(code)!.filter(idx => idx !== rowIndex);
    errors.push({
      rowIndex,
      fieldName: 'employee_code',
      errorType: 'DUPLICATE_EMPLOYEE_CODE_IN_FILE',
      errorMessage: `LỖI – Mã cán bộ ${code} xuất hiện nhiều lần trong file (trùng dòng: ${otherRows.join(', ')}).`
    });
  }

  if (elearn && (seenElearns.get(elearn)?.length || 0) > 1) {
    const otherRows = seenElearns.get(elearn)!.filter(idx => idx !== rowIndex);
    errors.push({
      rowIndex,
      fieldName: 'elearning_account',
      errorType: 'DUPLICATE_ELEARNING_IN_FILE',
      errorMessage: `LỖI – Tài khoản eLearning ${elearn} xuất hiện nhiều lần trong file (trùng dòng: ${otherRows.join(', ')}).`
    });
  }

  // 3. Đối chiếu 2 chiều với Master Database
  const recordByCode = db.prepare('SELECT id, employee_code, elearning_account, full_name FROM employees WHERE employee_code = ?').get(code) as unknown as MasterEmployeeRecord | undefined;
  const recordByElearn = db.prepare('SELECT id, employee_code, elearning_account, full_name FROM employees WHERE LOWER(elearning_account) = LOWER(?)').get(elearn) as unknown as MasterEmployeeRecord | undefined;

  if (!recordByCode && !recordByElearn) {
    errors.push({
      rowIndex,
      errorType: 'UNKNOWN_BOTH',
      errorMessage: `LỖI – Không tìm thấy cả Mã cán bộ (${code}) và tài khoản eLearning (${elearn}) trong Master Database.`
    });
  } else if (recordByCode && !recordByElearn) {
    errors.push({
      rowIndex,
      fieldName: 'elearning_account',
      errorType: 'WRONG_ELEARNING',
      errorMessage: `Mã cán bộ ${code} tồn tại trong Database nhưng tài khoản eLearning do đơn vị kê khai (${elearn}) không đúng. Tài khoản đúng trong Database là "${recordByCode.elearning_account}".`
    });
  } else if (!recordByCode && recordByElearn) {
    errors.push({
      rowIndex,
      fieldName: 'employee_code',
      errorType: 'WRONG_EMPLOYEE_CODE',
      errorMessage: `Tài khoản eLearning ${elearn} thuộc Mã cán bộ ${recordByElearn.employee_code} (${recordByElearn.full_name}), nhưng đơn vị kê khai Mã cán bộ "${code}".`
    });
  } else if (recordByCode && recordByElearn) {
    if (recordByCode.id !== recordByElearn.id) {
      errors.push({
        rowIndex,
        errorType: 'CROSS_PERSON_MISMATCH',
        errorMessage: `LỖI – Mã cán bộ ${code} (thuộc cán bộ ${recordByCode.full_name}) và tài khoản eLearning ${elearn} (thuộc cán bộ ${recordByElearn.full_name} - Mã CB ${recordByElearn.employee_code}) thuộc hai người khác nhau trong Database.`
      });
    }
  }

  return errors;
}

// ==========================================
// FACADE CHÍNH: UNIVERSAL VALIDATION ENGINE
// NHẬN FORM CONFIG + ROWS VÀ THỰC HIỆN ĐÚNG THEO VALIDATION_MODE
// ==========================================
export function validateSubmissionBatch(
  db: DatabaseSync,
  form: FormConfig,
  rows: Array<{ rowIndex: number; data: Record<string, any> }>
): GenericValidationSummaryResult {
  const records: GenericValidationRecordResult[] = [];
  const allErrors: GenericValidationItemError[] = [];

  // Chuẩn bị map trùng lặp nếu chạy Master Validation
  const seenCodes = new Map<string, number[]>();
  const seenElearns = new Map<string, number[]>();

  const empCodeKey = (form.employeeCodeField || 'employee_code').trim().toLowerCase();
  const elearnKey = (form.elearningField || 'elearning_account').trim().toLowerCase();

  if (form.validationMode === 'MASTER_VALIDATION') {
    for (const r of rows) {
      const codeVal = findFieldValue(r.data, empCodeKey);
      const elearnVal = findFieldValue(r.data, elearnKey);
      if (codeVal) {
        if (!seenCodes.has(codeVal)) seenCodes.set(codeVal, []);
        seenCodes.get(codeVal)!.push(r.rowIndex);
      }
      if (elearnVal) {
        if (!seenElearns.has(elearnVal)) seenElearns.set(elearnVal, []);
        seenElearns.get(elearnVal)!.push(r.rowIndex);
      }
    }
  }

  // Duyệt từng dòng dữ liệu
  for (const r of rows) {
    const rowErrors: GenericValidationItemError[] = [];

    // TẦNG 1: Kiểm tra quy tắc Form (LUÔN CHẠY CHO MỌI LOẠI BIỂU MẪU)
    const formErrors = validateFormRulesOnly(r.data, r.rowIndex, form.fields);
    rowErrors.push(...formErrors);

    // TẦNG 2: Kiểm tra Master Database (CHỈ CHẠY KHI FORM YÊU CẦU MASTER_VALIDATION)
    let code = '';
    let elearn = '';
    if (form.validationMode === 'MASTER_VALIDATION') {
      code = findFieldValue(r.data, empCodeKey);
      elearn = findFieldValue(r.data, elearnKey);
      const masterErrors = validateMasterBidirectional(
        db,
        code,
        elearn,
        r.rowIndex,
        seenCodes,
        seenElearns
      );
      rowErrors.push(...masterErrors);
    }

    const isValid = rowErrors.length === 0;
    if (!isValid) {
      allErrors.push(...rowErrors);
    }

    records.push({
      rowIndex: r.rowIndex,
      employeeCode: code || undefined,
      elearningAccount: elearn || undefined,
      fullName: findFieldValue(r.data, 'full_name') || findFieldValue(r.data, 'họ và tên') || undefined,
      dataValues: r.data,
      status: isValid ? 'VALID' : 'INVALID',
      errors: rowErrors
    });
  }

  const validCount = records.filter(r => r.status === 'VALID').length;
  const errorCount = records.filter(r => r.status === 'INVALID').length;

  return {
    totalRows: rows.length,
    validRows: validCount,
    errorRows: errorCount,
    records,
    allErrors
  };
}

function findFieldValue(data: Record<string, any>, key: string): string {
  const normTarget = key.trim().toLowerCase();
  for (const k of Object.keys(data)) {
    if (k.trim().toLowerCase() === normTarget) {
      const v = data[k];
      return v !== null && v !== undefined ? String(v).trim() : '';
    }
  }
  return '';
}
