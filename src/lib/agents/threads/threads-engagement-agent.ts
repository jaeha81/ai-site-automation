import { query, execute } from '@/lib/db'
import { getPostInsights } from '@/lib/threads'
import { sendDiscordWebhook } from '@/lib/discord'
import type { ThreadsAccount, ThreadsPost } from '@/lib/db'
import type { PostResult } from './threads-post-agent'

export interface EngagementReport {
  total_posts: number
  successful_posts: number
  total_views: number
  total_likes: number
  estimated_clicks: number
  estimated_revenue: number
  top_performing_post?: string
}

async function collectInsights(
  posts: PostResult[],
  accounts: ThreadsAccount[]
): Promise<EngagementReport> {
  const accountMap = new Map(accounts.map(a => [a.username, a]))
  let totalViews = 0
  let totalLikes = 0
  let topPostId: string | undefined
  let topViews = 0

  for (const post of posts) {
    if (!post.success || !post.threads_post_id) continue

    const account = accountMap.get(post.account)
    if (!account?.access_token) continue

    try {
      const insights = await getPostInsights(post.threads_post_id, account.access_token)
      totalViews += insights.views
      totalLikes += insights.likes

      if (insights.views > topViews) {
        topViews = insights.views
        topPostId = post.threads_post_id
      }

      // Update DB with latest click/engagement data
      await execute(
        `UPDATE threads_posts SET clicks = ? WHERE threads_post_id = ?`,
        [insights.views, post.threads_post_id]
      )
    } catch {
      // Insights may not be available immediately, skip
    }
  }

  // Estimate revenue: ~1% CTR on views, ~3% commission on avg 20,000 KRW product
  const estimatedClicks = Math.floor(totalViews * 0.01)
  const estimatedRevenue = Math.floor(estimatedClicks * 20000 * 0.03)

  return {
    total_posts: posts.length,
    successful_posts: posts.filter(p => p.success).length,
    total_views: totalViews,
    total_likes: totalLikes,
    estimated_clicks: estimatedClicks,
    estimated_revenue: estimatedRevenue,
    top_performing_post: topPostId,
  }
}

function formatRevenueReport(report: EngagementReport): string {
  return [
    '🧵 **Threads 수익화 리포트**',
    '',
    `📊 게시 현황: ${report.successful_posts}/${report.total_posts} 성공`,
    `👁️ 총 조회수: ${report.total_views.toLocaleString()}`,
    `❤️ 총 좋아요: ${report.total_likes.toLocaleString()}`,
    `🖱️ 예상 클릭: ${report.estimated_clicks.toLocaleString()}`,
    `💰 예상 수익: ₩${report.estimated_revenue.toLocaleString()}`,
    report.top_performing_post ? `🏆 최고 게시물: ${report.top_performing_post}` : '',
  ].filter(Boolean).join('\n')
}

export async function runThreadsEngagementAgent(
  postResults: PostResult[]
): Promise<EngagementReport> {
  await execute(
    `UPDATE agent_states SET status = 'running', current_task = '인사이트 수집 중', last_run_at = datetime('now') WHERE agent_name = 'threads_engagement_agent'`
  )

  const accounts = await query<ThreadsAccount>(
    'SELECT * FROM threads_accounts WHERE is_active = 1'
  )

  const report = await collectInsights(postResults, accounts)

  // Send Discord notification
  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL
    if (webhookUrl) await sendDiscordWebhook(webhookUrl, formatRevenueReport(report))
  } catch {
    // Discord notification failure is non-critical
  }

  await execute(
    `UPDATE agent_states
     SET status = 'idle', last_result = ?, total_runs = total_runs + 1, success_runs = success_runs + 1
     WHERE agent_name = 'threads_engagement_agent'`,
    [JSON.stringify(report)]
  )

  return report
}

// Sync revenue data from DB posts (run separately / on-demand)
export async function syncRevenueFromPosts(): Promise<void> {
  const posts = await query<ThreadsPost & { account_token: string }>(
    `SELECT tp.*, ta.access_token as account_token
     FROM threads_posts tp
     JOIN threads_accounts ta ON ta.id = tp.account_id
     WHERE tp.status = 'posted' AND tp.threads_post_id IS NOT NULL
     AND tp.posted_at > datetime('now', '-7 days')`
  )

  for (const post of posts) {
    if (!post.account_token || !post.threads_post_id) continue
    try {
      const insights = await getPostInsights(post.threads_post_id, post.account_token)
      const estimatedRevenue = Math.floor(insights.views * 0.01 * 20000 * 0.03)
      await execute(
        'UPDATE threads_posts SET clicks = ?, revenue = ? WHERE id = ?',
        [insights.views, estimatedRevenue, post.id]
      )
    } catch {
      continue
    }
  }
}
