import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { runIntegrityChecks } from '@/lib/integrity';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    if (session.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Chỉ SUPER_ADMIN mới có quyền kiểm tra tính toàn vẹn CSDL.' },
        { status: 403 }
      );
    }

    const db = getDatabase();
    const report = runIntegrityChecks(db);

    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });
  } catch (err: any) {
    console.error('[Integrity Check API Error]:', err);
    return NextResponse.json(
      { error: err.message || 'Lỗi kiểm tra tính toàn vẹn CSDL.' },
      { status: 500 }
    );
  }
}
