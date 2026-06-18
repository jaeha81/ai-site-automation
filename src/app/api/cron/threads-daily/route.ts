import { NextResponse } from 'next/server'
import { runThreadsOrchestrator } from '@/lib/agents/threads/threads-orchestrator'

// Cron schedule: KST 10:00 = UTC 01:00, KST 21:00 = UTC 12:00
// vercel.json: "0 1 * * *" and "0 12 * * *"

export const maxDuration = 300 // 5 minutes

export async function POST(req: Request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({})) as { dry_run?: boolean; topic_count?: number }
    const result = await runThreadsOrchestrator({
      topicCount: body.topic_count ?? 3,
      dryRun: body.dry_run ?? false,
    })
    return NextResponse.json({ success: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[threads-daily cron] Error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

// Allow GET for manual browser-based trigger (dev only)
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Use POST in production' }, { status: 405 })
  }
  const result = await runThreadsOrchestrator({ topicCount: 3, dryRun: true })
  return NextResponse.json({ success: true, result })
}
