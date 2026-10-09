import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';

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
    totalRecords: r.total_records,
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
      SELECT tds.*, c.title as collection_title,
             (SELECT COUNT(*) FROM training_demand_program_topics WHERE demand_submission_id = tds.id) as total_topics
      FROM training_demand_submissions tds
      LEFT JOIN collections c ON tds.collection_id = c.id
      WHERE tds.id = ?
    `).get(targetId) as any;

    if (!sub || sub.status !== 'SUBMITTED') return null;

    const code = createSubmissionReceipt(db, {
      targetType: 'TRAINING_DEMAND',
      targetId: sub.id,
      unitId: sub.unit_id,
      submittedBy: sub.submitted_by || 1,
      approvedBy: sub.approved_by || sub.submitted_by,
      totalRecords: sub.total_topics || 0,
      metadata: {
        title: sub.collection_title || 'Khảo sát nhu cầu đào tạo',
        version: sub.version
      }
    });

    db.prepare('UPDATE training_demand_submissions SET receipt_code = ? WHERE id = ?').run(code, targetId);
    return getReceiptByCode(db, code);
  }
}

