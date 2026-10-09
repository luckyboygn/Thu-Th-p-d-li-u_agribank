import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import path from 'path';
import fs from 'fs';

const BACKUP_DIR = path.join(process.cwd(), 'backups');

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên cấp cao mới có quyền tải bản sao lưu.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fileName = searchParams.get('file');

  if (!fileName) {
    return NextResponse.json({ error: 'Vui lòng chỉ định tên file cần tải.' }, { status: 400 });
  }

  // Bảo vệ an ninh ngăn chặn Path Traversal
  const safeFileName = path.basename(fileName);
  if (safeFileName !== fileName || !fileName.endsWith('.sqlite')) {
    return NextResponse.json({ error: 'Tên file không hợp lệ.' }, { status: 400 });
  }

  const filePath = path.join(BACKUP_DIR, safeFileName);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Không tìm thấy file sao lưu trên hệ thống.' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const stats = fs.statSync(filePath);

  logAudit({
    userId: session.id,
    username: session.username,
    unitId: session.unitId,
    action: 'DOWNLOAD_BACKUP',
    details: { fileName: safeFileName, sizeBytes: stats.size },
    ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
  });

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeFileName}"`,
      'Content-Length': String(stats.size),
    },
  });
}
