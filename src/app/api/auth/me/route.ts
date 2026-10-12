import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, signToken, SESSION_INACTIVITY_TIMEOUT_SECONDS } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    const res = NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    res.cookies.set({
      name: 'auth_token',
      value: '',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      sameSite: 'lax'
    });
    return res;
  }

  // Gia hạn trượt (Sliding session): Kéo dài phiên thêm 15 phút khi người dùng còn đang hoạt động
  const refreshedToken = signToken(session);
  const response = NextResponse.json({ authenticated: true, user: session });
  response.cookies.set({
    name: 'auth_token',
    value: refreshedToken,
    httpOnly: true,
    path: '/',
    maxAge: SESSION_INACTIVITY_TIMEOUT_SECONDS,
    sameSite: 'lax'
  });

  return response;
}
