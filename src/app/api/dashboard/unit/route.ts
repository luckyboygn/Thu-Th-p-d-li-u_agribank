import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const examIdParam = searchParams.get('examId');

  let unitId = session.unitId;
  if (session.role === 'SUPER_ADMIN' && searchParams.get('unitId')) {
    unitId = parseInt(searchParams.get('unitId')!);
  }

  if (!unitId) {
    return NextResponse.json({ error: 'Không tìm thấy thông tin đơn vị.' }, { status: 400 });
  }

  const db = getDatabase();

  // Lấy đơn vị
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unitId) as any;

  // Lấy kỳ thi
  let examId = examIdParam ? parseInt(examIdParam) : null;
  if (!examId) {
    const activeExam = db.prepare("SELECT id, code, title, status FROM exams WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get() as any;
    examId = activeExam?.id || null;
  }

  const exam = examId ? db.prepare('SELECT id, code, title, description, status, start_date, end_date, start_at, end_at FROM exams WHERE id = ?').get(examId) as any : null;
  const allExams = db.prepare('SELECT id, code, title, status FROM exams ORDER BY id DESC').all() as any[];

  // Lấy thông tin gia hạn riêng của đơn vị (nếu có)
  let deadlineExtension: any = null;
  if (examId && unitId) {
    deadlineExtension = db.prepare(`
      SELECT new_end_at, reason FROM deadline_extensions
      WHERE unit_id = ? AND target_type = 'EXAM' AND target_id = ?
    `).get(unitId, examId) || null;
  }

  // Lấy upload mới nhất
  const latestUpload = examId ? db.prepare(`
    SELECT * FROM exam_uploads
    WHERE exam_id = ? AND unit_id = ?
    ORDER BY version DESC LIMIT 1
  `).get(examId, unitId) as any : null;

  // Lấy thông tin lý do mở lại nếu upload đang REOPENED
  let reopenInfo: any = null;
  if (latestUpload && latestUpload.status === 'REOPENED') {
    reopenInfo = db.prepare(`
      SELECT rl.reason, rl.reopened_at, u.full_name as reopened_by_name
      FROM submission_reopen_log rl
      LEFT JOIN users u ON rl.reopened_by = u.id
      WHERE rl.target_type = 'EXAM_UPLOAD' AND rl.target_id = ?
      ORDER BY rl.id DESC LIMIT 1
    `).get(latestUpload.id) || null;
  }

  // Lấy danh sách lỗi/cảnh báo nếu có (error_rows > 0 hoặc warning_rows > 0)
  let errors: any[] = [];
  if (latestUpload && ((latestUpload.error_rows || 0) > 0 || (latestUpload.warning_rows || 0) > 0)) {
    errors = db.prepare(`
      SELECT id, row_index, employee_code, elearning_account, error_type, error_message, severity, created_at
      FROM validation_errors
      WHERE upload_id = ?
      ORDER BY row_index ASC
      LIMIT 200
    `).all(latestUpload.id) as any[];
  }

  // Lấy lịch sử các lần upload (versions)
  const uploadHistory = examId ? db.prepare(`
    SELECT id, version, file_name, file_size, total_rows, valid_rows, error_rows, warning_rows, status, submitted_at, created_at
    FROM exam_uploads
    WHERE exam_id = ? AND unit_id = ?
    ORDER BY version DESC
  `).all(examId, unitId) : [];

  // Lấy danh sách Forms của Đợt thu thập này
  const forms = examId ? db.prepare(`
    SELECT f.*, 
      (SELECT COUNT(*) FROM form_fields WHERE form_id = f.id) as field_count
    FROM forms f
    WHERE f.collection_id = ?
    ORDER BY f.display_order ASC
  `).all(examId) as any[] : [];

  // Lấy trạng thái từng Form đối với Unit này
  const formsStatus = forms.map(f => {
    const latestSub = db.prepare(`
      SELECT * FROM submissions
      WHERE form_id = ? AND unit_id = ?
      ORDER BY version DESC LIMIT 1
    `).get(f.id, unitId) as any;

    return {
      ...f,
      latestSubmission: latestSub || null
    };
  });

  const campaignSettingRow = db.prepare("SELECT value FROM system_settings WHERE key = 'active_campaign_task'").get() as any;
  const activeCampaignTask = campaignSettingRow?.value || 'AUTO';

  return NextResponse.json({
    unit,
    exam,
    allExams,
    forms: formsStatus,
    latestUpload,
    errors,
    uploadHistory,
    deadlineExtension,
    reopenInfo,
    activeCampaignTask
  });
}
