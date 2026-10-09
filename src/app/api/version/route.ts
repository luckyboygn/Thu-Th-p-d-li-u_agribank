import { NextResponse } from 'next/server';

export async function GET() {
  const buildTime = process.env.NEXT_PUBLIC_APP_BUILD_TIME;
  return NextResponse.json({
    version: '1.0.0',
    buildTime: buildTime || '09/10/2026 15:58',
  });
}
