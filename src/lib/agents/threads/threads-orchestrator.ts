import { runContentDiscoveryAgent } from './content-discovery-agent'
import { runProductMatchAgent } from './product-match-agent'
import { runThreadsContentAgent } from './threads-content-agent'
import { runThreadsPostAgent } from './threads-post-agent'
import { runThreadsEngagementAgent } from './threads-engagement-agent'
import { execute, query } from '@/lib/db'
import type { ThreadsAccount } from '@/lib/db'
import type { EngagementReport } from './threads-engagement-agent'

export interface OrchestratorResult {
  topics_found: number
  products_matched: number
  posts_generated: number
  posts_published: number
  engagement: EngagementReport
  error?: string
}

export async function runThreadsOrchestrator(options: {
  topicCount?: number
  dryRun?: boolean
} = {}): Promise<OrchestratorResult> {
  const { topicCount = 3, dryRun = false } = options

  console.log('[ThreadsOrchestrator] Starting cycle...')

  // Check how many active accounts are available
  const accounts = await query<ThreadsAccount>(
    'SELECT * FROM threads_accounts WHERE is_active = 1 AND access_token IS NOT NULL'
  )
  const accountCount = accounts.length || 1

  // Step 1: Discover content topics
  console.log('[ThreadsOrchestrator] Step 1: Content discovery')
  const topics = await runContentDiscoveryAgent(topicCount)
  console.log(`[ThreadsOrchestrator] Found ${topics.length} topics`)

  if (topics.length === 0) {
    return {
      topics_found: 0,
      products_matched: 0,
      posts_generated: 0,
      posts_published: 0,
      engagement: { total_posts: 0, successful_posts: 0, total_views: 0, total_likes: 0, estimated_clicks: 0, estimated_revenue: 0 },
      error: 'No topics discovered',
    }
  }

  // Step 2: Match Coupang products
  console.log('[ThreadsOrchestrator] Step 2: Product matching')
  const products = await runProductMatchAgent(topics)
  console.log(`[ThreadsOrchestrator] Matched ${products.length} products`)

  if (products.length === 0) {
    return {
      topics_found: topics.length,
      products_matched: 0,
      posts_generated: 0,
      posts_published: 0,
      engagement: { total_posts: 0, successful_posts: 0, total_views: 0, total_likes: 0, estimated_clicks: 0, estimated_revenue: 0 },
      error: 'No products matched',
    }
  }

  // Step 3: Generate post content
  console.log('[ThreadsOrchestrator] Step 3: Content generation')
  const posts = await runThreadsContentAgent(products, accountCount)
  console.log(`[ThreadsOrchestrator] Generated ${posts.length} posts`)

  if (dryRun) {
    return {
      topics_found: topics.length,
      products_matched: products.length,
      posts_generated: posts.length,
      posts_published: 0,
      engagement: { total_posts: posts.length, successful_posts: 0, total_views: 0, total_likes: 0, estimated_clicks: 0, estimated_revenue: 0 },
    }
  }

  // Step 4: Publish to Threads accounts
  console.log('[ThreadsOrchestrator] Step 4: Publishing posts')
  const postResults = await runThreadsPostAgent(posts)
  const published = postResults.filter(r => r.success).length
  console.log(`[ThreadsOrchestrator] Published ${published}/${postResults.length}`)

  // Step 5: Collect engagement + send Discord report
  console.log('[ThreadsOrchestrator] Step 5: Engagement tracking')
  const engagement = await runThreadsEngagementAgent(postResults)

  // Log automation run
  await execute(
    `INSERT INTO automation_runs (run_type, status, products_found, content_generated, posts_published, finished_at)
     VALUES ('threads_daily', 'completed', ?, ?, ?, datetime('now'))`,
    [products.length, posts.length, published]
  )

  console.log('[ThreadsOrchestrator] Cycle complete')

  return {
    topics_found: topics.length,
    products_matched: products.length,
    posts_generated: posts.length,
    posts_published: published,
    engagement,
  }
}
