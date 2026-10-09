import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { validateCandidateBatch } from '@/lib/validation';
import { ParsedRowData } from '@/lib/excel';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  const resolvedParams = await params;
  const uploadId = parseInt(resolvedParams.id);
  if (!uploadId || isNaN(uploadId)) {
    return NextResponse.json({ error: 'Mã upload không hợp lệ.' }, { status: 400 });
  }

  const db = getDatabase();
  const upload = db.prepare('SELECT * FROM exam_uploads WHERE id = ?').get(uploadId) as any;
  if (!upload) {
    return NextResponse.json({ error: 'Không tìm thấy thông tin upload.' }, { status: 404 });
  }

  // Kiểm tra quyền: Unit Admin chỉ được revalidate file của chính đơn vị mình
  if (session.role === 'UNIT_ADMIN' && upload.unit_id !== session.unitId) {
    return NextResponse.json({ error: 'Bạn không có quyền thao tác trên đơn vị này.' }, { status: 403 });
  }

  // Lấy các bản ghi hiện tại của upload này từ exam_records
  const existingRecords = db.prepare(`
    SELECT id, row_index, employee_code, elearning_account, full_name, raw_data
    FROM exam_records
    WHERE upload_id = ?
    ORDER BY row_index ASC
  `).all(uploadId) as any[];

  if (existingRecords.length === 0) {
    return NextResponse.json({ error: 'Upload không có bản ghi nào để kiểm tra lại.' }, { status: 400 });
  }

  // Chuyển đổi thành ParsedRowData để đưa vào validation engine
  const parsedRows: ParsedRowData[] = existingRecords.map(r => {
    let rawDataObj = {};
    try {
      rawDataObj = r.raw_data ? JSON.parse(r.raw_data) : {};
    } catch (e) {}

    return {
      rowIndex: r.row_index,
      employeeCode: r.employee_code || '',
      elearningAccount: r.elearning_account || '',
      fullName: r.full_name || '',
      rawData: rawDataObj,
      isCandidateRow: true
    };
  });

  // Lấy unit_code của đơn vị để truyền vào validateCandidateBatch
  const unitRow = db.prepare('SELECT unit_code FROM units WHERE id = ?').get(upload.unit_id) as any;
  const currentUnitCode = unitRow?.unit_code || '';

  // Chạy lại thuật toán đối chiếu 2 chiều với CSDL Master cập nhật
  const valResult = validateCandidateBatch(db, parsedRows, currentUnitCode);

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Xóa các lỗi validation_errors cũ của upload này
    db.prepare('DELETE FROM validation_errors WHERE upload_id = ?').run(uploadId);

    // 2. Cập nhật từng dòng trong exam_records
    const updateRecordStmt = db.prepare(`
      UPDATE exam_records
      SET validation_status = ?, validation_message = ?
      WHERE upload_id = ? AND row_index = ?
    `);

    const insertErrorStmt = db.prepare(`
      INSERT INTO validation_errors (
        upload_id, record_id, row_index, employee_code, elearning_account, error_type, error_message, severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Map row_index tới record_id
    const rowIndexToRecordId = new Map<number, number>();
    existingRecords.forEach(r => rowIndexToRecordId.set(r.row_index, r.id));

    valResult.records.forEach(rec => {
      const recId = rowIndexToRecordId.get(rec.rowIndex);
      const valMsg = rec.errors.length > 0 ? rec.errors.map(e => e.errorMessage).join('; ') : 'Hợp lệ';
      updateRecordStmt.run(rec.status, valMsg, uploadId, rec.rowIndex);

      rec.errors.forEach(err => {
        insertErrorStmt.run(
          uploadId,
          recId || null,
          err.rowIndex,
          err.employeeCode,
          err.elearningAccount,
          err.errorType,
          err.errorMessage,
          err.severity || 'ERROR'
        );
      });
    });

    // 3. Cập nhật lại số liệu thống kê trong exam_uploads (giữ nguyên version, không tạo version mới)
    let newUploadStatus = upload.status;
    if (upload.status !== 'OFFICIAL_SUBMITTED' && upload.status !== 'REOPENED') {
      newUploadStatus = valResult.errorRows === 0 ? 'VALIDATED' : 'STAGING';
    }

    db.prepare(`
      UPDATE exam_uploads
      SET valid_rows = ?, error_rows = ?, warning_rows = ?, status = ?
      WHERE id = ?
    `).run(valResult.validRows, valResult.errorRows, valResult.warningRows, newUploadStatus, uploadId);

    // 4. Ghi audit log
    logAudit({
      userId: session.id,
      username: session.username,
      unitId: upload.unit_id,
      action: 'REVALIDATE_UPLOAD',
      details: {
        uploadId,
        previousErrors: upload.error_rows,
        newErrors: valResult.errorRows,
        validRows: valResult.validRows,
        totalRows: valResult.totalRows
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    db.exec('COMMIT;');

    return NextResponse.json({
      success: true,
      message: `Đã đối chiếu lại dữ liệu thành công! Hợp lệ: ${valResult.validRows}/${valResult.totalRows}, Còn lỗi: ${valResult.errorRows}.`,
      validRows: valResult.validRows,
      errorRows: valResult.errorRows,
      totalRows: valResult.totalRows,
      status: newUploadStatus
    });
  } catch (err: any) {
    db.exec('ROLLBACK;');
    console.error('Error revalidating upload:', err);
    return NextResponse.json({ error: err.message || 'Lỗi khi đối chiếu lại file.' }, { status: 500 });
  }
}
