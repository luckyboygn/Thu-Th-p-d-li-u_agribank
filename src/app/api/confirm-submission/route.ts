import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { isWindowOpen } from '@/lib/deadline';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  try {
    const { uploadId } = await req.json();
    if (!uploadId) {
      return NextResponse.json({ error: 'Thiếu uploadId.' }, { status: 400 });
    }

    const db = getDatabase();
    const upload = db.prepare('SELECT * FROM exam_uploads WHERE id = ?').get(uploadId) as any;
    if (!upload) {
      return NextResponse.json({ error: 'Không tìm thấy thông tin upload.' }, { status: 404 });
    }

    const isUnitUser = ['UNIT_ADMIN', 'UNIT_PREPARER', 'UNIT_APPROVER'].includes(session.role);
    if (isUnitUser && upload.unit_id !== session.unitId) {
      return NextResponse.json({ error: 'Bạn không có quyền thao tác trên đơn vị này.' }, { status: 403 });
    }

    // 2.1 Kiểm tra vai trò duyệt hai cấp (Maker-Checker)
    const { canApproveSubmission } = await import('@/lib/maker-checker');
    if (!canApproveSubmission(session.role)) {
      return NextResponse.json({
        error: 'Tài khoản của bạn có vai trò Người lập (PREPARER). Chỉ Người duyệt (APPROVER) hoặc Lãnh đạo đơn vị mới có quyền Gửi chính thức.',
        code: 'APPROVER_REQUIRED'
      }, { status: 403 });
    }

    // Kiểm tra thời hạn của kỳ thi
    const windowCheck = isWindowOpen('EXAM', upload.exam_id, upload.unit_id);
    if (!windowCheck.isOpen) {
      return NextResponse.json({
        error: windowCheck.reason || 'Đợt thu thập đã đóng hoặc quá hạn chót.'
      }, { status: 403 });
    }

    // 1.4 Quy tắc bản hiệu lực khi confirm-submission:
    // a. Kiểm tra xem upload có phải là phiên bản mới nhất của đơn vị trong kỳ thi đó không
    const latestUpload = db.prepare(`
      SELECT id, version FROM exam_uploads
      WHERE exam_id = ? AND unit_id = ?
      ORDER BY version DESC LIMIT 1
    `).get(upload.exam_id, upload.unit_id) as any;

    if (!latestUpload || latestUpload.id !== upload.id) {
      return NextResponse.json({
        error: `Bản tải lên này (v${upload.version}) không phải là phiên bản mới nhất (v${latestUpload?.version || 'N/A'}). Bạn chỉ có thể nộp phiên bản mới nhất.`
      }, { status: 400 });
    }

    // b. total_rows phải lớn hơn 0
    if ((upload.total_rows || 0) <= 0) {
      return NextResponse.json({
        error: 'Danh sách không có bản ghi thí sinh nào để gửi chính thức.'
      }, { status: 400 });
    }

    // c. Chưa ở trạng thái OFFICIAL_SUBMITTED
    if (upload.status === 'OFFICIAL_SUBMITTED') {
      return NextResponse.json({
        error: 'Bản tải lên này đã ở trạng thái Gửi chính thức từ trước.'
      }, { status: 400 });
    }

    // d. Kiểm tra số lỗi: Bắt buộc không còn lỗi mới được gửi chính thức
    if (upload.error_rows > 0) {
      return NextResponse.json({
        error: `Danh sách còn ${upload.error_rows} lỗi chưa được khắc phục. Hệ thống không cho phép gửi chính thức dữ liệu còn lỗi.`
      }, { status: 422 });
    }

    // Cập nhật trạng thái upload này thành OFFICIAL_SUBMITTED
    db.exec('BEGIN TRANSACTION;');
    try {
      // Hủy trạng thái OFFICIAL_SUBMITTED của các phiên bản cũ hơn của cùng unit & exam
      db.prepare(`
        UPDATE exam_uploads
        SET status = 'ARCHIVED'
        WHERE exam_id = ? AND unit_id = ? AND id != ? AND status = 'OFFICIAL_SUBMITTED'
      `).run(upload.exam_id, upload.unit_id, upload.id);

      // Sinh mã biên nhận điện tử duy nhất
      const { createSubmissionReceipt } = await import('@/lib/receipt');
      const examRow = db.prepare('SELECT title FROM exams WHERE id = ?').get(upload.exam_id) as any;
      const receiptCode = createSubmissionReceipt(db, {
        targetType: 'EXAM_UPLOAD',
        targetId: uploadId,
        unitId: upload.unit_id,
        submittedBy: upload.uploaded_by || session.id,
        approvedBy: session.id,
        totalRecords: upload.total_rows || 0,
        metadata: {
          title: examRow?.title || 'Kỳ thi sát hạch',
          fileName: upload.file_name,
          version: upload.version
        }
      });

      db.prepare(`
        UPDATE exam_uploads
        SET status = 'OFFICIAL_SUBMITTED', submitted_at = CURRENT_TIMESTAMP, approved_by = ?, receipt_code = ?
        WHERE id = ?
      `).run(session.id, receiptCode, uploadId);

      db.exec('COMMIT;');

      logAudit({
        userId: session.id,
        username: session.username,
        unitId: upload.unit_id,
        action: 'OFFICIAL_SUBMIT_CONFIRMED',
        details: { uploadId, version: upload.version, totalRows: upload.total_rows, receiptCode },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
      });

      return NextResponse.json({
        success: true,
        message: 'Đã xác nhận gửi chính thức danh sách thí sinh thành công!',
        receiptCode
      });
    } catch (err: any) {
      db.exec('ROLLBACK;');
      throw err;
    }

  } catch (error: any) {
    console.error('Confirm submission error:', error);
    return NextResponse.json({ error: 'Lỗi khi xác nhận gửi chính thức: ' + error.message }, { status: 500 });
  }
}
