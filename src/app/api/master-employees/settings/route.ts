import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền truy cập.' }, { status: 403 });
  }

  const db = getDatabase();
  const setting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('inactive_employee_severity') as any;

  return NextResponse.json({
    inactive_employee_severity: setting?.value || 'WARNING'
  });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền thay đổi cấu hình.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { severity } = body;

    if (severity !== 'WARNING' && severity !== 'ERROR') {
      return NextResponse.json({ error: 'Mức độ cảnh báo chỉ được là WARNING hoặc ERROR.' }, { status: 400 });
    }

    const db = getDatabase();
    const oldSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('inactive_employee_severity') as any;
    const oldValue = oldSetting?.value || 'WARNING';

    db.prepare(`
      INSERT INTO system_settings (key, value, description)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run('inactive_employee_severity', severity, 'Mức độ cảnh báo khi thí sinh thuộc diện cán bộ ngừng hoạt động (WARNING hoặc ERROR)');

    logAudit({
      userId: session.id,
      username: session.username,
      action: 'UPDATE_SYSTEM_SETTINGS',
      details: {
        settingKey: 'inactive_employee_severity',
        oldValue,
        newValue: severity
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      inactive_employee_severity: severity,
      message: `Đã cập nhật mức độ kiểm tra thí sinh ngừng hoạt động thành ${severity === 'ERROR' ? 'Chặn nộp (ERROR)' : 'Cảnh báo (WARNING)'}.`
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Lỗi cập nhật cấu hình: ' + error.message }, { status: 500 });
  }
}
