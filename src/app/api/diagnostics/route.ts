import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    mock_mode: process.env.USE_MOCK_DATA === 'true',
    environment: process.env.NODE_ENV,
    turso_configured: !!process.env.TURSO_DATABASE_URL,
    gemini_configured: !!process.env.GEMINI_API_KEY,
    coupang_configured: !!process.env.COUPANG_ACCESS_KEY,
    threads_configured: !!process.env.THREADS_APP_SECRET,
  })
}
