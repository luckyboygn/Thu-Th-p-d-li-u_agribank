import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { detectHeaderAndMapping, parseSheetRecords, ColumnMapping } from '@/lib/excel';
import { validateCandidateBatch } from '@/lib/validation';
import { isWindowOpen } from '@/lib/deadline';
import * as xlsx from 'xlsx';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  const { searchParams } = new URL(req.url);
  const examId = searchParams.get('examId');
  let unitId = searchParams.get('unitId') ? parseInt(searchParams.get('unitId')!) : null;

  // Nếu là Unit Admin, chỉ được xem unit của mình
  if (session.role === 'UNIT_ADMIN') {
    unitId = session.unitId;
  }

  const db = getDatabase();
  let query = `
    SELECT u.id, u.exam_id, u.unit_id, u.version, u.file_name, u.file_size, u.file_hash,
           u.total_rows, u.valid_rows, u.error_rows, u.status, u.submitted_at, u.created_at,
           un.unit_code, un.unit_name, ex.title as exam_title
    FROM exam_uploads u
    JOIN units un ON u.unit_id = un.id
    JOIN exams ex ON u.exam_id = ex.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (unitId) {
    query += ' AND u.unit_id = ?';
    params.push(unitId);
  }
  if (examId) {
    query += ' AND u.exam_id = ?';
    params.push(examId);
  }

  query += ' ORDER BY u.created_at DESC';

  const uploads = db.prepare(query).all(...params);
  return NextResponse.json({ uploads });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const examIdStr = formData.get('examId') as string;
    const customMappingStr = formData.get('mapping') as string | null;
    const headerRowIdxStr = formData.get('headerRowIndex') as string | null;
    const mode = (formData.get('mode') as string) || 'execute'; // 'preview' | 'execute'

    if (!file || !examIdStr) {
      return NextResponse.json({ error: 'Thiếu file hoặc kỳ thi.' }, { status: 400 });
    }

    const examId = parseInt(examIdStr);

    // Xác định unitId
    let unitId = session.unitId;
    if (session.role === 'SUPER_ADMIN') {
      const paramUnitId = formData.get('unitId') as string | null;
      if (paramUnitId) unitId = parseInt(paramUnitId);
      else if (!unitId) {
        return NextResponse.json({ error: 'Vui lòng chọn đơn vị cho file upload.' }, { status: 400 });
      }
    }

    if (!unitId) {
      return NextResponse.json({ error: 'Tài khoản chưa được liên kết với đơn vị nào.' }, { status: 403 });
    }

    // Kiểm tra thời hạn nhận dữ liệu của Kỳ thi
    const windowCheck = isWindowOpen('EXAM', examId, unitId);
    if (!windowCheck.isOpen) {
      return NextResponse.json({
        error: windowCheck.reason || 'Đợt thu thập đã đóng hoặc quá hạn chót.'
      }, { status: 403 });
    }

    // 1.4 Quy tắc bản hiệu lực:
    // Đơn vị đã OFFICIAL_SUBMITTED thì không được upload bản mới, trừ khi bài nộp đang REOPENED
    const db = getDatabase();
    const currentActiveUpload = db.prepare(`
      SELECT id, status, version FROM exam_uploads
      WHERE exam_id = ? AND unit_id = ?
      ORDER BY version DESC LIMIT 1
    `).get(examId, unitId) as any;

    if (currentActiveUpload && currentActiveUpload.status === 'OFFICIAL_SUBMITTED') {
      return NextResponse.json({
        error: 'Đơn vị đã nộp chính thức danh sách thí sinh. Bạn không thể tải lên bản mới trừ khi bài nộp được Quản trị viên mở lại (REOPENED).'
      }, { status: 403 });
    }

    // Kiểm tra định dạng & kích thước file (tối đa 25MB)
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExt = path.extname(file.name).toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      return NextResponse.json({ error: 'Định dạng file không hợp lệ. Chỉ chấp nhận .xlsx, .xls, .csv.' }, { status: 400 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Dung lượng file vượt quá giới hạn 25MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Đọc workbook bằng SheetJS
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = (formData.get('sheetName') as string) || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return NextResponse.json({ error: `Không tìm thấy sheet "${sheetName}".` }, { status: 400 });
    }

    const rawSheetData: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (rawSheetData.length === 0) {
      return NextResponse.json({ error: 'Sheet dữ liệu không có nội dung.' }, { status: 400 });
    }

    // Tự động nhận diện header và mapping
    const detection = detectHeaderAndMapping(rawSheetData);

    // Chế độ PREVIEW (Trả về thông tin để giao diện xác nhận trước khi lưu)
    if (mode === 'preview') {
      let previewHeaderRow = detection.headerRowIndex;
      let previewHeaders = detection.headers;
      let previewSampleRows = detection.sampleRows;

      if (headerRowIdxStr !== null && headerRowIdxStr !== undefined && headerRowIdxStr !== '') {
        const customIdx = parseInt(headerRowIdxStr);
        if (!isNaN(customIdx) && customIdx >= 0 && customIdx < rawSheetData.length) {
          previewHeaderRow = customIdx;
          const customRow = rawSheetData[customIdx] || [];
          previewHeaders = customRow.map(c => String(c || '').trim());
          previewSampleRows = [];
          for (let i = customIdx + 1; i < Math.min(customIdx + 6, rawSheetData.length); i++) {
            if (rawSheetData[i] && rawSheetData[i].some(v => v !== null && v !== '')) {
              const rowObj: any = {};
              previewHeaders.forEach((h, colIdx) => {
                if (h) rowObj[h] = rawSheetData[i][colIdx] ?? '';
              });
              previewSampleRows.push(rowObj);
            }
          }
        }
      }

      return NextResponse.json({
        success: true,
        sheets: workbook.SheetNames,
        selectedSheet: sheetName,
        detectedHeaderRow: previewHeaderRow,
        headers: previewHeaders,
        suggestedMapping: detection.suggestedMapping,
        sampleRows: previewSampleRows,
        fileInfo: {
          name: file.name,
          size: file.size,
          hash
        }
      });
    }

    // Chế độ EXECUTE (Xử lý lưu Staging và chạy Validation Engine)
    let headerRowIndex = detection.headerRowIndex;
    if (headerRowIdxStr !== null && headerRowIdxStr !== undefined && headerRowIdxStr !== '') {
      headerRowIndex = parseInt(headerRowIdxStr);
    }

    let mapping: ColumnMapping = detection.suggestedMapping;
    if (customMappingStr) {
      try {
        mapping = JSON.parse(customMappingStr);
      } catch (e) {}
    }

    if (!mapping.employeeCodeCol || !mapping.elearningAccountCol) {
      return NextResponse.json({
        error: `Không thể xác định cột bắt buộc. Cần chỉ định rõ cột Mã cán bộ và Tài khoản eLearning. (Cột hiện có: ${detection.headers.join(', ')})`,
        detectedHeaders: detection.headers
      }, { status: 400 });
    }

    // Bóc tách toàn bộ dòng dữ liệu, bảo toàn 100% cột nghiệp vụ trong rawData
    const parsedRows = parseSheetRecords(rawSheetData, headerRowIndex, mapping);
    if (parsedRows.length === 0) {
      return NextResponse.json({ error: 'Không tìm thấy dòng dữ liệu thí sinh nào sau dòng tiêu đề.' }, { status: 400 });
    }

    // Xác định phiên bản mới (Version numbering per unit per exam)
    const lastUpload = db.prepare(`
      SELECT MAX(version) as max_version FROM exam_uploads WHERE exam_id = ? AND unit_id = ?
    `).get(examId, unitId) as any;
    const newVersion = (lastUpload?.max_version || 0) + 1;

    // Lưu file gốc vào thư mục uploads_storage/
    const storageDir = path.join(process.cwd(), 'uploads_storage');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    const savedFileName = `unit_${unitId}_exam_${examId}_v${newVersion}_${Date.now()}${fileExt}`;
    const savedFilePath = path.join(storageDir, savedFileName);
    fs.writeFileSync(savedFilePath, buffer);

    // Lấy thông tin unit_code của đơn vị tải lên để đối chiếu đơn vị & che thông tin liên đơn vị
    const unitRow = db.prepare('SELECT unit_code FROM units WHERE id = ?').get(unitId) as any;
    const currentUnitCode = unitRow?.unit_code || '';

    // ==========================================
    // CHẠY THUẬT TOÁN ĐỐI CHIẾU 2 CHIỀU (BIDIRECTIONAL VALIDATION ENGINE)
    // ==========================================
    const valResult = validateCandidateBatch(db, parsedRows, currentUnitCode);

    // LƯU VÀO DATABASE (STAGING LAYER BẢO TOÀN DỮ LIỆU) TRONG TRANSACTION
    db.exec('BEGIN TRANSACTION;');
    let uploadId: number = 0;
    try {
      const uploadStatus = valResult.errorRows === 0 ? 'VALIDATED' : 'STAGING';

      const insertUploadStmt = db.prepare(`
        INSERT INTO exam_uploads (
          exam_id, unit_id, version, file_name, file_size, file_hash, original_file_path,
          total_rows, valid_rows, error_rows, warning_rows, status, uploaded_by, prepared_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const uploadExec = insertUploadStmt.run(
        examId,
        unitId,
        newVersion,
        file.name,
        file.size,
        hash,
        savedFilePath,
        valResult.totalRows,
        valResult.validRows,
        valResult.errorRows,
        valResult.warningRows,
        uploadStatus,
        session.id,
        session.id
      );
      uploadId = Number(uploadExec.lastInsertRowid);

      const insertRecordStmt = db.prepare(`
        INSERT INTO exam_records (
          upload_id, exam_id, unit_id, row_index, employee_code, elearning_account, full_name,
          raw_data, validation_status, validation_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertErrorStmt = db.prepare(`
        INSERT INTO validation_errors (
          upload_id, record_id, row_index, employee_code, elearning_account, error_type, error_message, severity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const rec of valResult.records) {
        const errorMsg = rec.errors.map(e => e.errorMessage).join(' | ');
        const recExec = insertRecordStmt.run(
          uploadId,
          examId,
          unitId,
          rec.rowIndex,
          rec.employeeCode,
          rec.elearningAccount,
          rec.fullName || null,
          JSON.stringify(rec.rawData), // BẢO TOÀN 100% CÁC CỘT EXCEL
          rec.status,
          errorMsg || null
        );
        const recordId = Number(recExec.lastInsertRowid);

        for (const err of rec.errors) {
          insertErrorStmt.run(
            uploadId,
            recordId,
            err.rowIndex,
            err.employeeCode,
            err.elearningAccount,
            err.errorType,
            err.errorMessage,
            err.severity || 'ERROR'
          );
        }
      }

      db.exec('COMMIT;');
    } catch (dbErr: any) {
      db.exec('ROLLBACK;');
      throw dbErr;
    }

    logAudit({
      userId: session.id,
      username: session.username,
      unitId: unitId,
      action: 'UPLOAD_EXCEL',
      details: {
        uploadId,
        fileName: file.name,
        version: newVersion,
        totalRows: valResult.totalRows,
        validRows: valResult.validRows,
        errorRows: valResult.errorRows
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      uploadId,
      version: newVersion,
      totalRows: valResult.totalRows,
      validRows: valResult.validRows,
      errorRows: valResult.errorRows,
      status: valResult.errorRows === 0 ? 'VALIDATED' : 'STAGING',
      sampleErrors: valResult.allErrors.slice(0, 50)
    });

  } catch (error: any) {
    console.error('Upload execution error:', error);
    return NextResponse.json({ error: 'Lỗi trong quá trình upload và xử lý: ' + error.message }, { status: 500 });
  }
}
