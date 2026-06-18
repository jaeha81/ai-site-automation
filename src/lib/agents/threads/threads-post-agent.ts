import { query, execute } from '@/lib/db'
import { postToThreads } from '@/lib/threads'
import type { ThreadsAccount } from '@/lib/db'
import type { ThreadsPostContent } from './threads-content-agent'

const MAX_DAILY_POSTS_PER_ACCOUNT = 10
const MIN_DELAY_MS = 5 * 60 * 1000   // 5 minutes
const MAX_DELAY_MS = 15 * 60 * 1000  // 15 minutes

function randomDelay(): Promise<void> {
  const ms = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
  return new Promise(r => setTimeout(r, ms))
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

async function resetDailyCountIfNeeded(account: ThreadsAccount): Promise<void> {
  const today = todayDateString()
  if (account.last_reset_date !== today) {
    await execute(
      'UPDATE threads_accounts SET daily_post_count = 0, daily_comment_count = 0, last_reset_date = ? WHERE id = ?',
      [today, account.id]
    )
  }
}

async function postWithRetry(
  account: ThreadsAccount,
  content: string,
  maxRetries = 3
): Promise<string | null> {
  let delay = 5000
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const postId = await postToThreads(account.user_id!, account.access_token!, content)
      return postId
    } catch (err) {
      if (attempt === maxRetries - 1) {
        console.error(`[ThreadsPost] Failed after ${maxRetries} retries for @${account.username}:`, err)
        return null
      }
      await new Promise(r => setTimeout(r, delay))
      delay *= 2 // exponential backoff
    }
  }
  return null
}

export interface PostResult {
  post_id: string
  account: string
  threads_post_id: string | null
  success: boolean
  error?: string
}

export async function runThreadsPostAgent(
  posts: ThreadsPostContent[]
): Promise<PostResult[]> {
  const today = todayDateString()

  // Get active accounts with quota remaining
  const accounts = await query<ThreadsAccount>(
    `SELECT * FROM threads_accounts
     WHERE is_active = 1 AND access_token IS NOT NULL AND user_id IS NOT NULL
     ORDER BY daily_post_count ASC`
  )

  if (accounts.length === 0) {
    console.warn('[ThreadsPost] No active accounts with tokens configured')
    return []
  }

  // Reset daily counts if new day
  for (const account of accounts) {
    await resetDailyCountIfNeeded(account)
  }

  // Re-fetch updated counts
  const activeAccounts = await query<ThreadsAccount>(
    `SELECT * FROM threads_accounts
     WHERE is_active = 1 AND access_token IS NOT NULL AND user_id IS NOT NULL
     AND daily_post_count < ?
     ORDER BY daily_post_count ASC`,
    [MAX_DAILY_POSTS_PER_ACCOUNT]
  )

  const results: PostResult[] = []
  let accountIdx = 0

  for (const postContent of posts) {
    if (accountIdx >= activeAccounts.length) break

    const account = activeAccounts[accountIdx]

    // Create DB record before posting
    const postDbId = `tp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await execute(
      `INSERT INTO threads_posts (id, account_id, product_id, affiliate_link, content, category, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
      [
        postDbId,
        account.id,
        postContent.product.productId,
        postContent.product.affiliateLink,
        postContent.full_text,
        postContent.product.category,
      ]
    )

    await execute(
      `UPDATE agent_states SET status = 'running', current_task = ?, last_run_at = datetime('now') WHERE agent_name = 'threads_post_agent'`,
      [`@${account.username}에 게시 중`]
    )

    const threadsPostId = await postWithRetry(account, postContent.full_text)

    if (threadsPostId) {
      await execute(
        `UPDATE threads_posts SET threads_post_id = ?, status = 'posted', posted_at = datetime('now') WHERE id = ?`,
        [threadsPostId, postDbId]
      )
      await execute(
        `UPDATE threads_accounts SET daily_post_count = daily_post_count + 1 WHERE id = ?`,
        [account.id]
      )
      results.push({ post_id: postDbId, account: account.username, threads_post_id: threadsPostId, success: true })
    } else {
      await execute(
        `UPDATE threads_posts SET status = 'failed' WHERE id = ?`,
        [postDbId]
      )
      results.push({ post_id: postDbId, account: account.username, threads_post_id: null, success: false, error: 'Max retries exceeded' })
    }

    accountIdx++

    // Randomized delay between posts to avoid detection
    if (accountIdx < posts.length && accountIdx < activeAccounts.length) {
      await randomDelay()
    }
  }

  await execute(
    `UPDATE agent_states SET status = 'idle', total_runs = total_runs + 1, success_runs = success_runs + ? WHERE agent_name = 'threads_post_agent'`,
    [results.filter(r => r.success).length]
  )

  void today // suppress unused warning

  return results
}
