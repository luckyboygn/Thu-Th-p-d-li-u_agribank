import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Lấy danh sách Forms của một Collection
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const collectionId = searchParams.get('collectionId');
  const formId = searchParams.get('formId');

  const db = getDatabase();

  if (formId) {
    const form = db.prepare('SELECT * FROM forms WHERE id = ?').get(formId) as any;
    if (!form) {
      return NextResponse.json({ error: 'Không tìm thấy Form.' }, { status: 404 });
    }
    const fields = db.prepare('SELECT * FROM form_fields WHERE form_id = ? ORDER BY display_order ASC').all(formId);
    return NextResponse.json({
      form: {
        ...form,
        fields: fields.map((f: any) => ({
          ...f,
          options: f.options ? JSON.parse(f.options) : [],
          validation_rules: f.validation_rules ? JSON.parse(f.validation_rules) : {}
        }))
      }
    });
  }

  let query = 'SELECT * FROM forms WHERE 1=1';
  const params: any[] = [];
  if (collectionId) {
    query += ' AND collection_id = ?';
    params.push(collectionId);
  }
  query += ' ORDER BY display_order ASC, id ASC';

  const forms = db.prepare(query).all(...params) as any[];

  // Gắn số lượng fields vào form list
  const formsWithMeta = forms.map((f: any) => {
    const fieldCount = (db.prepare('SELECT COUNT(*) as c FROM form_fields WHERE form_id = ?').get(f.id) as any).c;
    return { ...f, fieldCount };
  });

  return NextResponse.json({ forms: formsWithMeta });
}

// Tạo Form mới
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền tạo Biểu mẫu.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      collectionId,
      formCode,
      title,
      description,
      inputMethod,
      validationMode,
      employeeCodeField,
      elearningField,
      fields
    } = body;

    if (!collectionId || !formCode || !title) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc (Đợt, Mã form, Tên form).' }, { status: 400 });
    }

    const db = getDatabase();

    const insertFormStmt = db.prepare(`
      INSERT INTO forms (
        collection_id, form_code, title, description, input_method,
        validation_mode, employee_code_field, elearning_field
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertFormStmt.run(
      collectionId,
      formCode.trim().toUpperCase(),
      title.trim(),
      description || '',
      inputMethod || 'EXCEL',
      validationMode || 'FORM_VALIDATION_ONLY',
      employeeCodeField || 'employee_code',
      elearningField || 'elearning_account'
    );

    const newFormId = Number(result.lastInsertRowid);

    // Thêm các fields nếu có
    if (Array.isArray(fields) && fields.length > 0) {
      const insertFieldStmt = db.prepare(`
        INSERT INTO form_fields (
          form_id, field_name, label, field_type, required, default_value,
          options, validation_rules, display_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      fields.forEach((f: any, idx: number) => {
        insertFieldStmt.run(
          newFormId,
          f.fieldName || `field_${idx + 1}`,
          f.label || `Trường ${idx + 1}`,
          f.fieldType || 'TEXT',
          f.required ? 1 : 0,
          f.defaultValue || null,
          f.options ? JSON.stringify(f.options) : null,
          f.validationRules ? JSON.stringify(f.validationRules) : null,
          idx + 1
        );
      });
    }

    logAudit({
      userId: session.id,
      username: session.username,
      action: 'CREATE_FORM',
      details: { formId: newFormId, formCode, title, validationMode },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({ success: true, formId: newFormId });
  } catch (err: any) {
    if (String(err).includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'Mã biểu mẫu đã tồn tại trong đợt thu thập này.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Lỗi tạo biểu mẫu: ' + err.message }, { status: 500 });
  }
}
