import { getDatabase } from './db';

/**
 * Kiểm tra xem tính năng Duyệt hai cấp (Maker-Checker) có đang được kích hoạt hay không
 */
export function isMakerCheckerEnabled(): boolean {
  try {
    const db = getDatabase();
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'maker_checker_enabled'").get() as any;
    return row?.value === 'true' || row?.value === '1';
  } catch (e) {
    return false;
  }
}

/**
 * Đặt trạng thái Maker-Checker
 */
export function setMakerCheckerEnabled(enabled: boolean): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO system_settings (key, value, description, updated_at)
    VALUES ('maker_checker_enabled', ?, 'Bật/tắt quy trình duyệt hai cấp Maker-Checker tại đơn vị', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(enabled ? 'true' : 'false');
}

/**
 * Kiểm tra xem user có quyền Lập/Kê khai (Maker / Preparer) hay không
 */
export function canPrepareSubmission(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'UNIT_ADMIN' || role === 'UNIT_PREPARER';
}

/**
 * Kiểm tra xem user có quyền Duyệt / Gửi chính thức (Checker / Approver) hay không
 */
export function canApproveSubmission(role: string): boolean {
  const mcEnabled = isMakerCheckerEnabled();
  if (role === 'SUPER_ADMIN') return true;
  if (!mcEnabled) {
    // Khi Maker-Checker tắt: Cả UNIT_ADMIN và UNIT_APPROVER đều được chốt
    return role === 'UNIT_ADMIN' || role === 'UNIT_APPROVER';
  }
  // Khi Maker-Checker bật: Chỉ UNIT_APPROVER hoặc SUPER_ADMIN được duyệt
  // (UNIT_PREPARER tuyệt đối bị cấm)
  return role === 'UNIT_APPROVER' || role === 'UNIT_ADMIN';
}
