import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  // Cả SUPER_ADMIN, UNIT_ADMIN, VIEWER đều được xem thống kê toàn mạng lưới để theo dõi tiến độ
  if (session.role !== 'SUPER_ADMIN' && session.role !== 'UNIT_ADMIN' && session.role !== 'VIEWER') {
    return NextResponse.json({ error: 'Không có quyền truy cập.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const collectionIdParam = searchParams.get('collectionId');
  const examIdParam = searchParams.get('examId');
  const formFilterParam = searchParams.get('formFilter'); // 'ALL' | 'CANDIDATE_LIST' | 'TRAINING_DEMAND'

  const db = getDatabase();

  // 1. Lấy danh sách tất cả các đợt (Collections & Exams)
  const collections = db.prepare('SELECT id, code, title, status, created_at FROM collections ORDER BY id DESC').all() as any[];
  const exams = db.prepare('SELECT id, code, title, status, created_at FROM exams ORDER BY id DESC').all() as any[];

  // Xác định activeCollectionId: chỉ chọn nếu có chỉ định hoặc có đợt OPEN
  let activeCollectionId = collectionIdParam ? parseInt(collectionIdParam) : null;
  if (!activeCollectionId) {
    const activeColl = collections.find(c => c.status === 'OPEN');
    activeCollectionId = activeColl ? activeColl.id : null;
  }

  // Xác định activeExamId: chỉ chọn nếu có chỉ định hoặc có kỳ thi OPEN
  let activeExamId = examIdParam ? parseInt(examIdParam) : null;
  if (!activeExamId) {
    const activeEx = exams.find(e => e.status === 'OPEN');
    activeExamId = activeEx ? activeEx.id : null;
  }

  const selectedCollection = activeCollectionId ? (collections.find(c => c.id === activeCollectionId) || null) : null;
  const selectedExam = activeExamId ? (exams.find(e => e.id === activeExamId) || null) : null;

  // 2. Lấy toàn bộ Đơn vị kèm thông tin phân cấp & vùng miền
  const allUnits = db.prepare('SELECT id, unit_code, unit_name, user_account, status, unit_type, region, parent_unit_id FROM units ORDER BY CAST(unit_code AS INTEGER) ASC, unit_code ASC').all() as any[];

  // 3. Lấy dữ liệu Nộp file Cán bộ / Kỳ thi (exam_uploads)
  const latestUploads = activeExamId ? db.prepare(`
    SELECT u.id, u.unit_id, u.version, u.file_name, u.total_rows, u.valid_rows, u.error_rows, u.status, u.submitted_at, u.created_at
    FROM exam_uploads u
    WHERE u.exam_id = ? AND u.id IN (
      SELECT MAX(id) FROM exam_uploads WHERE exam_id = ? GROUP BY unit_id
    )
  `).all(activeExamId, activeExamId) as any[] : [];
  const uploadMap = new Map<number, any>();
  latestUploads.forEach(u => uploadMap.set(u.unit_id, u));

  // 4. Lấy dữ liệu Khảo sát Nhu cầu Đào tạo (training_demand_submissions)
  const trainingSubmissions = activeCollectionId ? db.prepare(`
    SELECT ts.id, ts.unit_id, ts.version, ts.status, ts.submitted_at, ts.updated_at,
           (SELECT COUNT(*) FROM training_demand_programs WHERE submission_id = ts.id) as program_count,
           (SELECT COALESCE(SUM(dt.participant_count), 0)
            FROM training_demand_program_topics dt
            JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
            WHERE dp.submission_id = ts.id) as total_training_participants
    FROM training_demand_submissions ts
    WHERE ts.collection_id = ? AND ts.id IN (
      SELECT MAX(id) FROM training_demand_submissions WHERE collection_id = ? GROUP BY unit_id
    )
  `).all(activeCollectionId, activeCollectionId) as any[] : [];
  const trainingMap = new Map<number, any>();
  trainingSubmissions.forEach(ts => trainingMap.set(ts.unit_id, ts));

  // 5. Thống kê tổng hợp từng đơn vị
  let uploadedCount = 0;
  let completedCount = 0;
  let errorUnitsCount = 0;
  let totalCandidates = 0;
  let validCandidates = 0;
  let errorCandidates = 0;

  let trainingSubmittedCount = 0;
  let trainingDraftCount = 0;
  let totalTrainingDemand = 0;

  const unitList = allUnits.map(unit => {
    const up = uploadMap.get(unit.id);
    const tr = trainingMap.get(unit.id);

    // Xử lý trạng thái Nộp file cán bộ
    let candidateStatus: 'CHƯA_UPLOAD' | 'GỬI_CHÍNH_THỨC' | 'HỢP_LỆ' | 'CÓ_LỖI' | 'MỞ_LẠI' = 'CHƯA_UPLOAD';
    if (up) {
      uploadedCount++;
      totalCandidates += up.total_rows || 0;
      validCandidates += up.valid_rows || 0;
      errorCandidates += up.error_rows || 0;

      if (up.status === 'OFFICIAL_SUBMITTED') {
        candidateStatus = 'GỬI_CHÍNH_THỨC';
        completedCount++;
      } else if (up.status === 'REOPENED') {
        candidateStatus = 'MỞ_LẠI';
        completedCount++; // 1.4: Bản chính thức trước đó vẫn là bản hiệu lực, không tụt về Chưa nộp
      } else if (up.error_rows === 0 && up.valid_rows > 0) {
        candidateStatus = 'HỢP_LỆ';
      } else {
        candidateStatus = 'CÓ_LỖI';
        errorUnitsCount++;
      }
    }

    // Xử lý trạng thái Nhu cầu đào tạo
    let trainingStatus: 'CHƯA_KÊ_KHAI' | 'ĐANG_SOẠN' | 'ĐÃ_GỬI_CHÍNH_THỨC' | 'MỞ_LẠI' = 'CHƯA_KÊ_KHAI';
    if (tr) {
      totalTrainingDemand += tr.total_training_participants || 0;
      if (tr.status === 'SUBMITTED') {
        trainingStatus = 'ĐÃ_GỬI_CHÍNH_THỨC';
        trainingSubmittedCount++;
      } else if (tr.status === 'REOPENED') {
        trainingStatus = 'MỞ_LẠI';
        trainingSubmittedCount++; // 1.4: Bản chính thức trước đó vẫn tính là đã nộp (đang mở lại)
      } else {
        trainingStatus = 'ĐANG_SOẠN';
        trainingDraftCount++;
      }
    }

    // Trạng thái tổng hợp dựa trên formFilter
    let overallStatus: 'CHƯA_NỘP' | 'ĐÃ_NỘP' | 'CÓ_LỖI' | 'ĐANG_SOẠN' | 'MỞ_LẠI' = 'CHƯA_NỘP';

    if (formFilterParam === 'TRAINING_DEMAND') {
      if (trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC') overallStatus = 'ĐÃ_NỘP';
      else if (trainingStatus === 'MỞ_LẠI') overallStatus = 'MỞ_LẠI';
      else if (trainingStatus === 'ĐANG_SOẠN') overallStatus = 'ĐANG_SOẠN';
      else overallStatus = 'CHƯA_NỘP';
    } else if (formFilterParam === 'CANDIDATE_LIST') {
      if (candidateStatus === 'GỬI_CHÍNH_THỨC' || candidateStatus === 'HỢP_LỆ') overallStatus = 'ĐÃ_NỘP';
      else if (candidateStatus === 'MỞ_LẠI') overallStatus = 'MỞ_LẠI';
      else if (candidateStatus === 'CÓ_LỖI') overallStatus = 'CÓ_LỖI';
      else overallStatus = 'CHƯA_NỘP';
    } else {
      // Mặc định tổng quát
      if (candidateStatus === 'MỞ_LẠI' || trainingStatus === 'MỞ_LẠI') {
        overallStatus = 'MỞ_LẠI';
      } else if (candidateStatus === 'CÓ_LỖI') {
        overallStatus = 'CÓ_LỖI';
      } else if (candidateStatus === 'GỬI_CHÍNH_THỨC' || candidateStatus === 'HỢP_LỆ' || trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC') {
        overallStatus = 'ĐÃ_NỘP';
      } else if (trainingStatus === 'ĐANG_SOẠN') {
        overallStatus = 'ĐANG_SOẠN';
      } else {
        overallStatus = 'CHƯA_NỘP';
      }
    }

    let candidateStatusLabel = 'Chưa nộp file';
    if (candidateStatus === 'GỬI_CHÍNH_THỨC') candidateStatusLabel = 'Đã gửi chính thức';
    else if (candidateStatus === 'HỢP_LỆ') candidateStatusLabel = 'Hợp lệ (chưa gửi)';
    else if (candidateStatus === 'CÓ_LỖI') candidateStatusLabel = `Có ${up?.error_rows || 0} lỗi`;

    let trainingStatusLabel = 'Chưa kê khai';
    if (trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC') trainingStatusLabel = 'Đã gửi chính thức';
    else if (trainingStatus === 'ĐANG_SOẠN') trainingStatusLabel = 'Đang soạn';
    else if (trainingStatus === 'MỞ_LẠI') trainingStatusLabel = 'Mở lại bổ sung';

    const candidateSubmittedAt = up?.status === 'OFFICIAL_SUBMITTED' ? (up?.submitted_at || up?.created_at || null) : null;
    const trainingSubmittedAt = tr?.status === 'SUBMITTED' ? (tr?.submitted_at || tr?.updated_at || null) : null;

    return {
      unitId: unit.id,
      unitCode: unit.unit_code,
      unitName: unit.unit_name,
      userAccount: unit.user_account || `${unit.unit_code}_Admin`,
      unitType: unit.unit_type || 'BRANCH_L1',
      region: unit.region || 'MIEN_BAC',
      parentUnitId: unit.parent_unit_id || null,
      // Thông tin File Cán bộ
      uploadId: up?.id || null,
      version: up?.version || null,
      fileName: up?.file_name || null,
      totalRows: up?.total_rows || 0,
      validRows: up?.valid_rows || 0,
      errorRows: up?.error_rows || 0,
      candidateStatus,
      candidateStatusLabel,
      candidateSubmittedAt,
      // Thông tin Khảo sát Đào tạo
      trainingSubmissionId: tr?.id || null,
      trainingProgramsCount: tr?.program_count || 0,
      trainingParticipantsCount: tr?.total_training_participants || 0,
      trainingStatus,
      trainingStatusLabel,
      trainingSubmittedAt,
      // Trạng thái chung
      overallStatus,
      lastUpdated: up?.submitted_at || up?.created_at || tr?.submitted_at || tr?.updated_at || null
    };
  });

  // Tính thống kê theo Vùng miền và Phân loại
  const regionSummary: Record<string, { total: number; examSubmitted: number; trainingSubmitted: number }> = {};
  const typeSummary: Record<string, { total: number; examSubmitted: number; trainingSubmitted: number }> = {};

  unitList.forEach(u => {
    const reg = u.region || 'MIEN_BAC';
    const typ = u.unitType || 'BRANCH_L1';

    if (!regionSummary[reg]) regionSummary[reg] = { total: 0, examSubmitted: 0, trainingSubmitted: 0 };
    regionSummary[reg].total++;
    if (u.candidateStatus === 'GỬI_CHÍNH_THỨC' || u.candidateStatus === 'MỞ_LẠI') regionSummary[reg].examSubmitted++;
    if (u.trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC' || u.trainingStatus === 'MỞ_LẠI') regionSummary[reg].trainingSubmitted++;

    if (!typeSummary[typ]) typeSummary[typ] = { total: 0, examSubmitted: 0, trainingSubmitted: 0 };
    typeSummary[typ].total++;
    if (u.candidateStatus === 'GỬI_CHÍNH_THỨC' || u.candidateStatus === 'MỞ_LẠI') typeSummary[typ].examSubmitted++;
    if (u.trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC' || u.trainingStatus === 'MỞ_LẠI') typeSummary[typ].trainingSubmitted++;
  });

  const totalMasterCount = (db.prepare('SELECT COUNT(*) as count FROM employees').get() as any).count;

  // 6. Thống kê theo Form
  const collectionForms = activeCollectionId ? db.prepare(`
    SELECT f.id, f.form_code, f.title, f.validation_mode, f.input_method
    FROM forms f
    WHERE f.collection_id = ?
    ORDER BY f.display_order ASC
  `).all(activeCollectionId) as any[] : [];

  const campaignSettingRow = db.prepare("SELECT value FROM system_settings WHERE key = 'active_campaign_task'").get() as any;
  const activeCampaignTask = campaignSettingRow?.value || 'AUTO';

  return NextResponse.json({
    collections,
    exams,
    selectedCollection,
    selectedExam,
    activeCampaignTask,
    summary: {
      totalUnits: allUnits.length,
      uploadedUnits: uploadedCount,
      pendingUnits: allUnits.length - uploadedCount,
      completedUnits: completedCount,
      errorUnits: errorUnitsCount,
      totalCandidates,
      validCandidates,
      errorCandidates,
      trainingSubmittedCount,
      trainingPendingCount: allUnits.length - trainingSubmittedCount,
      trainingDraftCount,
      totalTrainingDemand,
      masterEmployeesCount: totalMasterCount
    },
    regionSummary,
    typeSummary,
    collectionForms,
    unitList,
    currentUnitId: session.unitId || null
  });
}
