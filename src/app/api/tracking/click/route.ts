import { NextRequest, NextResponse } from 'next/server'
import { queryOne, execute } from '@/lib/db'
import crypto from 'crypto'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const contentId = parseInt(searchParams.get('c') || '0')
  const productId = parseInt(searchParams.get('p') || '0')

  if (!contentId || !productId) {
    return NextResponse.redirect('https://www.coupang.com')
  }

  const product = await queryOne<{ coupang_url: string | null }>(
    'SELECT coupang_url FROM products WHERE id = ?',
    [productId]
  )

  const affiliateUrl = product?.coupang_url || 'https://www.coupang.com'
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)
  const ua = req.headers.get('user-agent') || ''

  await execute(
    `INSERT INTO click_logs (content_id, product_id, affiliate_url, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [contentId, productId, affiliateUrl, ipHash, ua.slice(0, 200)]
  )

  return NextResponse.redirect(affiliateUrl)
}

export async function POST(req: NextRequest) {
  try {
    const { contentId, productId } = await req.json() as {
      contentId: number
      productId: number
    }

    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)

    await execute(
      `INSERT INTO click_logs (content_id, product_id, ip_hash) VALUES (?, ?, ?)`,
      [contentId, productId, ipHash]
    )

    const row = await queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM click_logs WHERE product_id = ?`,
      [productId]
    )
    const clicks = row?.c ?? 0

    return NextResponse.json({ ok: true, totalClicks: clicks })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
