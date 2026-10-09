import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { validateSubmissionBatch, FormConfig } from '@/lib/validation-engine';
import { detectHeaderAndMapping, ColumnMapping } from '@/lib/excel';
import * as xlsx from 'xlsx';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

// Helper lấy form config từ database
function getFormConfig(db: any, formId: number): FormConfig | null {
  const form = db.prepare('SELECT * FROM forms WHERE id = ?').get(formId) as any;
  if (!form) return null;
  const fields = db.prepare('SELECT * FROM form_fields WHERE form_id = ? ORDER BY display_order ASC').all(formId) as any[];

  return {
    id: form.id,
    collectionId: form.collection_id,
    formCode: form.form_code,
    title: form.title,
    validationMode: form.validation_mode,
    employeeCodeField: form.employee_code_field,
    elearningField: form.elearning_field,
    fields: fields.map(f => ({
      id: f.id,
      fieldName: f.field_name,
      label: f.label,
      fieldType: f.field_type,
      required: f.required === 1,
      options: f.options ? JSON.parse(f.options) : undefined,
      min: f.validation_rules ? JSON.parse(f.validation_rules).min : undefined,
      max: f.validation_rules ? JSON.parse(f.validation_rules).max : undefined,
    }))
  };
}

// GET: Lấy danh sách submission theo Form và Unit
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const formIdStr = searchParams.get('formId');
  const collectionIdStr = searchParams.get('collectionId');
  let unitId = searchParams.get('unitId') ? parseInt(searchParams.get('unitId')!) : null;

  if (session.role === 'UNIT_ADMIN') {
    unitId = session.unitId;
  }

  const db = getDatabase();
  let query = `
    SELECT s.*, f.title as form_title, f.form_code, f.validation_mode,
           u.unit_code, u.unit_name
    FROM submissions s
    JOIN forms f ON s.form_id = f.id
    JOIN units u ON s.unit_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (formIdStr) {
    query += ' AND s.form_id = ?';
    params.push(parseInt(formIdStr));
  }
  if (collectionIdStr) {
    query += ' AND s.collection_id = ?';
    params.push(parseInt(collectionIdStr));
  }
  if (unitId) {
    query += ' AND s.unit_id = ?';
    params.push(unitId);
  }
  query += ' ORDER BY s.version DESC, s.id DESC';

  const submissions = db.prepare(query).all(...params);
  return NextResponse.json({ submissions });
}

// POST: Nộp dữ liệu (qua Excel hoặc Web Form)
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  try {
    const db = getDatabase();
    const contentType = req.headers.get('content-type') || '';

    // CASE 1: WEB FORM SUBMISSION (JSON payload)
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const { formId, collectionId, records: rawRecords } = body;

      if (!formId || !Array.isArray(rawRecords) || rawRecords.length === 0) {
        return NextResponse.json({ error: 'Thiếu Form ID hoặc dữ liệu bản ghi.' }, { status: 400 });
      }

      const formConfig = getFormConfig(db, formId);
      if (!formConfig) {
        return NextResponse.json({ error: 'Không tìm thấy cấu hình Biểu mẫu.' }, { status: 404 });
      }

      let unitId = session.unitId;
      if (session.role === 'SUPER_ADMIN' && body.unitId) {
        unitId = body.unitId;
      }

      // Chuẩn hóa dòng dữ liệu
      const rowsToValidate = rawRecords.map((r: any, idx: number) => ({
        rowIndex: idx + 1,
        data: r
      }));

      // Chạy Universal Validation Engine
      const valResult = validateSubmissionBatch(db, formConfig, rowsToValidate);

      // Lưu submission
      const lastSub = db.prepare('SELECT MAX(version) as mv FROM submissions WHERE form_id = ? AND unit_id = ?').get(formId, unitId) as any;
      const newVersion = (lastSub?.mv || 0) + 1;
      const subStatus = valResult.errorRows === 0 ? 'VALIDATED' : 'STAGING';

      db.exec('BEGIN TRANSACTION;');
      try {
        const insertSubStmt = db.prepare(`
          INSERT INTO submissions (
            form_id, collection_id, unit_id, version, input_method,
            total_rows, valid_rows, error_rows, status, submitted_by
          ) VALUES (?, ?, ?, ?, 'WEB_FORM', ?, ?, ?, ?, ?)
        `);
        const subExec = insertSubStmt.run(
          formId,
          collectionId || formConfig.collectionId,
          unitId,
          newVersion,
          valResult.totalRows,
          valResult.validRows,
          valResult.errorRows,
          subStatus,
          session.id
        );
        const subId = Number(subExec.lastInsertRowid);

        const insertRecordStmt = db.prepare(`
          INSERT INTO submission_records (
            submission_id, form_id, unit_id, row_index, employee_code, elearning_account,
            full_name, data_values, validation_status, validation_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertErrorStmt = db.prepare(`
          INSERT INTO form_validation_errors (
            submission_id, record_id, row_index, field_name, error_type, error_message
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const rec of valResult.records) {
          const recExec = insertRecordStmt.run(
            subId,
            formId,
            unitId,
            rec.rowIndex,
            rec.employeeCode || null,
            rec.elearningAccount || null,
            rec.fullName || null,
            JSON.stringify(rec.dataValues),
            rec.status,
            rec.errors.map(e => e.errorMessage).join(' | ') || null
          );
          const recId = Number(recExec.lastInsertRowid);

          for (const err of rec.errors) {
            insertErrorStmt.run(subId, recId, err.rowIndex, err.fieldName || null, err.errorType, err.errorMessage);
          }
        }

        db.exec('COMMIT;');

        return NextResponse.json({
          success: true,
          submissionId: subId,
          version: newVersion,
          validationMode: formConfig.validationMode,
          totalRows: valResult.totalRows,
          validRows: valResult.validRows,
          errorRows: valResult.errorRows,
          errors: valResult.allErrors
        });
      } catch (e: any) {
        db.exec('ROLLBACK;');
        throw e;
      }
    }

    // CASE 2: EXCEL FILE SUBMISSION (FormData)
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const formIdStr = formData.get('formId') as string;
    const mode = (formData.get('mode') as string) || 'execute';

    if (!file || !formIdStr) {
      return NextResponse.json({ error: 'Thiếu file hoặc formId.' }, { status: 400 });
    }

    const formId = parseInt(formIdStr);
    const formConfig = getFormConfig(db, formId);
    if (!formConfig) {
      return NextResponse.json({ error: 'Không tìm thấy cấu hình Biểu mẫu.' }, { status: 404 });
    }

    let unitId = session.unitId;
    if (session.role === 'SUPER_ADMIN' && formData.get('unitId')) {
      unitId = parseInt(formData.get('unitId') as string);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = (formData.get('sheetName') as string) || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return NextResponse.json({ error: 'Sheet không tồn tại.' }, { status: 400 });

    const rawSheetData: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (rawSheetData.length === 0) return NextResponse.json({ error: 'Sheet rỗng.' }, { status: 400 });

    // Dò header
    const detection = detectHeaderAndMapping(rawSheetData);
    let headerRowIndex = detection.headerRowIndex;
    if (formData.get('headerRowIndex')) {
      headerRowIndex = parseInt(formData.get('headerRowIndex') as string);
    }

    const headers = (rawSheetData[headerRowIndex] || []).map((h, i) => String(h || `Cột_${i + 1}`).trim());

    // Nếu mode = preview
    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        sheets: workbook.SheetNames,
        selectedSheet: sheetName,
        detectedHeaderRow: headerRowIndex,
        headers,
        sampleRows: detection.sampleRows,
        validationMode: formConfig.validationMode,
        fileInfo: { name: file.name, size: file.size, hash }
      });
    }

    // Phân tích các dòng thành key-value objects
    const rowsToValidate: Array<{ rowIndex: number; data: Record<string, any> }> = [];
    for (let r = headerRowIndex + 1; r < rawSheetData.length; r++) {
      const rowArr = rawSheetData[r];
      if (!rowArr || !rowArr.some(c => c !== null && c !== undefined && String(c).trim() !== '')) continue;

      const rowObj: Record<string, any> = {};
      headers.forEach((h, idx) => {
        rowObj[h] = rowArr[idx] !== undefined && rowArr[idx] !== null ? rowArr[idx] : '';
      });
      rowsToValidate.push({ rowIndex: r + 1, data: rowObj });
    }

    // Chạy Universal Validation Engine theo validationMode của form
    const valResult = validateSubmissionBatch(db, formConfig, rowsToValidate);

    // Lưu file vào storage
    const storageDir = path.join(process.cwd(), 'uploads_storage');
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
    const lastSub = db.prepare('SELECT MAX(version) as mv FROM submissions WHERE form_id = ? AND unit_id = ?').get(formId, unitId) as any;
    const newVersion = (lastSub?.mv || 0) + 1;
    const savedPath = path.join(storageDir, `form_${formId}_unit_${unitId}_v${newVersion}_${Date.now()}.xlsx`);
    fs.writeFileSync(savedPath, buffer);

    db.exec('BEGIN TRANSACTION;');
    try {
      const subStatus = valResult.errorRows === 0 ? 'VALIDATED' : 'STAGING';
      const insertSubStmt = db.prepare(`
        INSERT INTO submissions (
          form_id, collection_id, unit_id, version, input_method,
          file_name, file_size, file_hash, total_rows, valid_rows, error_rows,
          status, submitted_by
        ) VALUES (?, ?, ?, ?, 'EXCEL', ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const subExec = insertSubStmt.run(
        formId,
        formConfig.collectionId,
        unitId,
        newVersion,
        file.name,
        file.size,
        hash,
        valResult.totalRows,
        valResult.validRows,
        valResult.errorRows,
        subStatus,
        session.id
      );
      const subId = Number(subExec.lastInsertRowid);

      const insertRecordStmt = db.prepare(`
        INSERT INTO submission_records (
          submission_id, form_id, unit_id, row_index, employee_code, elearning_account,
          full_name, data_values, validation_status, validation_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertErrorStmt = db.prepare(`
        INSERT INTO form_validation_errors (
          submission_id, record_id, row_index, field_name, error_type, error_message
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const rec of valResult.records) {
        const recExec = insertRecordStmt.run(
          subId,
          formId,
          unitId,
          rec.rowIndex,
          rec.employeeCode || null,
          rec.elearningAccount || null,
          rec.fullName || null,
          JSON.stringify(rec.dataValues),
          rec.status,
          rec.errors.map(e => e.errorMessage).join(' | ') || null
        );
        const recId = Number(recExec.lastInsertRowid);

        for (const err of rec.errors) {
          insertErrorStmt.run(subId, recId, err.rowIndex, err.fieldName || null, err.errorType, err.errorMessage);
        }
      }

      db.exec('COMMIT;');

      return NextResponse.json({
        success: true,
        submissionId: subId,
        version: newVersion,
        validationMode: formConfig.validationMode,
        totalRows: valResult.totalRows,
        validRows: valResult.validRows,
        errorRows: valResult.errorRows,
        errors: valResult.allErrors
      });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Lỗi nạp dữ liệu: ' + error.message }, { status: 500 });
  }
}
