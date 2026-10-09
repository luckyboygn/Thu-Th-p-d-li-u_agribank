import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (session) {
    logAudit({
      userId: session.id,
      username: session.username,
      unitId: session.unitId,
      action: 'LOGOUT',
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });
  }

  const response = NextResponse.json({ success: true, message: 'Đăng xuất thành công.' });
  response.cookies.delete('auth_token');
  return response;
}
