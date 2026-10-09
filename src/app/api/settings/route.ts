import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// GET: Lấy cấu hình hệ thống
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const db = getDatabase();
  const settingsRows = db.prepare('SELECT key, value, description FROM system_settings').all() as any[];
  const settings: Record<string, string> = {};
  settingsRows.forEach(r => {
    settings[r.key] = r.value;
  });

  return NextResponse.json({ settings });
}

// POST: Cập nhật cấu hình hệ thống (Chỉ SUPER_ADMIN)
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền thay đổi cấu hình hệ thống.' }, { status: 403 });
  }

  try {
    const { key, value } = await req.json();
    if (!key) {
      return NextResponse.json({ error: 'Thiếu key cấu hình.' }, { status: 400 });
    }

    const db = getDatabase();
    const oldRow = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as any;
    const oldValue = oldRow?.value || null;

    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, String(value));

    logAudit({
      userId: session.id,
      username: session.username,
      unitId: session.unitId,
      action: 'UPDATE_SYSTEM_SETTING',
      details: { key, oldValue, newValue: String(value) }
    });

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật cấu hình ${key} = ${value}`
    });
  } catch (err: any) {
    console.error('Lỗi cập nhật cấu hình hệ thống:', err);
    return NextResponse.json({ error: 'Lỗi server: ' + err.message }, { status: 500 });
  }
}
