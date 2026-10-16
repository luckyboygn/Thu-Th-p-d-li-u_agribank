import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, isCentralAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const taskType = searchParams.get('taskType');

  const db = getDatabase();
  let query = `
    SELECT id, code, title, description, status, start_date, end_date, start_at, end_at, created_at, task_type
    FROM exams
  `;
  const params: any[] = [];

  if (taskType === 'CANDIDATE_EXAM') {
    query += ` WHERE (task_type = 'CANDIDATE_EXAM' OR task_type IS NULL) 
                AND LOWER(title) NOT LIKE '%khảo sát%' 
                AND LOWER(title) NOT LIKE '%đào tạo%' 
                AND LOWER(title) NOT LIKE '%nhu cầu%' 
                AND LOWER(code) NOT LIKE 'ks%'`;
  } else if (taskType === 'TRAINING_DEMAND') {
    query += ` WHERE task_type = 'TRAINING_DEMAND' 
                OR LOWER(title) LIKE '%khảo sát%' 
                OR LOWER(title) LIKE '%đào tạo%' 
                OR LOWER(title) LIKE '%nhu cầu%' 
                OR LOWER(code) LIKE 'ks%'`;
  } else if (taskType && taskType !== 'ALL') {
    query += ` WHERE task_type = ?`;
    params.push(taskType);
  }

  query += ` ORDER BY id DESC`;

  const exams = db.prepare(query).all(...params);

  return NextResponse.json({ exams });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' }, { status: 401 });
  }
  if (!isCentralAdmin(session)) {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền tạo đợt thu thập.' }, { status: 403 });
  }

  try {
    const { code, title, description, startDate, endDate, startAt, endAt, taskType } = await req.json();
    if (!code || !title) {
      return NextResponse.json({ error: 'Mã kỳ thi và Tên kỳ thi là bắt buộc.' }, { status: 400 });
    }

    const assignedTaskType = taskType === 'TRAINING_DEMAND' ? 'TRAINING_DEMAND' : 'CANDIDATE_EXAM';
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO exams (code, title, description, status, start_date, end_date, start_at, end_at, task_type)
      VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)
    `).run(
      code.trim().toUpperCase(),
      title.trim(),
      description || '',
      startDate || null,
      endDate || null,
      startAt || null,
      endAt || null,
      assignedTaskType
    );

    // Nếu là đợt Khảo sát nhu cầu đào tạo, tự động đồng bộ sang bảng collections để phân hệ Đào tạo quản lý
    if (assignedTaskType === 'TRAINING_DEMAND') {
      try {
        db.prepare(`
          INSERT OR IGNORE INTO collections (code, title, description, status, start_date, end_date, start_at, end_at, task_type)
          VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, 'TRAINING_DEMAND')
        `).run(
          code.trim().toUpperCase(),
          title.trim(),
          description || '',
          startDate || null,
          endDate || null,
          startAt || null,
          endAt || null
        );
      } catch (colErr) {
        console.error('Error auto-syncing collection:', colErr);
      }
    }

    logAudit({
      userId: session.id,
      username: session.username,
      action: 'CREATE_EXAM',
      entityType: 'EXAM',
      entityId: Number(result.lastInsertRowid),
      details: { examCode: code, title, startAt, endAt },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({ success: true, examId: result.lastInsertRowid });
  } catch (error: any) {
    if (String(error).includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'Mã kỳ thi đã tồn tại trong hệ thống.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Lỗi khi tạo kỳ thi: ' + error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' }, { status: 401 });
  }
  if (!isCentralAdmin(session)) {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền cập nhật đợt thu thập.' }, { status: 403 });
  }

  try {
    const { id, title, description, status, startDate, endDate, startAt, endAt, taskType } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Thiếu id kỳ thi.' }, { status: 400 });
    }

    const db = getDatabase();
    const oldExam = db.prepare('SELECT * FROM exams WHERE id = ?').get(id) as any;
    if (!oldExam) {
      return NextResponse.json({ error: 'Kỳ thi không tồn tại.' }, { status: 404 });
    }

    db.prepare(`
      UPDATE exams
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          status = COALESCE(?, status),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date),
          start_at = COALESCE(?, start_at),
          end_at = COALESCE(?, end_at),
          task_type = COALESCE(?, task_type)
      WHERE id = ?
    `).run(
      title !== undefined ? title : null,
      description !== undefined ? description : null,
      status !== undefined ? status : null,
      startDate !== undefined ? startDate : null,
      endDate !== undefined ? endDate : null,
      startAt !== undefined ? startAt : null,
      endAt !== undefined ? endAt : null,
      taskType !== undefined ? taskType : null,
      id
    );

    if (taskType === 'TRAINING_DEMAND') {
      try {
        db.prepare(`
          INSERT OR IGNORE INTO collections (code, title, description, status, start_date, end_date, start_at, end_at, task_type)
          VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, 'TRAINING_DEMAND')
        `).run(
          oldExam.code,
          title || oldExam.title,
          description || oldExam.description,
          startDate || oldExam.start_date,
          endDate || oldExam.end_date,
          startAt || oldExam.start_at,
          endAt || oldExam.end_at
        );
      } catch (colErr) {
        console.error('Error auto-syncing collection on update:', colErr);
      }
    }

    // Audit UPDATE_DEADLINE nếu startAt hoặc endAt thay đổi
    if ((startAt !== undefined && startAt !== oldExam.start_at) || (endAt !== undefined && endAt !== oldExam.end_at)) {
      logAudit({
        userId: session.id,
        username: session.username,
        action: 'UPDATE_DEADLINE',
        entityType: 'EXAM',
        entityId: id,
        details: {
          targetType: 'EXAM',
          examId: id,
          oldStartAt: oldExam.start_at,
          newStartAt: startAt !== undefined ? startAt : oldExam.start_at,
          oldEndAt: oldExam.end_at,
          newEndAt: endAt !== undefined ? endAt : oldExam.end_at
        },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
      });
    }

    logAudit({
      userId: session.id,
      username: session.username,
      action: 'UPDATE_EXAM',
      entityType: 'EXAM',
      entityId: id,
      details: { examId: id, status, title },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({ success: true, message: 'Đã cập nhật kỳ thi thành công.' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Lỗi khi cập nhật kỳ thi: ' + error.message }, { status: 500 });
  }
}
