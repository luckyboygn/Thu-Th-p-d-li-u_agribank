import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền xem Audit Log.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const actionFilter = searchParams.get('action') || 'ALL';
  const entityTypeFilter = searchParams.get('entity_type') || 'ALL';
  const userIdFilter = searchParams.get('user_id') || 'ALL';
  const unitIdFilter = searchParams.get('unit_id') || 'ALL';
  const fromDate = searchParams.get('from_date') || '';
  const toDate = searchParams.get('to_date') || '';

  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;

  const db = getDatabase();

  let whereClauses: string[] = ['1=1'];
  const params: any[] = [];

  if (q.trim()) {
    const term = `%${q.trim()}%`;
    whereClauses.push('(l.username LIKE ? OR l.action LIKE ? OR l.details LIKE ? OR l.entity_id LIKE ? OR u.unit_code LIKE ? OR u.unit_name LIKE ?)');
    params.push(term, term, term, term, term, term);
  }

  if (actionFilter !== 'ALL') {
    whereClauses.push('l.action = ?');
    params.push(actionFilter);
  }

  if (entityTypeFilter !== 'ALL') {
    whereClauses.push('l.entity_type = ?');
    params.push(entityTypeFilter);
  }

  if (userIdFilter !== 'ALL') {
    whereClauses.push('l.user_id = ?');
    params.push(parseInt(userIdFilter));
  }

  if (unitIdFilter !== 'ALL') {
    whereClauses.push('l.unit_id = ?');
    params.push(parseInt(unitIdFilter));
  }

  if (fromDate.trim()) {
    whereClauses.push("date(l.created_at) >= date(?)");
    params.push(fromDate.trim());
  }

  if (toDate.trim()) {
    whereClauses.push("date(l.created_at) <= date(?)");
    params.push(toDate.trim());
  }

  const whereStr = whereClauses.join(' AND ');

  const countQuery = `
    SELECT COUNT(*) as total 
    FROM audit_logs l
    LEFT JOIN units u ON l.unit_id = u.id
    WHERE ${whereStr}
  `;
  const total = (db.prepare(countQuery).get(...params) as any).total;

  const dataQuery = `
    SELECT l.*, u.unit_code, u.unit_name
    FROM audit_logs l
    LEFT JOIN units u ON l.unit_id = u.id
    WHERE ${whereStr}
    ORDER BY l.id DESC
    LIMIT ? OFFSET ?
  `;
  const logs = db.prepare(dataQuery).all(...params, limit, offset);

  // Lấy danh mục distinct actions & entity_types để phục vụ dropdown bộ lọc
  const distinctActions = (db.prepare('SELECT DISTINCT action FROM audit_logs WHERE action IS NOT NULL ORDER BY action ASC').all() as any[])
    .map(r => r.action);

  const distinctEntityTypes = (db.prepare('SELECT DISTINCT entity_type FROM audit_logs WHERE entity_type IS NOT NULL ORDER BY entity_type ASC').all() as any[])
    .map(r => r.entity_type);

  return NextResponse.json({
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    logs,
    availableActions: distinctActions,
    availableEntityTypes: distinctEntityTypes
  });
}
