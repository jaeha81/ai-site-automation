import { NextResponse } from 'next/server'
import { query, execute, queryOne } from '@/lib/db'
import { getThreadsUser, refreshLongLivedToken } from '@/lib/threads'
import type { ThreadsAccount } from '@/lib/db'

// GET /api/threads/accounts — list all registered accounts
export async function GET() {
  try {
    const accounts = await query<ThreadsAccount>(
      'SELECT * FROM threads_accounts ORDER BY is_active DESC, created_at DESC'
    )
    return NextResponse.json({ accounts })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/threads/accounts — register or update an account
// Body: { username, access_token }
export async function POST(req: Request) {
  try {
    const body = await req.json() as { username?: string; access_token?: string; id?: string }

    if (!body.access_token) {
      return NextResponse.json({ error: 'access_token required' }, { status: 400 })
    }

    // Validate token & get user info from Threads API
    const user = await getThreadsUser(body.access_token)

    const id = body.id ?? `th_${user.id}`
    const now = Math.floor(Date.now() / 1000)
    // Long-lived tokens last 60 days (5_184_000 seconds)
    const expiresAt = now + 5_184_000

    const existing = await queryOne<ThreadsAccount>(
      'SELECT id FROM threads_accounts WHERE id = ?',
      [id]
    )

    if (existing) {
      await execute(
        `UPDATE threads_accounts
         SET username = ?, access_token = ?, user_id = ?, token_expires_at = ?, is_active = 1
         WHERE id = ?`,
        [user.username, body.access_token, user.id, expiresAt, id]
      )
    } else {
      await execute(
        `INSERT INTO threads_accounts (id, username, access_token, user_id, token_expires_at, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [id, user.username, body.access_token, user.id, expiresAt]
      )
    }

    return NextResponse.json({ id, username: user.username, user_id: user.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH /api/threads/accounts — refresh tokens for all active accounts
export async function PATCH() {
  try {
    const accounts = await query<ThreadsAccount>(
      'SELECT * FROM threads_accounts WHERE is_active = 1 AND access_token IS NOT NULL'
    )

    const results: Array<{ id: string; username: string; success: boolean; error?: string }> = []

    for (const account of accounts) {
      try {
        const refreshed = await refreshLongLivedToken(account.access_token!)
        const expiresAt = Math.floor(Date.now() / 1000) + refreshed.expires_in
        await execute(
          'UPDATE threads_accounts SET access_token = ?, token_expires_at = ? WHERE id = ?',
          [refreshed.access_token, expiresAt, account.id]
        )
        results.push({ id: account.id, username: account.username, success: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ id: account.id, username: account.username, success: false, error: msg })
      }
    }

    return NextResponse.json({ results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
