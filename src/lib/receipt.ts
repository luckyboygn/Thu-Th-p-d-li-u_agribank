import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';

export interface TrainingProgramSummaryItem {
  programName: string;
  programCode: string;
  groupName?: string;
  topicCount: number;
  participants: number;
  completedCount?: number;
}

export interface ReceiptInfo {
  receiptCode: string;
  targetType: 'EXAM_UPLOAD' | 'TRAINING_DEMAND';
  targetId: number;
  unitId: number;
  unitCode: string;
  unitName: string;
  title: string;
  submittedAt: string;
  submittedBy: number;
  submittedByName: string;
  approvedBy?: number | null;
  approvedByName?: string | null;
  totalRecords: number;
  checksum: string;
  metadata?: Record<string, any>;
}

/**
 * Tính tổng số lượt học viên đăng ký nhu cầu đào tạo từ toàn bộ các nguồn dữ liệu:
 * 1. Khung chương trình đào tạo (training_demand_programs + training_demand_program_topics)
 * 2. Đề xuất ngoài khung (training_demand_proposals)
 * 3. Vị trí chức danh (training_demand_positions + training_demand_topics - dữ liệu cũ nếu có)
 */
export function calculateTrainingDemandParticipants(db: DatabaseSync, submissionId: number): number {
  if (!submissionId) return 0;

  // 1. Từ Khung chương trình đào tạo (Nguồn chính hiện tại)
  let progTotal = 0;
  try {
    const progRow = db.prepare(`
      SELECT COALESCE(SUM(dt.participant_count), 0) as total
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      WHERE dp.submission_id = ?
    `).get(submissionId) as any;
    progTotal = Number(progRow?.total || 0);
  } catch (e) {}

  // 2. Từ Đề xuất đào tạo ngoài khung (Mục 2.8)
  let propTotal = 0;
  try {
    const propRow = db.prepare(`
      SELECT COALESCE(SUM(participant_count), 0) as total
      FROM training_demand_proposals
      WHERE submission_id = ?
    `).get(submissionId) as any;
    propTotal = Number(propRow?.total || 0);
  } catch (e) {}

  // 3. Từ Vị trí chức danh (Bản ghi cũ nếu có)
  let posTotal = 0;
  try {
    const posRow = db.prepare(`
      SELECT COALESCE(SUM(t.participant_count), 0) as total
      FROM training_demand_topics t
      JOIN training_demand_positions p ON t.demand_position_id = p.id
      WHERE p.submission_id = ?
    `).get(submissionId) as any;
    posTotal = Number(posRow?.total || 0);
  } catch (e) {}

  return progTotal + propTotal + posTotal;
}

/**
 * Lấy danh sách tóm tắt các chương trình đào tạo đã kê khai để đưa vào biên nhận
 */
export function getTrainingDemandProgramsSummary(
  db: DatabaseSync,
  submissionId: number
): TrainingProgramSummaryItem[] {
  if (!submissionId) return [];
  try {
    const rows = db.prepare(`
      SELECT p.name as program_name, p.code as program_code, p.group_name,
             COALESCE(SUM(dt.participant_count), 0) as participants,
             COALESCE(SUM(dt.completed_count), 0) as completed_count,
             COUNT(CASE WHEN dt.participant_count > 0 THEN 1 END) as topic_count
      FROM training_demand_programs dp
      JOIN training_programs p ON dp.program_id = p.id
      LEFT JOIN training_demand_program_topics dt ON dt.demand_program_id = dp.id
      WHERE dp.submission_id = ?
      GROUP BY p.id
      ORDER BY p.id ASC
    `).all(submissionId) as any[];

    return rows.map(r => ({
      programName: r.program_name || '',
      programCode: r.program_code || '',
      groupName: r.group_name || '',
      topicCount: Number(r.topic_count || 0),
      participants: Number(r.participants || 0),
      completedCount: Number(r.completed_count || 0)
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Sinh mã biên nhận duy nhất chuẩn Agribank
 * Định dạng: AGR-[MÃ_ĐƠN_VỊ]-[LOẠI]-[ID]-[THỜI_GIAN_HEX]-[CHECKSUM_4]
 */
export function generateReceiptCode(
  unitCode: string,
  targetType: 'EXAM_UPLOAD' | 'TRAINING_DEMAND',
  targetId: number,
  timestampMs = Date.now()
): string {
  const cleanUnit = (unitCode || 'UNIT').trim().toUpperCase();
  const typeTag = targetType === 'EXAM_UPLOAD' ? 'EXAM' : 'DEMAND';
  const timeHex = timestampMs.toString(16).toUpperCase();

  // Sinh checksum 4 ký tự từ dữ liệu cơ sở
  const rawPayload = `${cleanUnit}:${typeTag}:${targetId}:${timestampMs}:AGRIBANK_RECEIPT_SECRET_SALT`;
  const checksum = crypto.createHash('sha256').update(rawPayload).digest('hex').substring(0, 4).toUpperCase();

  return `AGR-${cleanUnit}-${typeTag}-${targetId}-${timeHex}-${checksum}`;
}

/**
 * Tạo và lưu biên nhận vào cơ sở dữ liệu
 */
export function createSubmissionReceipt(
  db: DatabaseSync,
  params: {
    targetType: 'EXAM_UPLOAD' | 'TRAINING_DEMAND';
    targetId: number;
    unitId: number;
    submittedBy: number;
    approvedBy?: number | null;
    totalRecords: number;
    metadata: Record<string, any>;
  }
): string {
  const unitRow = db.prepare('SELECT unit_code, unit_name FROM units WHERE id = ?').get(params.unitId) as any;
  const unitCode = unitRow?.unit_code || 'UNIT';
  const receiptCode = generateReceiptCode(unitCode, params.targetType, params.targetId);

  const fullMetadata = {
    ...params.metadata,
    unit_code: unitCode,
    unit_name: unitRow?.unit_name || '',
    generated_at: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO submission_receipts (
      receipt_code, target_type, target_id, unit_id, submitted_by, approved_by, total_records, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    receiptCode,
    params.targetType,
    params.targetId,
    params.unitId,
    params.submittedBy,
    params.approvedBy || null,
    params.totalRecords,
    JSON.stringify(fullMetadata)
  );

  return receiptCode;
}

/**
 * Tra cứu thông tin biên nhận đầy đủ theo receiptCode
 * Có cơ chế tự động bù đắp (Self-healing / Fallback): Nếu biên nhận đã sinh trước đó
 * bị lưu sai số lượng (0 lượt), hệ thống tự động tính lại từ dữ liệu thực tế và cập nhật lại DB.
 */
export function getReceiptByCode(db: DatabaseSync, receiptCode: string): ReceiptInfo | null {
  const r = db.prepare(`
    SELECT sr.*, 
           u.unit_code, u.unit_name,
           sub_user.full_name as submitted_by_name,
           app_user.full_name as approved_by_name
    FROM submission_receipts sr
    LEFT JOIN units u ON sr.unit_id = u.id
    LEFT JOIN users sub_user ON sr.submitted_by = sub_user.id
    LEFT JOIN users app_user ON sr.approved_by = app_user.id
    WHERE sr.receipt_code = ?
  `).get(receiptCode) as any;

  if (!r) return null;

  let meta: any = {};
  try {
    meta = r.metadata ? JSON.parse(r.metadata) : {};
  } catch (e) {}

  let totalRecords = Number(r.total_records || 0);

  // Tự động kiểm tra và phục hồi số lượng chính xác cho TRAINING_DEMAND
  if (r.target_type === 'TRAINING_DEMAND') {
    const actualParticipants = calculateTrainingDemandParticipants(db, r.target_id);
    const summary = getTrainingDemandProgramsSummary(db, r.target_id);

    let needsDbUpdate = false;

    if (actualParticipants > 0 && totalRecords <= 0) {
      totalRecords = actualParticipants;
      meta.totalParticipants = actualParticipants;
      needsDbUpdate = true;
    } else if (actualParticipants > 0 && totalRecords !== actualParticipants) {
      totalRecords = actualParticipants;
      meta.totalParticipants = actualParticipants;
      needsDbUpdate = true;
    }

    if (!meta.programsSummary && summary.length > 0) {
      meta.programsSummary = summary;
      needsDbUpdate = true;
    }

    if (needsDbUpdate) {
      try {
        db.prepare('UPDATE submission_receipts SET total_records = ?, metadata = ? WHERE id = ?')
          .run(totalRecords, JSON.stringify(meta), r.id);
      } catch (err) {}
    }
  } else if (r.target_type === 'EXAM_UPLOAD') {
    if (totalRecords <= 0) {
      try {
        const upload = db.prepare('SELECT total_rows FROM exam_uploads WHERE id = ?').get(r.target_id) as any;
        if (upload?.total_rows > 0) {
          totalRecords = upload.total_rows;
          db.prepare('UPDATE submission_receipts SET total_records = ? WHERE id = ?').run(totalRecords, r.id);
        }
      } catch (err) {}
    }
  }

  return {
    receiptCode: r.receipt_code,
    targetType: r.target_type,
    targetId: r.target_id,
    unitId: r.unit_id,
    unitCode: r.unit_code || meta.unit_code || '',
    unitName: r.unit_name || meta.unit_name || '',
    title: meta.title || (r.target_type === 'EXAM_UPLOAD' ? 'Danh sách thí sinh tham dự kiểm tra' : 'Khảo sát nhu cầu đào tạo'),
    submittedAt: r.created_at,
    submittedBy: r.submitted_by,
    submittedByName: r.submitted_by_name || 'Cán bộ đơn vị',
    approvedBy: r.approved_by,
    approvedByName: r.approved_by_name || 'Lãnh đạo phê duyệt',
    totalRecords: totalRecords,
    checksum: r.receipt_code.split('-').pop() || '',
    metadata: meta
  };
}

/**
 * Tra cứu biên nhận theo targetType và targetId (hỗ trợ tạo bổ sung nếu đã gửi chính thức)
 */
export function getReceiptByTarget(
  db: DatabaseSync,
  targetType: 'EXAM_UPLOAD' | 'TRAINING_DEMAND',
  targetId: number
): ReceiptInfo | null {
  // Tìm biên nhận đã tồn tại
  const existing = db.prepare(`
    SELECT receipt_code FROM submission_receipts
    WHERE target_type = ? AND target_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(targetType, targetId) as any;

  if (existing?.receipt_code) {
    return getReceiptByCode(db, existing.receipt_code);
  }

  // Nếu chưa có bảng biên nhận, kiểm tra xem bản nộp có ở trạng thái chính thức không
  if (targetType === 'EXAM_UPLOAD') {
    const upload = db.prepare(`
      SELECT eu.*, e.title as exam_title
      FROM exam_uploads eu
      LEFT JOIN exams e ON eu.exam_id = e.id
      WHERE eu.id = ?
    `).get(targetId) as any;

    if (!upload || upload.status !== 'OFFICIAL_SUBMITTED') return null;

    const code = createSubmissionReceipt(db, {
      targetType: 'EXAM_UPLOAD',
      targetId: upload.id,
      unitId: upload.unit_id,
      submittedBy: upload.uploaded_by || 1,
      approvedBy: upload.approved_by || upload.uploaded_by,
      totalRecords: upload.total_rows || 0,
      metadata: {
        title: upload.exam_title || 'Kỳ thi sát hạch',
        fileName: upload.file_name,
        version: upload.version
      }
    });

    db.prepare('UPDATE exam_uploads SET receipt_code = ? WHERE id = ?').run(code, targetId);
    return getReceiptByCode(db, code);
  } else {
    const sub = db.prepare(`
      SELECT tds.*, c.title as collection_title
      FROM training_demand_submissions tds
      LEFT JOIN collections c ON tds.collection_id = c.id
      WHERE tds.id = ?
    `).get(targetId) as any;

    if (!sub || sub.status !== 'SUBMITTED') return null;

    const totalParticipants = calculateTrainingDemandParticipants(db, sub.id);
    const summary = getTrainingDemandProgramsSummary(db, sub.id);

    const code = createSubmissionReceipt(db, {
      targetType: 'TRAINING_DEMAND',
      targetId: sub.id,
      unitId: sub.unit_id,
      submittedBy: sub.submitted_by || 1,
      approvedBy: sub.approved_by || sub.submitted_by,
      totalRecords: totalParticipants,
      metadata: {
        title: sub.collection_title || 'Khảo sát nhu cầu đào tạo',
        version: sub.version,
        totalParticipants,
        programsSummary: summary
      }
    });

    db.prepare('UPDATE training_demand_submissions SET receipt_code = ? WHERE id = ?').run(code, targetId);
    return getReceiptByCode(db, code);
  }
}
