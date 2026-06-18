import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import type { ThreadsPost } from '@/lib/db'

interface RevenueRow extends ThreadsPost {
  username: string
}

// GET /api/threads/revenue — Threads revenue dashboard data
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') ?? '7', 10)

    const posts = await query<RevenueRow>(
      `SELECT tp.*, ta.username
       FROM threads_posts tp
       LEFT JOIN threads_accounts ta ON ta.id = tp.account_id
       WHERE tp.created_at > datetime('now', '-' || ? || ' days')
       ORDER BY tp.created_at DESC`,
      [days]
    )

    const totalRevenue = posts.reduce((sum, p) => sum + (p.revenue ?? 0), 0)
    const totalClicks = posts.reduce((sum, p) => sum + (p.clicks ?? 0), 0)
    const successPosts = posts.filter(p => p.status === 'posted').length

    // Group by account
    const byAccount = posts.reduce<Record<string, { posts: number; clicks: number; revenue: number }>>(
      (acc, post) => {
        const key = post.username ?? post.account_id
        if (!acc[key]) acc[key] = { posts: 0, clicks: 0, revenue: 0 }
        acc[key].posts++
        acc[key].clicks += post.clicks ?? 0
        acc[key].revenue += post.revenue ?? 0
        return acc
      },
      {}
    )

    // Group by category
    const byCategory = posts.reduce<Record<string, { posts: number; revenue: number }>>(
      (acc, post) => {
        const key = post.category ?? 'unknown'
        if (!acc[key]) acc[key] = { posts: 0, revenue: 0 }
        acc[key].posts++
        acc[key].revenue += post.revenue ?? 0
        return acc
      },
      {}
    )

    return NextResponse.json({
      period_days: days,
      total_posts: posts.length,
      successful_posts: successPosts,
      total_clicks: totalClicks,
      total_revenue: totalRevenue,
      by_account: byAccount,
      by_category: byCategory,
      recent_posts: posts.slice(0, 20),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
