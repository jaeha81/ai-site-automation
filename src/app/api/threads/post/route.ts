import { NextResponse } from 'next/server'
import { queryOne, execute } from '@/lib/db'
import { postToThreads } from '@/lib/threads'
import type { ThreadsAccount } from '@/lib/db'

// POST /api/threads/post — manual single-post trigger
// Body: { account_id, content, product_id?, affiliate_link? }
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      account_id: string
      content: string
      product_id?: number
      affiliate_link?: string
    }

    if (!body.account_id || !body.content) {
      return NextResponse.json({ error: 'account_id and content required' }, { status: 400 })
    }

    const account = await queryOne<ThreadsAccount>(
      'SELECT * FROM threads_accounts WHERE id = ? AND is_active = 1',
      [body.account_id]
    )

    if (!account) {
      return NextResponse.json({ error: 'Account not found or inactive' }, { status: 404 })
    }

    if (!account.access_token || !account.user_id) {
      return NextResponse.json({ error: 'Account not configured (missing token or user_id)' }, { status: 400 })
    }

    const postDbId = `tp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    await execute(
      `INSERT INTO threads_posts (id, account_id, product_id, affiliate_link, content, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`,
      [postDbId, account.id, body.product_id ?? null, body.affiliate_link ?? null, body.content]
    )

    const threadsPostId = await postToThreads(account.user_id, account.access_token, body.content)

    await execute(
      `UPDATE threads_posts SET threads_post_id = ?, status = 'posted', posted_at = datetime('now') WHERE id = ?`,
      [threadsPostId, postDbId]
    )

    await execute(
      `UPDATE threads_accounts SET daily_post_count = daily_post_count + 1 WHERE id = ?`,
      [account.id]
    )

    return NextResponse.json({ post_id: postDbId, threads_post_id: threadsPostId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
