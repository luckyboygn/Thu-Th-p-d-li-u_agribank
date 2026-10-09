import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  // Chỉ SUPER_ADMIN mới có quyền mở lại bài nộp
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên cấp cao mới có quyền mở lại bài nộp.' }, { status: 403 });
  }

  try {
    const { type, id, reason } = await req.json();

    if (!type || !id || !reason) {
      return NextResponse.json({ error: 'Vui lòng cung cấp đầy đủ thông tin: type, id và reason.' }, { status: 400 });
    }

    if (!['EXAM_UPLOAD', 'TRAINING_DEMAND'].includes(type)) {
      return NextResponse.json({ error: 'Loại bài nộp không hợp lệ. Chỉ chấp nhận EXAM_UPLOAD hoặc TRAINING_DEMAND.' }, { status: 400 });
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10) {
      return NextResponse.json({ error: 'Lý do mở lại bài nộp phải có độ dài tối thiểu 10 ký tự.' }, { status: 400 });
    }

    const db = getDatabase();

    db.exec('BEGIN TRANSACTION;');
    try {
      let unitId: number = 0;
      let targetId = Number(id);

      if (type === 'EXAM_UPLOAD') {
        const upload = db.prepare('SELECT id, unit_id, exam_id, status FROM exam_uploads WHERE id = ?').get(targetId) as any;
        if (!upload) {
          db.exec('ROLLBACK;');
          return NextResponse.json({ error: 'Không tìm thấy bài nộp kỳ thi.' }, { status: 404 });
        }
        unitId = upload.unit_id;

        // Chuyển trạng thái upload sang REOPENED
        db.prepare(`
          UPDATE exam_uploads
          SET status = 'REOPENED'
          WHERE id = ?
        `).run(targetId);
      } else if (type === 'TRAINING_DEMAND') {
        const submission = db.prepare('SELECT id, unit_id, collection_id, status FROM training_demand_submissions WHERE id = ?').get(targetId) as any;
        if (!submission) {
          db.exec('ROLLBACK;');
          return NextResponse.json({ error: 'Không tìm thấy hồ sơ khảo sát nhu cầu đào tạo.' }, { status: 404 });
        }
        unitId = submission.unit_id;

        // Chuyển trạng thái submission sang REOPENED
        db.prepare(`
          UPDATE training_demand_submissions
          SET status = 'REOPENED', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(targetId);
      }

      // Ghi nhật ký vào submission_reopen_log
      db.prepare(`
        INSERT INTO submission_reopen_log (target_type, target_id, unit_id, reopened_by, reason)
        VALUES (?, ?, ?, ?, ?)
      `).run(type, targetId, unitId, session.id, trimmedReason);

      // Ghi audit log
      logAudit({
        userId: session.id,
        username: session.username,
        unitId,
        action: 'REOPEN_SUBMISSION',
        details: { targetType: type, targetId, reason: trimmedReason },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
      });

      db.exec('COMMIT;');

      // Gửi thông báo trong ứng dụng cho Đơn vị
      const { notifySubmissionReopened } = await import('@/lib/notification');
      await notifySubmissionReopened({
        unitId,
        title: type === 'EXAM_UPLOAD' ? 'Danh sách thí sinh dự thi' : 'Khảo sát nhu cầu đào tạo',
        reason: trimmedReason,
        link: type === 'EXAM_UPLOAD' ? '/unit' : '/unit/training-demand'
      });

      return NextResponse.json({
        success: true,
        message: 'Đã mở lại bài nộp thành công cho đơn vị bổ sung/chỉnh sửa.'
      });
    } catch (err: any) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } catch (error: any) {
    console.error('Error reopening submission:', error);
    return NextResponse.json({ error: error.message || 'Đã có lỗi xảy ra khi mở lại bài nộp.' }, { status: 500 });
  }
}
