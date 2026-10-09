import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const db = getDatabase();

  let whereClauses: string[] = [];
  const params: any[] = [];

  if (session.role === 'SUPER_ADMIN') {
    whereClauses.push('(recipient_role = ? OR recipient_user_id = ?)');
    params.push('SUPER_ADMIN', session.id);
  } else {
    // Đơn vị
    if (session.unitId) {
      whereClauses.push(`(
        recipient_user_id = ? OR 
        (recipient_unit_id = ? AND (recipient_role IS NULL OR recipient_role = ?))
      )`);
      params.push(session.id, session.unitId, session.role);
    } else {
      whereClauses.push('(recipient_user_id = ?)');
      params.push(session.id);
    }
  }

  const whereStr = whereClauses.join(' AND ');

  const unreadCountRow = db.prepare(`
    SELECT COUNT(*) as unread 
    FROM notifications 
    WHERE (${whereStr}) AND is_read = 0
  `).get(...params) as any;

  const notifications = db.prepare(`
    SELECT * 
    FROM notifications 
    WHERE ${whereStr} 
    ORDER BY id DESC 
    LIMIT 30
  `).all(...params);

  return NextResponse.json({
    unreadCount: unreadCountRow?.unread || 0,
    notifications
  });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  try {
    const { action, id, markAll } = await req.json();
    const db = getDatabase();

    if (markAll) {
      if (session.role === 'SUPER_ADMIN') {
        db.prepare(`
          UPDATE notifications 
          SET is_read = 1 
          WHERE (recipient_role = 'SUPER_ADMIN' OR recipient_user_id = ?) AND is_read = 0
        `).run(session.id);
      } else if (session.unitId) {
        db.prepare(`
          UPDATE notifications 
          SET is_read = 1 
          WHERE (recipient_user_id = ? OR (recipient_unit_id = ? AND (recipient_role IS NULL OR recipient_role = ?))) AND is_read = 0
        `).run(session.id, session.unitId, session.role);
      }
      return NextResponse.json({ success: true, message: 'Đã đánh dấu tất cả là đã đọc.' });
    }

    if (id) {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Thiếu thông tin đánh dấu đã đọc.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Lỗi cập nhật thông báo: ' + error.message }, { status: 500 });
  }
}
