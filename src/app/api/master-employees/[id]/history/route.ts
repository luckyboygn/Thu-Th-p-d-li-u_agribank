import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền xem lịch sử.' }, { status: 403 });
  }

  const { id } = await params;
  const db = getDatabase();

  // Tìm employee
  const employee = db.prepare('SELECT id, employee_code, full_name, elearning_account, unit_code, unit_name, status FROM employees WHERE id = ?').get(id) as any;

  if (!employee) {
    return NextResponse.json({ error: 'Không tìm thấy thông tin cán bộ.' }, { status: 404 });
  }

  // Lấy lịch sử từ employee_history
  const history = db.prepare(`
    SELECT 
      eh.id,
      eh.action_type,
      eh.old_values,
      eh.new_values,
      eh.created_at,
      u.full_name as changed_by_name,
      u.username as changed_by_username
    FROM employee_history eh
    LEFT JOIN users u ON eh.changed_by = u.id
    WHERE eh.employee_id = ? OR eh.employee_code = ?
    ORDER BY eh.id DESC
  `).all(employee.id, employee.employee_code);

  return NextResponse.json({
    employee,
    history
  });
}
