/**
 * src/lib/aggregation.ts
 * MODULE TỔNG HỢP VÀ ĐẾM DUY NHẤT (SINGLE SOURCE OF TRUTH)
 * Toàn bộ Dashboard, Training-Reports, Export, và Biên nhận đều sử dụng module này.
 * Tuyệt đối không viết SQL tổng hợp phân tán hay tự tính riêng lẻ ở từng route.
 */

import { getParticipatingUnits, UnitRecord } from './units';

export interface ResolvedCollection {
  id: number;
  code: string;
  title: string;
  status: string;
  task_type?: string;
  created_at?: string;
}

export interface ResolvedExam {
  id: number;
  code: string;
  title: string;
  status: string;
  task_type?: string;
  created_at?: string;
}

export interface CandidateUploadMetric {
  id?: number;
  uploadId: number;
  unitId: number;
  version: number;
  fileName: string;
  file_name?: string;
  status: string;
  submittedAt: string | null;
  submitted_at?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  totalRows: number;
  total_rows?: number;
  validRows: number;
  valid_rows?: number;
  errorRows: number;
  error_rows?: number;
  warningRows: number;
  warning_rows?: number;
}

export interface TrainingDemandUnitMetric {
  id?: number;
  submissionId: number;
  unitId: number;
  version: number;
  status: string;
  submittedAt: string | null;
  submitted_at?: string | null;
  updatedAt: string | null;
  updated_at?: string | null;
  receiptCode: string | null;
  // Tách biệt rõ ràng 3 mẫu:
  m04Participants: number;
  m04Completed: number;
  m04TopicsCount: number;
  m05Participants: number;
  m05TopicsCount: number;
  m06Participants: number;
  m06ProposalsCount: number;
  // Tổng tạm tính cộng dồn (khi cần tham chiếu):
  totalParticipantsCombined: number;
  total_training_participants?: number;
  program_count?: number;
}

/**
 * 1. resolveActiveCollection: Xác định đợt khảo sát duy nhất một cách tường minh.
 * Bắt buộc tôn trọng collectionId truyền từ giao diện, tuyệt đối bỏ hardcode 1.
 */
export function resolveActiveCollection(
  db: any,
  explicitCollectionId?: number | string | null
): { collection: ResolvedCollection | null; error?: string } {
  // Nếu có truyền collectionId tường minh từ client
  if (explicitCollectionId) {
    const cId = typeof explicitCollectionId === 'string' ? parseInt(explicitCollectionId, 10) : explicitCollectionId;
    if (!isNaN(cId) && cId > 0) {
      const coll = db.prepare('SELECT id, code, title, status, created_at FROM collections WHERE id = ?').get(cId) as ResolvedCollection | undefined;
      if (coll) {
        return { collection: coll };
      }
      return { collection: null, error: `Không tìm thấy đợt khảo sát có ID = ${cId}` };
    }
  }

  // Nếu không truyền tường minh, giải quyết theo thứ tự ưu tiên nghiệp vụ rõ ràng:
  // 1. Đợt OPEN có bài nộp khảo sát
  const openWithSubs = db.prepare(`
    SELECT c.id, c.code, c.title, c.status, c.created_at
    FROM collections c
    WHERE c.status = 'OPEN' AND c.id IN (SELECT DISTINCT collection_id FROM training_demand_submissions)
    ORDER BY c.id DESC LIMIT 1
  `).get() as ResolvedCollection | undefined;
  if (openWithSubs) return { collection: openWithSubs };

  // 2. Bất kỳ đợt nào có bài nộp khảo sát
  const anyWithSubs = db.prepare(`
    SELECT c.id, c.code, c.title, c.status, c.created_at
    FROM collections c
    WHERE c.id IN (SELECT DISTINCT collection_id FROM training_demand_submissions)
    ORDER BY c.id DESC LIMIT 1
  `).get() as ResolvedCollection | undefined;
  if (anyWithSubs) return { collection: anyWithSubs };

  // 3. Đợt OPEN mới nhất
  const latestOpen = db.prepare(`
    SELECT id, code, title, status, created_at
    FROM collections
    WHERE status = 'OPEN'
    ORDER BY id DESC LIMIT 1
  `).get() as ResolvedCollection | undefined;
  if (latestOpen) return { collection: latestOpen };

  // 4. Đợt mới nhất trong CSDL (bất kể trạng thái)
  const latestAny = db.prepare(`
    SELECT id, code, title, status, created_at
    FROM collections
    ORDER BY id DESC LIMIT 1
  `).get() as ResolvedCollection | undefined;
  if (latestAny) return { collection: latestAny };

  return { collection: null, error: 'Chưa có đợt khảo sát nào trong hệ thống.' };
}

/**
 * 2. resolveActiveExam: Xác định kỳ thi duy nhất một cách tường minh.
 */
export function resolveActiveExam(
  db: any,
  explicitExamId?: number | string | null,
  activeCollection?: ResolvedCollection | null
): { exam: ResolvedExam | null; error?: string } {
  if (explicitExamId) {
    const eId = typeof explicitExamId === 'string' ? parseInt(explicitExamId, 10) : explicitExamId;
    if (!isNaN(eId) && eId > 0) {
      const ex = db.prepare('SELECT id, code, title, status, created_at, task_type FROM exams WHERE id = ?').get(eId) as ResolvedExam | undefined;
      if (ex) return { exam: ex };
      return { exam: null, error: `Không tìm thấy kỳ thi có ID = ${eId}` };
    }
  }

  // Khớp theo mã hoặc tên đợt khảo sát nếu cùng chiến dịch
  if (activeCollection) {
    const matchedExam = db.prepare(`
      SELECT id, code, title, status, created_at, task_type
      FROM exams
      WHERE code = ? OR title = ?
      ORDER BY id DESC LIMIT 1
    `).get(activeCollection.code, activeCollection.title) as ResolvedExam | undefined;
    if (matchedExam) return { exam: matchedExam };
  }

  // Đợt thi OPEN mới nhất
  const latestOpen = db.prepare(`
    SELECT id, code, title, status, created_at, task_type
    FROM exams
    WHERE status = 'OPEN'
    ORDER BY id DESC LIMIT 1
  `).get() as ResolvedExam | undefined;
  if (latestOpen) return { exam: latestOpen };

  // Đợt thi mới nhất
  const latestAny = db.prepare(`
    SELECT id, code, title, status, created_at, task_type
    FROM exams
    ORDER BY id DESC LIMIT 1
  `).get() as ResolvedExam | undefined;
  if (latestAny) return { exam: latestAny };

  return { exam: null, error: 'Chưa có kỳ thi nào trong hệ thống.' };
}

/**
 * 3. getAuthoritativeUploadsByUnit: Lấy đúng phiên bản hiệu lực (mới nhất hoặc OFFICIAL_SUBMITTED)
 * của mỗi đơn vị đối với kỳ thi, đồng thời TÍNH LẠI TOÀN BỘ SỐ DÒNG trực tiếp từ exam_records.
 *
 * Lưu ý nghiệp vụ về error_rows:
 * error_rows là SỐ DÒNG BỊ LỖI (status = 'INVALID'), không phải số lượng lỗi (error count).
 */
export function getAuthoritativeUploadsByUnit(
  db: any,
  examId: number,
  options?: { officialOnly?: boolean }
): Map<number, CandidateUploadMetric> {
  const uploadMap = new Map<number, CandidateUploadMetric>();
  if (!examId) return uploadMap;

  // Lấy bản ghi upload hiệu lực:
  // Nếu officialOnly = true: lấy bản OFFICIAL_SUBMITTED mới nhất của mỗi đơn vị.
  // Mặc định: lấy bản upload mới nhất (MAX(id) GROUP BY unit_id)
  let uploads: any[] = [];
  if (options?.officialOnly) {
    uploads = db.prepare(`
      SELECT u.id, u.unit_id, u.version, u.file_name, u.status, u.submitted_at
      FROM exam_uploads u
      WHERE u.exam_id = ? AND u.status = 'OFFICIAL_SUBMITTED' AND u.id IN (
        SELECT MAX(id) FROM exam_uploads WHERE exam_id = ? AND status = 'OFFICIAL_SUBMITTED' GROUP BY unit_id
      )
    `).all(examId, examId) as any[];
  } else {
    uploads = db.prepare(`
      SELECT u.id, u.unit_id, u.version, u.file_name, u.status, u.submitted_at
      FROM exam_uploads u
      WHERE u.exam_id = ? AND u.id IN (
        SELECT MAX(id) FROM exam_uploads WHERE exam_id = ? GROUP BY unit_id
      )
    `).all(examId, examId) as any[];
  }

  // Chuẩn bị statement tính lại số lượng thực tế trực tiếp từ bảng con exam_records (Single source of truth)
  const countStatsStmt = db.prepare(`
    SELECT
      COUNT(*) as total_rows,
      COUNT(CASE WHEN validation_status = 'VALID' THEN 1 END) as valid_rows,
      COUNT(CASE WHEN validation_status = 'INVALID' THEN 1 END) as error_rows
    FROM exam_records
    WHERE upload_id = ?
  `);

  const warningStmt = db.prepare(`
    SELECT COUNT(DISTINCT er.id) as warning_rows
    FROM exam_records er
    JOIN validation_errors ve ON ve.record_id = er.id
    WHERE er.upload_id = ? AND ve.severity = 'WARNING'
  `);

  for (const u of uploads) {
    const counts = countStatsStmt.get(u.id) as any;
    const warn = warningStmt.get(u.id) as any;

    uploadMap.set(u.unit_id, {
      id: u.id,
      uploadId: u.id,
      unitId: u.unit_id,
      version: u.version,
      fileName: u.file_name,
      file_name: u.file_name,
      status: u.status,
      submittedAt: u.submitted_at,
      submitted_at: u.submitted_at,
      createdAt: u.created_at,
      created_at: u.created_at,
      totalRows: counts?.total_rows || 0,
      total_rows: counts?.total_rows || 0,
      validRows: counts?.valid_rows || 0,
      valid_rows: counts?.valid_rows || 0,
      errorRows: counts?.error_rows || 0,
      error_rows: counts?.error_rows || 0,
      warningRows: warn?.warning_rows || 0,
      warning_rows: warn?.warning_rows || 0
    });
  }

  return uploadMap;
}

/**
 * 4. getTrainingDemandMetricsByUnit: Tổng hợp nhu cầu đào tạo theo đơn vị.
 * TÁCH BIỆT RÕ RÀNG MẪU 04, MẪU 05 VÀ MẪU 06 THÀNH CÁC CỘT RIÊNG.
 */
export function getTrainingDemandMetricsByUnit(
  db: any,
  collectionId: number
): Map<number, TrainingDemandUnitMetric> {
  const metricsMap = new Map<number, TrainingDemandUnitMetric>();
  if (!collectionId) return metricsMap;

  // Lấy bản ghi kê khai mới nhất của mỗi đơn vị trong đợt
  const submissions = db.prepare(`
    SELECT s.id, s.unit_id, s.version, s.status, s.submitted_at, s.updated_at, s.receipt_code
    FROM training_demand_submissions s
    WHERE s.collection_id = ? AND s.id IN (
      SELECT MAX(id) FROM training_demand_submissions WHERE collection_id = ? GROUP BY unit_id
    )
  `).all(collectionId, collectionId) as any[];

  // 1. Tính toán Mẫu 04 (Khung chức danh: p.code NOT LIKE 'PL_NK%')
  let m04Stmt: any;
  try {
    m04Stmt = db.prepare(`
      SELECT
        COALESCE(SUM(dt.participant_count), 0) as m04_participants,
        COALESCE(SUM(dt.completed_count), 0) as m04_completed,
        COUNT(DISTINCT dt.program_topic_id) as m04_topics_count
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_programs p ON dp.program_id = p.id
      WHERE dp.submission_id = ? AND p.code NOT LIKE 'PL_NK%'
    `);
  } catch {
    m04Stmt = db.prepare(`
      SELECT
        COALESCE(SUM(dt.participant_count), 0) as m04_participants,
        0 as m04_completed,
        COUNT(DISTINCT dt.program_topic_id) as m04_topics_count
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_programs p ON dp.program_id = p.id
      WHERE dp.submission_id = ? AND p.code NOT LIKE 'PL_NK%'
    `);
  }

  // 2. Tính toán Mẫu 05 (Ngoài khung ban hành: p.code LIKE 'PL_NK%')
  const m05Stmt = db.prepare(`
    SELECT
      COALESCE(SUM(dt.participant_count), 0) as m05_participants,
      COUNT(DISTINCT dt.program_topic_id) as m05_topics_count
    FROM training_demand_program_topics dt
    JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
    JOIN training_programs p ON dp.program_id = p.id
    WHERE dp.submission_id = ? AND p.code LIKE 'PL_NK%'
  `);

  // 3. Tính toán Mẫu 06 (Đề xuất ngoài khung tự do)
  const m06Stmt = db.prepare(`
    SELECT
      COALESCE(SUM(participant_count), 0) as m06_participants,
      COUNT(id) as m06_proposals_count
    FROM training_demand_proposals
    WHERE submission_id = ?
  `);

  for (const s of submissions) {
    const m04 = m04Stmt.get(s.id) as any;
    const m05 = m05Stmt.get(s.id) as any;
    const m06 = m06Stmt.get(s.id) as any;

    const p04 = m04?.m04_participants || 0;
    const p05 = m05?.m05_participants || 0;
    const p06 = m06?.m06_participants || 0;

    metricsMap.set(s.unit_id, {
      id: s.id,
      submissionId: s.id,
      unitId: s.unit_id,
      version: s.version || 1,
      status: s.status,
      submittedAt: s.submitted_at,
      submitted_at: s.submitted_at,
      updatedAt: s.updated_at,
      updated_at: s.updated_at,
      receiptCode: s.receipt_code,
      m04Participants: p04,
      m04Completed: m04?.m04_completed || 0,
      m04TopicsCount: m04?.m04_topics_count || 0,
      m05Participants: p05,
      m05TopicsCount: m05?.m05_topics_count || 0,
      m06Participants: p06,
      m06ProposalsCount: m06?.m06_proposals_count || 0,
      totalParticipantsCombined: p04 + p05 + p06,
      total_training_participants: p04 + p05 + p06,
      program_count: (m04?.m04_topics_count || 0) + (m05?.m05_topics_count || 0)
    });
  }

  return metricsMap;
}

/**
 * 5. calculateSubmissionParticipantsDetailed: Hàm duy nhất tính toán người học cho 1 submission (dùng chung cho Biên nhận, Dashboard, Export).
 */
export function calculateSubmissionParticipantsDetailed(db: any, submissionId: number): {
  m04Participants: number;
  m04Completed: number;
  m05Participants: number;
  m06Participants: number;
  totalParticipants: number;
} {
  let p04 = 0;
  let c04 = 0;
  try {
    const m04 = db.prepare(`
      SELECT
        COALESCE(SUM(dt.participant_count), 0) as m04_participants,
        COALESCE(SUM(dt.completed_count), 0) as m04_completed
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_programs p ON dp.program_id = p.id
      WHERE dp.submission_id = ? AND p.code NOT LIKE 'PL_NK%'
    `).get(submissionId) as any;
    p04 = Number(m04?.m04_participants || 0);
    c04 = Number(m04?.m04_completed || 0);
  } catch {
    try {
      const m04Fallback = db.prepare(`
        SELECT COALESCE(SUM(dt.participant_count), 0) as m04_participants
        FROM training_demand_program_topics dt
        JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
        JOIN training_programs p ON dp.program_id = p.id
        WHERE dp.submission_id = ? AND p.code NOT LIKE 'PL_NK%'
      `).get(submissionId) as any;
      p04 = Number(m04Fallback?.m04_participants || 0);
    } catch {}
  }

  let p05 = 0;
  try {
    const m05 = db.prepare(`
      SELECT COALESCE(SUM(dt.participant_count), 0) as m05_participants
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_programs p ON dp.program_id = p.id
      WHERE dp.submission_id = ? AND p.code LIKE 'PL_NK%'
    `).get(submissionId) as any;
    p05 = Number(m05?.m05_participants || 0);
  } catch {}

  let p06 = 0;
  try {
    const m06 = db.prepare(`
      SELECT COALESCE(SUM(participant_count), 0) as m06_participants
      FROM training_demand_proposals
      WHERE submission_id = ?
    `).get(submissionId) as any;
    p06 = Number(m06?.m06_participants || 0);
  } catch {}

  let legacyParticipants = 0;
  try {
    const posRow = db.prepare(`
      SELECT COALESCE(SUM(t.participant_count), 0) as total
      FROM training_demand_topics t
      JOIN training_demand_positions p ON t.demand_position_id = p.id
      WHERE p.submission_id = ?
    `).get(submissionId) as any;
    legacyParticipants = Number(posRow?.total || 0);
  } catch {}

  return {
    m04Participants: p04,
    m04Completed: c04,
    m05Participants: p05,
    m06Participants: p06,
    totalParticipants: p04 + p05 + p06 + legacyParticipants
  };
}

/**
 * 6. getSystemDashboardMetrics: Tính toán toàn bộ chỉ số mạng lưới cho Admin Dashboard.
 */
export function getSystemDashboardMetrics(
  db: any,
  params: {
    collectionId?: number | string | null;
    examId?: number | string | null;
    formFilter?: string | null;
  }
) {
  const { collection } = resolveActiveCollection(db, params.collectionId);
  const { exam } = resolveActiveExam(db, params.examId, collection);

  const participatingUnits = getParticipatingUnits(db);
  const totalUnitsCount = participatingUnits.length;

  const candidateUploads = exam ? getAuthoritativeUploadsByUnit(db, exam.id) : new Map();
  const trainingMetrics = collection ? getTrainingDemandMetricsByUnit(db, collection.id) : new Map();

  // Thống kê Thí sinh / Kỳ thi
  let candidateSubmittedCount = 0;
  let candidateReopenedCount = 0;
  let candidateErrorUnitsCount = 0;
  let candidateTotalRows = 0;
  let candidateValidRows = 0;
  let candidateErrorRows = 0;
  let candidateWarningRows = 0;

  // Thống kê Khảo sát đào tạo tách riêng các mẫu
  let trainingSubmittedCount = 0;
  let trainingReopenedCount = 0;
  let trainingDraftCount = 0;
  let m04TotalParticipants = 0;
  let m04TotalCompleted = 0;
  let m05TotalParticipants = 0;
  let m06TotalParticipants = 0;

  const unitRows = participatingUnits.map(unit => {
    const up = candidateUploads.get(unit.id);
    const tr = trainingMetrics.get(unit.id);

    if (up) {
      candidateTotalRows += up.totalRows;
      candidateValidRows += up.validRows;
      candidateErrorRows += up.errorRows;
      candidateWarningRows += up.warningRows;

      if (up.status === 'OFFICIAL_SUBMITTED') {
        candidateSubmittedCount++;
      } else if (up.status === 'REOPENED') {
        candidateReopenedCount++;
        candidateSubmittedCount++; // Bản nộp trước đó vẫn có hiệu lực
      } else if (up.errorRows > 0) {
        candidateErrorUnitsCount++;
      }
    }

    if (tr) {
      m04TotalParticipants += tr.m04Participants;
      m04TotalCompleted += tr.m04Completed;
      m05TotalParticipants += tr.m05Participants;
      m06TotalParticipants += tr.m06Participants;

      if (tr.status === 'SUBMITTED') {
        trainingSubmittedCount++;
      } else if (tr.status === 'REOPENED') {
        trainingReopenedCount++;
        trainingSubmittedCount++;
      } else if (tr.status === 'DRAFT') {
        trainingDraftCount++;
      }
    }

    return {
      unit,
      candidateUpload: up || null,
      trainingDemand: tr || null
    };
  });

  return {
    collection,
    exam,
    totalUnitsCount,
    candidateMetrics: {
      submittedCount: candidateSubmittedCount,
      reopenedCount: candidateReopenedCount,
      pendingCount: totalUnitsCount - candidateSubmittedCount,
      errorUnitsCount: candidateErrorUnitsCount,
      totalRows: candidateTotalRows,
      validRows: candidateValidRows,
      errorRows: candidateErrorRows,
      warningRows: candidateWarningRows
    },
    trainingMetrics: {
      submittedCount: trainingSubmittedCount,
      reopenedCount: trainingReopenedCount,
      draftCount: trainingDraftCount,
      pendingCount: totalUnitsCount - trainingSubmittedCount,
      // Tách biệt theo từng mẫu:
      m04TotalParticipants,
      m04TotalCompleted,
      m05TotalParticipants,
      m06TotalParticipants,
      totalCombinedParticipants: m04TotalParticipants + m05TotalParticipants + m06TotalParticipants
    },
    unitRows
  };
}
