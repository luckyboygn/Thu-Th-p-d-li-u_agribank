import { DatabaseSync } from 'node:sqlite';
import { normalizeSpaces, removeInvisibleCharacters, fullWidthToHalfWidth } from './normalization';

/**
 * Chuẩn hóa Mã đơn vị (unit_code) dùng chung toàn hệ thống
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
 * Tập các loại đơn vị tham gia nộp bài / khảo sát thực tế
 * Mặc định: Chi nhánh Loại 1 (BRANCH_L1) và Chi nhánh Loại 2 (BRANCH_L2)
 * Loại trừ: Trụ sở chính / Các ban Hội sở (HO), Công ty con ngoài ngành (SUBSIDIARY)
 */
export const PARTICIPATING_UNIT_TYPES: readonly string[] = ['BRANCH_L1', 'BRANCH_L2'] as const;

/**
 * Điều kiện SQL lọc các đơn vị tham gia khảo sát / nộp file
 */
export const PARTICIPATING_UNITS_SQL_CONDITION = `
  status = 'ACTIVE' AND unit_type IN ('BRANCH_L1', 'BRANCH_L2')
`;

/**
 * Lấy danh sách các đơn vị hợp lệ tham gia tính mẫu số tiến độ
 */
export function getParticipatingUnits(db: DatabaseSync): any[] {
  return db.prepare(`
    SELECT id, unit_code, unit_name, user_account, status, unit_type, region, parent_unit_id
    FROM units
    WHERE status = 'ACTIVE' AND unit_type IN ('BRANCH_L1', 'BRANCH_L2')
    ORDER BY CAST(unit_code AS INTEGER) ASC, unit_code ASC
  `).all() as any[];
}

/**
 * Cấu hình chế độ kiểm tra phạm vi đơn vị (isUnitInScope)
 * - 'EXACT_ONLY': Chỉ chấp nhận đúng đơn vị được phân bổ trong CSDL Master.
 * - 'INCLUDE_SUBSIDIARIES': Chấp nhận cả đơn vị trực thuộc (ví dụ Chi nhánh Loại 1 được quyền nộp cho PGD/Chi nhánh Loại 2 con).
 */
export type UnitScopeMode = 'EXACT_ONLY' | 'INCLUDE_SUBSIDIARIES';

/**
 * Kiểm tra xem đơn vị của cán bộ (employeeUnitCode) có nằm trong phạm vi quản lý của đơn vị nộp (uploadUnitCode) hay không
 */
export function isUnitInScope(
  db: DatabaseSync,
  uploadUnitCode: string,
  employeeUnitCode: string,
  scopeMode: UnitScopeMode = 'EXACT_ONLY'
): boolean {
  const normUpload = normalizeUnitCode(uploadUnitCode);
  const normEmployee = normalizeUnitCode(employeeUnitCode);

  if (!normUpload || !normEmployee) return false;
  if (normUpload === normEmployee) return true;

  // Nếu chỉ xét chính xác cùng mã đơn vị
  if (scopeMode === 'EXACT_ONLY') {
    return false;
  }

  // Nếu xét cả cây phân cấp trực thuộc (INCLUDE_SUBSIDIARIES)
  try {
    const uploadUnit = db.prepare('SELECT id FROM units WHERE UPPER(TRIM(unit_code)) = ?').get(normUpload) as any;
    if (!uploadUnit) return false;

    // Duyệt ngược từ employeeUnit lên các cấp cha xem có trỏ về uploadUnit không
    let currentEmpUnit = db.prepare('SELECT id, parent_unit_id FROM units WHERE UPPER(TRIM(unit_code)) = ?').get(normEmployee) as any;
    const visited = new Set<number>();

    while (currentEmpUnit && currentEmpUnit.parent_unit_id) {
      if (visited.has(currentEmpUnit.id)) break; // Chống vòng lặp vô hạn
      visited.add(currentEmpUnit.id);

      if (currentEmpUnit.parent_unit_id === uploadUnit.id) {
        return true; // Nằm trong cây trực thuộc của uploadUnit
      }

      currentEmpUnit = db.prepare('SELECT id, parent_unit_id FROM units WHERE id = ?').get(currentEmpUnit.parent_unit_id) as any;
    }
  } catch (err) {
    console.error('Error in isUnitInScope:', err);
  }

  return false;
}
