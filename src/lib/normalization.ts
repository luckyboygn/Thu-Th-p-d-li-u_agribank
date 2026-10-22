/**
 * Bộ thư viện chuẩn hóa thông tin định danh cán bộ dùng chung toàn hệ thống
 * Đảm bảo tính nhất quán trên tất cả các luồng: Validation, Revalidation,
 * Master Employees Import, Employee Requests.
 */

/**
 * Chuyển đổi ký tự số/chữ dạng Full-width (U+FF01 đến U+FF5E) sang Half-width ASCII chuẩn
 * Ví dụ: '２００７３３６０４' -> '200733604'
 */
export function fullWidthToHalfWidth(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' '); // Full-width ideographic space sang ASCII space
}

/**
 * Loại bỏ toàn bộ các ký tự ẩn, zero-width, non-printing và BOM:
 * - \u200B: Zero-width space
 * - \u200C: Zero-width non-joiner
 * - \u200D: Zero-width joiner
 * - \u200E, \u200F: LTR / RTL marks
 * - \u2060: Word joiner
 * - \uFEFF: Zero-width no-break space (BOM)
 * - \u00AD: Soft hyphen
 */
export function removeInvisibleCharacters(str: string): string {
  if (!str) return '';
  return str.replace(/[\u200B-\u200D\u200E\u200F\u2060\uFEFF\u00AD]/g, '');
}

/**
 * Chuẩn hóa các loại khoảng trắng đặc biệt (NBSP, Em space,...) thành khoảng trắng thông thường
 */
export function normalizeSpaces(str: string): string {
  if (!str) return '';
  return str.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F]/g, ' ');
}

/**
 * Chuẩn hóa Mã cán bộ:
 * - NFC Unicode
 * - Bỏ ký tự ẩn, BOM, zero-width
 * - Chuyển full-width sang half-width
 * - Bỏ khoảng trắng thừa ở hai đầu và bên trong mã
 * - Chuyển toàn bộ thành chữ in hoa (UPPERCASE)
 */
export function normalizeEmployeeCode(raw: any): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).normalize('NFC');
  str = fullWidthToHalfWidth(str);
  str = removeInvisibleCharacters(str);
  str = normalizeSpaces(str);
  return str.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Chuẩn hóa Mã đơn vị (unit_code):
 * - NFC Unicode, bỏ ký tự ẩn, chuyển full-width sang half-width, trim, UPPERCASE
 */
export function normalizeUnitCode(raw: any): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).normalize('NFC');
  str = fullWidthToHalfWidth(str);
  str = removeInvisibleCharacters(str);
  str = normalizeSpaces(str);
  return str.trim().toUpperCase();
}

/**
 * Loại bỏ các số 0 ở đầu chuỗi mã cán bộ (nếu có)
 * Ví dụ: "0200733604" -> "200733604", "00123" -> "123", "0" -> "0"
 */
export function stripLeadingZeros(code: string): string {
  if (!code) return '';
  const stripped = code.replace(/^0+/, '');
  return stripped === '' ? '0' : stripped;
}

/**
 * Chuẩn hóa Tài khoản eLearning:
 * - NFC Unicode
 * - Bỏ ký tự ẩn, BOM, zero-width
 * - Chuyển full-width sang half-width
 * - Chuyển toàn bộ thành chữ thường (lowercase)
 * - Bỏ khoảng trắng ở hai đầu và bên trong
 */
export function normalizeElearning(raw: any): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).normalize('NFC');
  str = fullWidthToHalfWidth(str);
  str = removeInvisibleCharacters(str);
  str = normalizeSpaces(str);
  return str.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Chuẩn hóa Họ và tên hiển thị chuẩn:
 * - NFC Unicode
 * - Bỏ ký tự ẩn
 * - Thay NBSP bằng khoảng trắng thường
 * - Cắt khoảng trắng thừa 2 đầu, gộp nhiều khoảng trắng liền nhau thành 1 khoảng trắng
 */
export function normalizeFullName(raw: any): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).normalize('NFC');
  str = fullWidthToHalfWidth(str);
  str = removeInvisibleCharacters(str);
  str = normalizeSpaces(str);
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Bỏ dấu tiếng Việt phục vụ so sánh họ tên
 */
export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Chuẩn hóa họ tên phục vụ đối chiếu so khớp (không phân biệt dấu, chữ thường, bỏ khoảng trắng thừa)
 * Ví dụ: 'Nguyễn  Thị Thu Hà' -> 'nguyen thi thu ha'
 */
export function normalizeNameForComparison(raw: any): string {
  const base = normalizeFullName(raw).toLowerCase();
  return removeVietnameseAccents(base).replace(/\s+/g, ' ').trim();
}
