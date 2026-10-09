import { getDatabase } from './db';

export type NotificationType = 
  | 'DEADLINE_WARNING' 
  | 'SUBMISSION_REOPENED' 
  | 'REQUEST_STATUS_UPDATED' 
  | 'NEW_EMPLOYEE_REQUEST' 
  | 'SYSTEM';

export interface NotificationPayload {
  recipientUserId?: number | null;
  recipientUnitId?: number | null;
  recipientRole?: 'SUPER_ADMIN' | 'UNIT_ADMIN' | 'UNIT_PREPARER' | 'UNIT_APPROVER' | null;
  title: string;
  content: string;
  type: NotificationType;
  link?: string | null;
}

/**
 * Interface cho kênh thông báo (Kênh In-app & Kênh Email tương lai)
 */
export interface NotificationChannel {
  send(payload: NotificationPayload): Promise<boolean>;
}

/**
 * Kênh 1: In-App Database Notifications
 */
export class InAppNotificationChannel implements NotificationChannel {
  async send(payload: NotificationPayload): Promise<boolean> {
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO notifications (
          recipient_user_id,
          recipient_unit_id,
          recipient_role,
          title,
          content,
          type,
          link
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.recipientUserId || null,
        payload.recipientUnitId || null,
        payload.recipientRole || null,
        payload.title,
        payload.content,
        payload.type,
        payload.link || null
      );
      return true;
    } catch (error) {
      console.error('[InAppNotificationChannel] Lỗi ghi thông báo:', error);
      return false;
    }
  }
}

/**
 * Kênh 2: Email Stub (Thiết kế sẵn lớp trừu tượng, KHÔNG gửi email thật ở giai đoạn này)
 */
export class EmailNotificationChannel implements NotificationChannel {
  async send(payload: NotificationPayload): Promise<boolean> {
    // Stub logging để sẵn sàng tích hợp SMTP/SendGrid trong tương lai
    // console.log('[EmailNotificationChannel Stub] Sẽ gửi email tới người nhận:', payload.title);
    return true;
  }
}

// Service quản lý điều phối thông báo
class NotificationService {
  private channels: NotificationChannel[] = [
    new InAppNotificationChannel(),
    new EmailNotificationChannel()
  ];

  async dispatch(payload: NotificationPayload): Promise<void> {
    for (const channel of this.channels) {
      try {
        await channel.send(payload);
      } catch (err) {
        console.error('Error dispatching notification:', err);
      }
    }
  }
}

export const notificationService = new NotificationService();

// Các hàm tiện ích nghiệp vụ

/**
 * 1. Thông báo cho Đơn vị khi bài nộp bị Super Admin mở lại
 */
export async function notifySubmissionReopened(params: {
  unitId: number;
  title: string;
  reason: string;
  link?: string;
}) {
  return notificationService.dispatch({
    recipientUnitId: params.unitId,
    recipientRole: null, // Gửi tới mọi vai trò của đơn vị
    title: `Bài nộp đã được mở lại: ${params.title}`,
    content: `Quản trị viên Trung tâm đã mở lại bài nộp của đơn vị. Lý do: "${params.reason}". Vui lòng cập nhật và nộp lại trước hạn.`,
    type: 'SUBMISSION_REOPENED',
    link: params.link || '/unit'
  });
}

/**
 * 2. Thông báo cho Đơn vị khi yêu cầu bổ sung cán bộ được Duyệt hoặc Từ chối
 */
export async function notifyEmployeeRequestUpdated(params: {
  unitId: number;
  employeeCode: string;
  status: 'APPROVED' | 'REJECTED';
  reviewNote?: string;
  link?: string;
}) {
  const isApproved = params.status === 'APPROVED';
  return notificationService.dispatch({
    recipientUnitId: params.unitId,
    title: isApproved 
      ? `Yêu cầu thêm cán bộ ${params.employeeCode} ĐÃ ĐƯỢC DUYỆT`
      : `Yêu cầu thêm cán bộ ${params.employeeCode} BỊ TỪ CHỐI`,
    content: isApproved
      ? `Cán bộ ${params.employeeCode} đã được bổ sung vào CSDL trung tâm. Đơn vị có thể bấm 'Kiểm tra lại' danh sách upload.`
      : `Yêu cầu bổ sung cán bộ ${params.employeeCode} đã bị từ chối. Lý do: ${params.reviewNote || 'Không nêu'}.`,
    type: 'REQUEST_STATUS_UPDATED',
    link: params.link || '/unit'
  });
}

/**
 * 3. Thông báo cho Super Admin khi đơn vị gửi yêu cầu bổ sung cán bộ mới
 */
export async function notifyNewEmployeeRequest(params: {
  unitCode: string;
  unitName?: string;
  employeeCode: string;
  fullName: string;
  link?: string;
}) {
  return notificationService.dispatch({
    recipientRole: 'SUPER_ADMIN',
    title: `Đơn vị ${params.unitCode} đề nghị bổ sung cán bộ`,
    content: `Đơn vị ${params.unitName || params.unitCode} đã gửi đề nghị bổ sung cán bộ ${params.fullName} (Mã: ${params.employeeCode}). Vui lòng phê duyệt.`,
    type: 'NEW_EMPLOYEE_REQUEST',
    link: params.link || '/admin/employee-requests'
  });
}

/**
 * 4. Thông báo cảnh báo sắp hết hạn
 */
export async function notifyDeadlineWarning(params: {
  unitId: number;
  title: string;
  remainingDays: number;
  link?: string;
}) {
  return notificationService.dispatch({
    recipientUnitId: params.unitId,
    title: `Sắp hết hạn: ${params.title}`,
    content: `Thời hạn kê khai chỉ còn ${params.remainingDays} ngày. Đơn vị vui lòng kiểm tra và gửi chính thức dữ liệu trước thời điểm đóng đợt.`,
    type: 'DEADLINE_WARNING',
    link: params.link || '/unit'
  });
}
