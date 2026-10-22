import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createDatabaseBackup, listDatabaseBackups } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 1. GET: Lấy danh sách các bản sao lưu (Chỉ Super Admin)
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên cấp cao mới có quyền truy cập sao lưu.' }, { status: 403 });
  }

  try {
    const files = listDatabaseBackups();
    return NextResponse.json({
      backups: files,
      total: files.length
    });
  } catch (err: any) {
    console.error('Error listing backups:', err);
    return NextResponse.json({ error: 'Lỗi khi tải danh sách bản sao lưu.' }, { status: 500 });
  }
}

// 2. POST: Tạo bản sao lưu tức thì (Chỉ Super Admin)
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên cấp cao mới có quyền tạo bản sao lưu.' }, { status: 403 });
  }

  try {
    const backupResult = createDatabaseBackup();

    logAudit({
      userId: session.id,
      username: session.username,
      unitId: session.unitId,
      action: 'CREATE_BACKUP',
      details: {
        fileName: backupResult.fileName,
        sizeMB: backupResult.sizeMB,
        method: 'VACUUM_INTO'
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      message: 'Tạo bản sao lưu cơ sở dữ liệu thành công!',
      backup: backupResult
    });
  } catch (err: any) {
    console.error('Error creating backup:', err);
    return NextResponse.json({ error: err.message || 'Lỗi khi tạo bản sao lưu.' }, { status: 500 });
  }
}
