import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const positionId = searchParams.get('positionId');
  const search = searchParams.get('q') || '';
  const group = searchParams.get('group') || '';
  const includeInactive = searchParams.get('includeInactive') === 'true' && session.role === 'SUPER_ADMIN';

  const db = getDatabase();

  // 1. KIỂM TRA DỮ LIỆU & AUDIT MASTER CATALOG (STAGE 2)
  if (type === 'AUDIT_STATS') {
    if (session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Không có quyền truy cập.' }, { status: 403 });
    }

    const totalPositions = (db.prepare('SELECT COUNT(*) as c FROM training_positions').get() as any).c;
    const activePositions = (db.prepare("SELECT COUNT(*) as c FROM training_positions WHERE status = 'ACTIVE'").get() as any).c;
    const inactivePositions = totalPositions - activePositions;

    const totalTopics = (db.prepare('SELECT COUNT(*) as c FROM training_topics').get() as any).c;
    const activeTopics = (db.prepare("SELECT COUNT(*) as c FROM training_topics WHERE status = 'ACTIVE'").get() as any).c;
    const inactiveTopics = totalTopics - activeTopics;

    const totalRelations = (db.prepare('SELECT COUNT(*) as c FROM training_position_topics').get() as any).c;

    // Vị trí không có chuyên đề
    const positionsWithoutTopics = db.prepare(`
      SELECT p.id, p.code, p.name, p.group_name
      FROM training_positions p
      LEFT JOIN training_position_topics pt ON p.id = pt.position_id
      WHERE pt.id IS NULL
      ORDER BY p.code ASC
    `).all();

    // Chuyên đề xuất hiện ở nhiều vị trí (N-N)
    const multiPositionTopics = db.prepare(`
      SELECT t.id, t.name, t.delivery_method, t.duration, COUNT(pt.position_id) as position_count
      FROM training_topics t
      JOIN training_position_topics pt ON t.id = pt.topic_id
      GROUP BY t.id
      HAVING position_count > 1
      ORDER BY position_count DESC
    `).all();

    // Kiểm tra duplicate (Chuyên đề trùng tên hoặc trùng mã)
    const duplicateTopicNames = db.prepare(`
      SELECT name, COUNT(*) as count
      FROM training_topics
      GROUP BY LOWER(TRIM(name))
      HAVING count > 1
    `).all();

    const duplicatePositionCodes = db.prepare(`
      SELECT code, COUNT(*) as count
      FROM training_positions
      GROUP BY LOWER(TRIM(code))
      HAVING count > 1
    `).all();

    return NextResponse.json({
      summary: {
        totalPositions,
        activePositions,
        inactivePositions,
        totalTopics,
        activeTopics,
        inactiveTopics,
        totalRelations,
        positionsWithoutTopicsCount: positionsWithoutTopics.length,
        multiPositionTopicsCount: multiPositionTopics.length,
        duplicateTopicNamesCount: duplicateTopicNames.length,
        duplicatePositionCodesCount: duplicatePositionCodes.length
      },
      positionsWithoutTopics,
      multiPositionTopics,
      duplicateTopicNames,
      duplicatePositionCodes
    });
  }

  // 2. LẤY TOÀN BỘ DANH SÁCH CHUYÊN ĐỀ (PHỤC VỤ TAB BÁO CÁO THEO CHUYÊN ĐỀ)
  if (type === 'ALL_TOPICS') {
    let query = `
      SELECT t.*,
        (SELECT COUNT(*) FROM training_position_topics WHERE topic_id = t.id) as position_count
      FROM training_topics t
    `;
    if (!includeInactive) {
      query += " WHERE t.status = 'ACTIVE'";
    }
    if (search.trim()) {
      query += includeInactive ? " WHERE" : " AND";
      query += " (t.name LIKE ? OR t.code LIKE ?)";
      const term = `%${search.trim()}%`;
      const topics = db.prepare(query + " ORDER BY t.name ASC").all(term, term);
      return NextResponse.json({ total: topics.length, topics });
    }
    const topics = db.prepare(query + " ORDER BY t.name ASC").all();
    return NextResponse.json({ total: topics.length, topics });
  }

  // 3. NẾU YÊU CẦU LẤY DANH SÁCH CHUYÊN ĐỀ THEO VỊ TRÍ
  if (positionId) {
    const posId = parseInt(positionId);
    const position = db.prepare('SELECT * FROM training_positions WHERE id = ?').get(posId) as any;
    if (!position) {
      return NextResponse.json({ error: 'Không tìm thấy vị trí chức danh.' }, { status: 404 });
    }

    let query = `
      SELECT t.id, t.code, t.name, t.delivery_method, t.duration, t.learning_path,
             t.competency, t.prerequisite, t.certificate_requirement, t.status, pt.display_order
      FROM training_position_topics pt
      JOIN training_topics t ON pt.topic_id = t.id
      WHERE pt.position_id = ?
    `;
    if (!includeInactive) {
      query += " AND t.status = 'ACTIVE'";
    }

    const params: any[] = [posId];

    if (search.trim()) {
      query += ' AND (t.name LIKE ? OR t.competency LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    query += ' ORDER BY pt.display_order ASC, t.id ASC';

    const topics = db.prepare(query).all(...params);

    return NextResponse.json({
      position,
      totalTopics: topics.length,
      topics
    });
  }

  // 4. LẤY DANH SÁCH TẤT CẢ VỊ TRÍ (HỖ TRỢ TÌM KIẾM, PHÂN NHÓM)
  let query = `
    SELECT p.*,
      (SELECT COUNT(*) FROM training_position_topics WHERE position_id = p.id) as topic_count
    FROM training_positions p
  `;
  const params: any[] = [];
  const whereClauses: string[] = [];

  if (!includeInactive) {
    whereClauses.push("p.status = 'ACTIVE'");
  }

  if (search.trim()) {
    whereClauses.push("(p.code LIKE ? OR p.name LIKE ?)");
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  if (group.trim()) {
    whereClauses.push("p.group_name = ?");
    params.push(group.trim());
  }

  if (whereClauses.length > 0) {
    query += " WHERE " + whereClauses.join(" AND ");
  }

  query += ' ORDER BY p.group_name ASC, p.code ASC';

  const positions = db.prepare(query).all(...params);

  // Thống kê phân nhóm
  const groups = db.prepare(`
    SELECT DISTINCT group_name, COUNT(*) as count 
    FROM training_positions 
    WHERE status = 'ACTIVE' 
    GROUP BY group_name
  `).all();

  return NextResponse.json({
    total: positions.length,
    groups,
    positions
  });
}

// POST: QUẢN TRỊ DANH MỤC MASTER (STAGE 2)
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Yêu cầu quyền Quản trị viên cấp cao.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;
    const db = getDatabase();

    // 1. BẬT/TẮT TRẠNG THÁI ACTIVE / INACTIVE CỦA VỊ TRÍ HOẶC CHUYÊN ĐỀ
    if (action === 'TOGGLE_STATUS') {
      const { entity, id } = body; // entity: 'POSITION' | 'TOPIC'
      if (!id || !['POSITION', 'TOPIC'].includes(entity)) {
        return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
      }

      const table = entity === 'POSITION' ? 'training_positions' : 'training_topics';
      const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as any;
      if (!item) return NextResponse.json({ error: 'Không tìm thấy bản ghi.' }, { status: 404 });

      const newStatus = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      db.prepare(`UPDATE ${table} SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newStatus, id);

      logAudit({
        userId: session.id,
        username: session.username,
        action: `TOGGLE_${entity}_STATUS`,
        details: { entity, id, oldStatus: item.status, newStatus, name: item.name }
      });

      return NextResponse.json({
        success: true,
        message: `Đã chuyển trạng thái sang ${newStatus}.`,
        newStatus
      });
    }

    // 2. CẬP NHẬT THÔNG TIN CHUYÊN ĐỀ
    if (action === 'UPDATE_TOPIC') {
      const { id, name, deliveryMethod, duration, competency } = body;
      if (!id || !name?.trim()) {
        return NextResponse.json({ error: 'Tên chuyên đề không được để trống.' }, { status: 400 });
      }

      db.prepare(`
        UPDATE training_topics
        SET name = ?, delivery_method = ?, duration = ?, competency = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name.trim(), deliveryMethod || 'Trực tiếp', duration || '02 ngày', competency || '', id);

      logAudit({
        userId: session.id,
        username: session.username,
        action: 'UPDATE_TRAINING_TOPIC',
        details: { id, name }
      });

      return NextResponse.json({ success: true, message: 'Cập nhật chuyên đề thành công!' });
    }

    return NextResponse.json({ error: 'Hành động không được hỗ trợ.' }, { status: 400 });
  } catch (err: any) {
    console.error('Lỗi quản trị danh mục:', err);
    return NextResponse.json({ error: err.message || 'Lỗi xử lý hệ thống.' }, { status: 500 });
  }
}
