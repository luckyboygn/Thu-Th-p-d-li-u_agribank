import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getParticipatingUnits } from '@/lib/units';
import { getSystemDashboardMetrics } from '@/lib/aggregation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
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

    // 0. Lấy cấu hình nhiệm vụ chiến dịch hiện tại
    let activeCampaignTask = 'TRAINING_DEMAND';
    try {
      const campaignSettingRow = db.prepare("SELECT value FROM system_settings WHERE key = 'active_campaign_task'").get() as any;
      if (campaignSettingRow?.value) {
        activeCampaignTask = campaignSettingRow.value;
      }
    } catch (e) {
      // Bỏ qua nếu bảng system_settings chưa khởi tạo
    }

    // 1. Lấy danh sách tất cả các đợt (Collections & Exams) an toàn tuyệt đối
    let collections: any[] = [];
    try {
      collections = db.prepare('SELECT id, code, title, status, created_at FROM collections ORDER BY id DESC').all() as any[];
    } catch {
      collections = [];
    }

    let exams: any[] = [];
    try {
      exams = db.prepare('SELECT id, code, title, status, created_at, task_type FROM exams ORDER BY id DESC').all() as any[];
    } catch {
      try {
        exams = db.prepare('SELECT id, code, title, status, created_at FROM exams ORDER BY id DESC').all() as any[];
      } catch {
        exams = [];
      }
    }

    // Sử dụng module tổng hợp tập trung (Single Source of Truth)
    const sysMetrics = getSystemDashboardMetrics(db, {
      collectionId: collectionIdParam,
      examId: examIdParam,
      formFilter: formFilterParam
    });

    const selectedCollection = sysMetrics.collection;
    const selectedExam = sysMetrics.exam;
    const allUnits = sysMetrics.unitRows.map(r => r.unit);

    // Thống kê tổng hợp từng đơn vị
    let uploadedCount = 0;
    let completedCount = 0;
    let errorUnitsCount = 0;
    let totalCandidates = 0;
    let validCandidates = 0;
    let errorCandidates = 0;

    let trainingSubmittedCount = 0;
    let trainingReopenedCount = 0;
    let trainingDraftCount = 0;
    let totalTrainingDemand = 0;

    const unitList = sysMetrics.unitRows.map(({ unit, candidateUpload: up, trainingDemand: tr }) => {
      // Xử lý trạng thái Nộp file cán bộ
      let candidateStatus: 'CHƯA_UPLOAD' | 'GỬI_CHÍNH_THỨC' | 'HỢP_LỆ' | 'CÓ_LỖI' | 'MỞ_LẠI' = 'CHƯA_UPLOAD';
      if (up) {
        uploadedCount++;
        totalCandidates += up.totalRows || 0;
        validCandidates += up.validRows || 0;
        errorCandidates += up.errorRows || 0;

        if (up.status === 'OFFICIAL_SUBMITTED') {
          candidateStatus = 'GỬI_CHÍNH_THỨC';
          completedCount++;
        } else if (up.status === 'REOPENED') {
          candidateStatus = 'MỞ_LẠI';
          completedCount++; // 1.4: Bản chính thức trước đó vẫn là bản hiệu lực, không tụt về Chưa nộp
        } else if (up.errorRows === 0 && up.validRows > 0) {
          candidateStatus = 'HỢP_LỆ';
        } else {
          candidateStatus = 'CÓ_LỖI';
          errorUnitsCount++;
        }
      }

      // Xử lý trạng thái Nhu cầu đào tạo
      let trainingStatus: 'CHƯA_KÊ_KHAI' | 'ĐANG_SOẠN' | 'ĐÃ_GỬI_CHÍNH_THỨC' | 'MỞ_LẠI' = 'CHƯA_KÊ_KHAI';
      if (tr) {
        totalTrainingDemand += tr.totalParticipantsCombined || 0;
        if (tr.status === 'SUBMITTED') {
          trainingStatus = 'ĐÃ_GỬI_CHÍNH_THỨC';
          trainingSubmittedCount++;
        } else if (tr.status === 'REOPENED') {
          trainingStatus = 'MỞ_LẠI';
          trainingReopenedCount++;
        } else {
          trainingStatus = 'ĐANG_SOẠN';
          trainingDraftCount++;
        }
      }

      // Trạng thái tổng hợp dựa trên formFilter hoặc đợt đang chọn
      const isTrainingSelected = formFilterParam === 'TRAINING_DEMAND' ||
        (formFilterParam !== 'CANDIDATE_LIST' && activeCampaignTask === 'TRAINING_DEMAND') ||
        (formFilterParam !== 'CANDIDATE_LIST' && activeCampaignTask !== 'CANDIDATE_EXAM' && activeCampaignTask !== 'BOTH' && selectedExam && (selectedExam.task_type === 'TRAINING_DEMAND' || selectedExam.code?.startsWith('KS') || selectedExam.title?.toLowerCase().includes('khảo sát')));

      const isCandidateSelected = formFilterParam === 'CANDIDATE_LIST' ||
        (formFilterParam !== 'TRAINING_DEMAND' && activeCampaignTask === 'CANDIDATE_EXAM') ||
        (formFilterParam !== 'TRAINING_DEMAND' && activeCampaignTask !== 'TRAINING_DEMAND' && activeCampaignTask !== 'BOTH' && selectedExam && selectedExam.task_type === 'CANDIDATE_EXAM');

      let overallStatus: 'CHƯA_NỘP' | 'ĐÃ_NỘP' | 'CÓ_LỖI' | 'ĐANG_SOẠN' | 'MỞ_LẠI' = 'CHƯA_NỘP';

      if (isTrainingSelected) {
        if (trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC') overallStatus = 'ĐÃ_NỘP';
        else if (trainingStatus === 'MỞ_LẠI') overallStatus = 'MỞ_LẠI';
        else if (trainingStatus === 'ĐANG_SOẠN') overallStatus = 'ĐANG_SOẠN';
        else overallStatus = 'CHƯA_NỘP';
      } else if (isCandidateSelected) {
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
      else if (candidateStatus === 'CÓ_LỖI') candidateStatusLabel = `Có ${up?.errorRows || 0} lỗi`;

      let trainingStatusLabel = 'Chưa kê khai';
      if (trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC') trainingStatusLabel = 'Đã gửi chính thức';
      else if (trainingStatus === 'ĐANG_SOẠN') trainingStatusLabel = 'Đang soạn';
      else if (trainingStatus === 'MỞ_LẠI') trainingStatusLabel = 'Mở lại bổ sung';

      const candidateSubmittedAt = up?.status === 'OFFICIAL_SUBMITTED' ? (up?.submittedAt || up?.createdAt || null) : null;
      const trainingSubmittedAt = tr?.status === 'SUBMITTED' ? (tr?.submittedAt || tr?.updatedAt || null) : null;

      return {
        unitId: unit.id,
        unitCode: unit.unit_code,
        unitName: unit.unit_name,
        userAccount: unit.user_account || `${unit.unit_code}_Admin`,
        unitType: unit.unit_type || 'BRANCH_L1',
        region: unit.region || 'MIEN_BAC',
        parentUnitId: unit.parent_unit_id || null,
        // Thông tin File Cán bộ
        uploadId: up?.uploadId || null,
        version: up?.version || null,
        fileName: up?.fileName || null,
        totalRows: up?.totalRows || 0,
        validRows: up?.validRows || 0,
        errorRows: up?.errorRows || 0,
        warningRows: up?.warningRows || 0,
        candidateStatus,
        candidateStatusLabel,
        candidateSubmittedAt,
        // Thông tin Khảo sát Đào tạo (Tách riêng Mẫu 04, 05, 06)
        trainingSubmissionId: tr?.submissionId || null,
        trainingProgramsCount: (tr?.m04TopicsCount || 0) + (tr?.m05TopicsCount || 0),
        trainingParticipantsCount: tr?.totalParticipantsCombined || 0,
        m04Participants: tr?.m04Participants || 0,
        m04Completed: tr?.m04Completed || 0,
        m05Participants: tr?.m05Participants || 0,
        m06Participants: tr?.m06Participants || 0,
        trainingStatus,
        trainingStatusLabel,
        trainingSubmittedAt,
        // Trạng thái chung
        overallStatus,
        lastUpdated: up?.submittedAt || up?.createdAt || tr?.submittedAt || tr?.updatedAt || null
      };
    });

    // Tính thống kê theo Vùng miền và Phân loại
    const regionSummary: Record<string, { total: number; examSubmitted: number; trainingSubmitted: number }> = {
      MIEN_BAC: { total: 0, examSubmitted: 0, trainingSubmitted: 0 },
      MIEN_TRUNG: { total: 0, examSubmitted: 0, trainingSubmitted: 0 },
      TAY_NGUYEN: { total: 0, examSubmitted: 0, trainingSubmitted: 0 },
      MIEN_NAM: { total: 0, examSubmitted: 0, trainingSubmitted: 0 }
    };
    const typeSummary: Record<string, { total: number; examSubmitted: number; trainingSubmitted: number }> = {};

    unitList.forEach(u => {
      let reg = 'MIEN_BAC';
      const regRaw = (u.region || '').trim().toUpperCase();
      if (regRaw.includes('TRUNG')) reg = 'MIEN_TRUNG';
      else if (regRaw.includes('NAM')) reg = 'MIEN_NAM';
      else if (regRaw.includes('TAY') || regRaw.includes('NGUYEN')) reg = 'TAY_NGUYEN';
      else reg = 'MIEN_BAC';

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

    let totalMasterCount = 0;
    try {
      totalMasterCount = (db.prepare('SELECT COUNT(*) as count FROM employees').get() as any)?.count || 0;
    } catch {
      totalMasterCount = 0;
    }

    // 6. Thống kê theo Form
    const activeCollectionId = selectedCollection?.id || null;
    const collectionForms = activeCollectionId ? db.prepare(`
      SELECT f.id, f.form_code, f.title, f.validation_mode, f.input_method
      FROM forms f
      WHERE f.collection_id = ?
      ORDER BY f.display_order ASC
    `).all(activeCollectionId) as any[] : [];

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
        trainingReopenedCount,
        trainingDraftCount,
        trainingNotSubmittedCount: Math.max(0, allUnits.length - trainingSubmittedCount - trainingReopenedCount - trainingDraftCount),
        trainingPendingCount: Math.max(0, allUnits.length - trainingSubmittedCount),
        totalTrainingDemand,
        m04TotalParticipants: sysMetrics.trainingMetrics.m04TotalParticipants,
        m04TotalCompleted: sysMetrics.trainingMetrics.m04TotalCompleted,
        m05TotalParticipants: sysMetrics.trainingMetrics.m05TotalParticipants,
        m06TotalParticipants: sysMetrics.trainingMetrics.m06TotalParticipants,
        masterEmployeesCount: totalMasterCount
      },
      regionSummary,
      typeSummary,
      collectionForms,
      unitList,
      currentUnitId: session.unitId || null
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });
  } catch (err: any) {
    console.error('[Dashboard Admin API Error]:', err);
    return NextResponse.json({ error: err.message || 'Lỗi xử lý dashboard' }, { status: 500 });
  }
}
