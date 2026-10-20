import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

  const db = getDatabase();

  if (!unitId && session.role === 'SUPER_ADMIN') {
    const firstUnit = db.prepare('SELECT id FROM units ORDER BY id ASC LIMIT 1').get() as any;
    unitId = firstUnit?.id || null;
  }

  if (!unitId) {
    return NextResponse.json({ error: 'Không tìm thấy thông tin đơn vị.' }, { status: 400 });
  }

  // Lấy đơn vị
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unitId) as any;

  // Lấy danh sách kỳ thi nghiệp vụ (CHỈ lấy đợt thi nghiệp vụ / kê khai nhân sự, loại trừ khảo sát đào tạo)
  const allExams = db.prepare(`
    SELECT id, code, title, status, start_date, end_date, start_at, end_at, task_type
    FROM exams
    WHERE (task_type = 'CANDIDATE_EXAM' OR task_type IS NULL)
      AND LOWER(title) NOT LIKE '%khảo sát%'
      AND LOWER(title) NOT LIKE '%đào tạo%'
      AND LOWER(title) NOT LIKE '%nhu cầu%'
      AND LOWER(code) NOT LIKE 'ks%'
    ORDER BY id DESC
  `).all() as any[];

  // Lấy danh sách các đợt khảo sát nhu cầu đào tạo (từ collections)
  const allTrainingCollections = db.prepare(`
    SELECT id, code, title, status, start_date, end_date, start_at, end_at, task_type
    FROM collections
    ORDER BY id DESC
  `).all() as any[];

  // Xác định examId hợp lệ cho Thi nghiệp vụ:
  // Nếu param truyền vào là một đợt khảo sát hoặc không có trong allExams, fallback về đợt thi nghiệp vụ hợp lệ
  let examId = examIdParam ? parseInt(examIdParam) : null;
  const isRequestedExamValid = examId ? allExams.some(e => e.id === examId) : false;

  if (!examId || !isRequestedExamValid) {
    const activeExam = allExams.find(e => e.status === 'OPEN') || allExams[0] || null;
    examId = activeExam?.id || null;
  }

  const exam = examId ? db.prepare('SELECT id, code, title, description, status, start_date, end_date, start_at, end_at, task_type FROM exams WHERE id = ?').get(examId) as any : null;

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

  // Lấy thông tin khảo sát đào tạo của đơn vị để giao diện chính luôn có đủ dữ liệu
  const activeTrainingColl = allTrainingCollections.find(c => c.status === 'OPEN') || allTrainingCollections[0] || null;
  let trainingSubmission: any = null;
  let trainingSummary: any = null;

  if (unitId) {
    trainingSubmission = db.prepare(`
      SELECT s.*, c.code as collection_code, c.title as collection_title, c.status as collection_status
      FROM training_demand_submissions s
      JOIN collections c ON s.collection_id = c.id
      WHERE s.unit_id = ?
      ORDER BY (c.status = 'OPEN') DESC, s.updated_at DESC, s.id DESC
      LIMIT 1
    `).get(unitId) as any;

    if (trainingSubmission) {
      if (!trainingSubmission.receipt_code) {
        const rc = db.prepare(`
          SELECT receipt_code FROM submission_receipts 
          WHERE target_type = 'TRAINING_DEMAND' AND target_id = ?
          ORDER BY id DESC LIMIT 1
        `).get(trainingSubmission.id) as any;
        if (rc?.receipt_code) trainingSubmission.receipt_code = rc.receipt_code;
      }

      const progCount = (db.prepare(`
        SELECT COUNT(*) as c FROM training_demand_programs WHERE submission_id = ?
      `).get(trainingSubmission.id) as any)?.c || 0;

      const progSum = (db.prepare(`
        SELECT COALESCE(SUM(dt.participant_count), 0) as s
        FROM training_demand_program_topics dt
        JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
        WHERE dp.submission_id = ?
      `).get(trainingSubmission.id) as any)?.s || 0;

      const propSum = (db.prepare(`
        SELECT COALESCE(SUM(participant_count), 0) as s
        FROM training_demand_proposals WHERE submission_id = ?
      `).get(trainingSubmission.id) as any)?.s || 0;

      trainingSummary = {
        programCount: progCount,
        totalParticipants: progSum + propSum
      };
    }
  }

  return NextResponse.json({
    unit,
    exam,
    allExams,
    allTrainingCollections,
    forms: formsStatus,
    latestUpload,
    errors,
    uploadHistory,
    deadlineExtension,
    reopenInfo,
    activeCampaignTask,
    trainingSubmission,
    trainingSummary,
    activeTrainingCollection: activeTrainingColl
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    }
  });
}
