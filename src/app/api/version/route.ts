import { NextResponse } from 'next/server';

export async function GET() {
  const buildTime = process.env.NEXT_PUBLIC_APP_BUILD_TIME;
  const gitCommit = process.env.NEXT_PUBLIC_GIT_COMMIT;
  return NextResponse.json({
    version: '1.0.0',
    buildTime: buildTime || '16/10/2026 09:49',
    gitCommit: gitCommit || '',
  });
}
