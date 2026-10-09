import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

// GET: Lấy danh sách Khung Chương trình đào tạo & chuyên đề
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const programIdStr = searchParams.get('programId');
  const groupName = searchParams.get('group');
  const query = searchParams.get('q');

  const db = getDatabase();

  const categoryTypeParam = searchParams.get('categoryType'); // 'TRONG_KHUNG' | 'NGOAI_KHUNG' | 'ALL'

  // 1. Nếu yêu cầu chi tiết 1 chương trình -> trả về chương trình + danh sách chuyên đề
  if (programIdStr) {
    const progId = parseInt(programIdStr);
    const program = db.prepare(`
      SELECT id, code, name, group_name, category_type, display_order, status
      FROM training_programs
      WHERE id = ?
    `).get(progId) as any;

    if (!program) {
      return NextResponse.json({ error: 'Không tìm thấy khung chương trình đào tạo.' }, { status: 404 });
    }

    const topics = db.prepare(`
      SELECT id, program_id, topic_name, target_audience, delivery_method, duration, display_order
      FROM training_program_topics
      WHERE program_id = ?
      ORDER BY display_order ASC, id ASC
    `).all(progId);

    return NextResponse.json({
      program,
      topics
    });
  }

  // 2. Lấy danh sách tất cả các chương trình (hỗ trợ lọc group, category_type hoặc tìm kiếm từ khóa)
  let sql = `
    SELECT p.id, p.code, p.name, p.group_name, COALESCE(p.category_type, 'TRONG_KHUNG') as category_type, p.display_order, p.status,
           COUNT(t.id) as topic_count
    FROM training_programs p
    LEFT JOIN training_program_topics t ON p.id = t.program_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (categoryTypeParam && categoryTypeParam !== 'ALL') {
    sql += ` AND p.category_type = ?`;
    params.push(categoryTypeParam);
  }

  if (groupName) {
    sql += ` AND p.group_name LIKE ?`;
    params.push(`%${groupName}%`);
  }

  if (query) {
    sql += ` AND (p.name LIKE ? OR p.code LIKE ?)`;
    params.push(`%${query}%`, `%${query}%`);
  }

  sql += ` GROUP BY p.id ORDER BY p.display_order ASC, p.id ASC`;

  const programs = db.prepare(sql).all(...params);

  // Lấy danh mục các Nhóm lớn
  const groups = db.prepare(`
    SELECT group_name, COALESCE(category_type, 'TRONG_KHUNG') as category_type, COUNT(*) as program_count
    FROM training_programs
    GROUP BY group_name, category_type
    ORDER BY MIN(display_order) ASC
  `).all();

  return NextResponse.json({
    groups,
    programs
  });
}
