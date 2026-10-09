import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import path from 'path';
import fs from 'fs';
const { createBackup } = require('../../../../scripts/backup_db.js');

const BACKUP_DIR = path.join(process.cwd(), 'backups');

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
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('database_') && f.endsWith('.sqlite'))
      .map(f => {
        const filePath = path.join(BACKUP_DIR, f);
        const stats = fs.statSync(filePath);
        return {
          fileName: f,
          sizeBytes: stats.size,
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
          createdAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
    const backupResult = createBackup();

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
