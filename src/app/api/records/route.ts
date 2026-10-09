import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const uploadId = searchParams.get('uploadId');
  if (!uploadId) {
    return NextResponse.json({ error: 'Thiếu uploadId.' }, { status: 400 });
  }

  const status = searchParams.get('status') || 'ALL'; // 'ALL' | 'VALID' | 'INVALID'
  const search = searchParams.get('q') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;

  const db = getDatabase();

  // Kiểm tra quyền truy cập upload
  const upload = db.prepare(`
    SELECT u.*, un.unit_code, un.unit_name
    FROM exam_uploads u
    JOIN units un ON u.unit_id = un.id
    WHERE u.id = ?
  `).get(uploadId) as any;

  if (!upload) {
    return NextResponse.json({ error: 'Không tìm thấy thông tin upload.' }, { status: 404 });
  }

  // Unit Admin chỉ được xem upload của đơn vị mình
  if (session.role === 'UNIT_ADMIN' && upload.unit_id !== session.unitId) {
    return NextResponse.json({ error: 'Bạn không có quyền xem dữ liệu của đơn vị khác.' }, { status: 403 });
  }

  let countQuery = 'SELECT COUNT(*) as total FROM exam_records WHERE upload_id = ?';
  let dataQuery = 'SELECT * FROM exam_records WHERE upload_id = ?';
  const params: any[] = [uploadId];

  if (status !== 'ALL') {
    countQuery += ' AND validation_status = ?';
    dataQuery += ' AND validation_status = ?';
    params.push(status);
  }

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    countQuery += ' AND (employee_code LIKE ? OR elearning_account LIKE ? OR full_name LIKE ?)';
    dataQuery += ' AND (employee_code LIKE ? OR elearning_account LIKE ? OR full_name LIKE ?)';
    params.push(term, term, term);
  }

  dataQuery += ' ORDER BY row_index ASC LIMIT ? OFFSET ?';

  const total = (db.prepare(countQuery).get(...params) as any).total;
  const records = db.prepare(dataQuery).all(...params, limit, offset);

  // Parse raw_data JSON
  const formattedRecords = records.map((r: any) => ({
    ...r,
    rawData: r.raw_data ? JSON.parse(r.raw_data) : {}
  }));

  return NextResponse.json({
    upload,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    records: formattedRecords
  });
}
