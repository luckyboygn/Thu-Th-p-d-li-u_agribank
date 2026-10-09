import { getDatabase } from './db';

export interface WindowCheckResult {
  isOpen: boolean;
  reason?: string;
  startAt?: string | null;
  endAt?: string | null;
  isExtended?: boolean;
  extensionReason?: string;
  status?: string;
  title?: string;
}

/**
 * Kiểm tra xem đợt thu thập / kỳ thi có đang mở để nhận dữ liệu hay không.
 * @param targetType 'EXAM' | 'COLLECTION'
 * @param targetId id của kỳ thi hoặc đợt khảo sát
 * @param unitId id của đơn vị (để kiểm tra gia hạn riêng)
 */
export function isWindowOpen(
  targetType: 'EXAM' | 'COLLECTION',
  targetId: number,
  unitId?: number | null
): WindowCheckResult {
  const db = getDatabase();

  let target: any = null;
  if (targetType === 'EXAM') {
    target = db.prepare('SELECT id, code, title, status, start_at, end_at FROM exams WHERE id = ?').get(targetId);
  } else {
    target = db.prepare('SELECT id, code, title, status, start_at, end_at FROM collections WHERE id = ?').get(targetId);
  }

  if (!target) {
    return {
      isOpen: false,
      reason: targetType === 'EXAM' ? 'Kỳ thi không tồn tại trong hệ thống.' : 'Đợt khảo sát không tồn tại trong hệ thống.'
    };
  }

  // 1. Kiểm tra trạng thái cơ bản (status)
  if (target.status !== 'OPEN') {
    return {
      isOpen: false,
      status: target.status,
      title: target.title,
      reason: `Đợt đang ở trạng thái "${target.status === 'CLOSED' ? 'Đã đóng' : target.status}". Không tiếp nhận dữ liệu mới.`
    };
  }

  let effectiveEndAt = target.end_at ? new Date(target.end_at) : null;
  let isExtended = false;
  let extensionReason: string | undefined;

  // 2. Kiểm tra xem đơn vị có được cấp gia hạn riêng không
  if (unitId) {
    const ext = db.prepare(`
      SELECT new_end_at, reason FROM deadline_extensions
      WHERE unit_id = ? AND target_type = ? AND target_id = ?
    `).get(unitId, targetType, targetId) as any;

    if (ext && ext.new_end_at) {
      const extDate = new Date(ext.new_end_at);
      if (!effectiveEndAt || extDate > effectiveEndAt) {
        effectiveEndAt = extDate;
        isExtended = true;
        extensionReason = ext.reason;
      }
    }
  }

  const now = new Date();

  // 3. Kiểm tra start_at (chưa tới hạn mở)
  if (target.start_at) {
    const startDate = new Date(target.start_at);
    if (now < startDate) {
      return {
        isOpen: false,
        status: target.status,
        title: target.title,
        startAt: target.start_at,
        endAt: effectiveEndAt ? effectiveEndAt.toISOString() : null,
        isExtended,
        extensionReason,
        reason: `Chưa tới thời gian tiếp nhận dữ liệu (Thời gian bắt đầu: ${startDate.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}).`
      };
    }
  }

  // 4. Kiểm tra end_at (đã quá hạn chót)
  if (effectiveEndAt) {
    if (now > effectiveEndAt) {
      return {
        isOpen: false,
        status: target.status,
        title: target.title,
        startAt: target.start_at,
        endAt: effectiveEndAt.toISOString(),
        isExtended,
        extensionReason,
        reason: isExtended
          ? `Đã quá hạn chót được gia hạn riêng (Hạn mới: ${effectiveEndAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}).`
          : `Đã quá hạn chót tiếp nhận dữ liệu (Hạn chót: ${effectiveEndAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}).`
      };
    }
  }

  return {
    isOpen: true,
    status: target.status,
    title: target.title,
    startAt: target.start_at,
    endAt: effectiveEndAt ? effectiveEndAt.toISOString() : null,
    isExtended,
    extensionReason
  };
}
