/**
 * Bảng ánh xạ mã lỗi kỹ thuật sang nhãn tiếng Việt chuẩn hành chính
 * Dùng cho hiển thị tại giao diện Đơn vị và Quản trị viên
 */

export interface ErrorDefinition {
  label: string;
  description: string;
  severity: 'error' | 'warning';
  badgeClass: string;
}

export const ERROR_LABELS: Record<string, ErrorDefinition> = {
  MISSING_REQUIRED_FIELD: {
    label: 'Thiếu thông tin bắt buộc',
    description: 'Dòng dữ liệu bị thiếu thông tin cốt lõi (Mã cán bộ hoặc Tài khoản eLearning).',
    severity: 'error',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  DUPLICATE_EMPLOYEE_CODE_IN_FILE: {
    label: 'Trùng mã cán bộ trong file',
    description: 'Mã cán bộ này xuất hiện nhiều hơn 1 lần trong file Excel vừa tải lên.',
    severity: 'error',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  DUPLICATE_ELEARNING_IN_FILE: {
    label: 'Trùng tài khoản eLearning trong file',
    description: 'Tài khoản eLearning này xuất hiện nhiều hơn 1 lần trong file Excel vừa tải lên.',
    severity: 'error',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  WRONG_ELEARNING: {
    label: 'Sai tài khoản eLearning',
    description: 'Mã cán bộ tìm thấy trong CSDL nhưng tài khoản eLearning không khớp với hồ sơ nhân sự gốc.',
    severity: 'error',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  WRONG_EMPLOYEE_CODE: {
    label: 'Sai mã cán bộ',
    description: 'Tài khoản eLearning tìm thấy trong CSDL nhưng mã cán bộ không khớp với hồ sơ nhân sự gốc.',
    severity: 'error',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  CROSS_PERSON_MISMATCH: {
    label: 'Mã cán bộ và eLearning thuộc 2 người khác nhau',
    description: 'Mã cán bộ thuộc về một người, tài khoản eLearning lại thuộc về một người khác trong hệ thống.',
    severity: 'error',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200'
  },
  UNKNOWN_BOTH: {
    label: 'Không tìm thấy trong cơ sở dữ liệu',
    description: 'Cả mã cán bộ và tài khoản eLearning đều không tồn tại trong CSDL nhân sự toàn hàng.',
    severity: 'error',
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200'
  },
  UNIT_MISMATCH: {
    label: 'Cán bộ thuộc đơn vị khác',
    description: 'Cán bộ tồn tại trong hệ thống nhưng đang được phân bổ thuộc đơn vị khác.',
    severity: 'warning',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300'
  },
  INACTIVE_EMPLOYEE: {
    label: 'Cán bộ ngừng hoạt động',
    description: 'Cán bộ đã ở trạng thái ngừng hoạt động (INACTIVE) trong cơ sở dữ liệu toàn hàng.',
    severity: 'warning',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-300'
  }
};

/**
 * Lấy nhãn tiếng Việt của mã lỗi
 */
export function getErrorLabel(errorCode: string): string {
  if (!errorCode) return 'Lỗi không xác định';
  return ERROR_LABELS[errorCode]?.label || errorCode;
}

/**
 * Lấy mô tả chi tiết của mã lỗi
 */
export function getErrorDescription(errorCode: string): string {
  if (!errorCode) return '';
  return ERROR_LABELS[errorCode]?.description || '';
}

/**
 * Lấy style badge của mã lỗi
 */
export function getErrorBadgeClass(errorCode: string): string {
  return ERROR_LABELS[errorCode]?.badgeClass || 'bg-rose-50 text-rose-700 border-rose-200';
}
