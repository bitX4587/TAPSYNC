import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    TAPSYNC_API_URL: process.env['TAPSYNC_API_URL'] || 'NOT SET',
    NEXT_PUBLIC_SITE_URL: process.env['NEXT_PUBLIC_SITE_URL'] || 'NOT SET',
    REVALIDATION_SECRET: process.env['REVALIDATION_SECRET'] ? 'SET' : 'NOT SET',
  });
}
