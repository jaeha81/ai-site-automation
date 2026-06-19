import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import type { IncomeTracker } from '@/lib/db'

const TAX_WITHHOLDING_RATE = 0.033  // 쿠팡 파트너스 원천징수율 3.3%
const BUSINESS_REGISTRATION_THRESHOLD = 10_000_000  // 사업자등록 권장 기준 (연 1,000만원)

// GET /api/revenue/tax-summary — 연간 세금 현황
export async function GET() {
  try {
    const now = new Date()
    const currentYear = now.getFullYear()

    const yearData = await queryOne<IncomeTracker>(
      'SELECT * FROM income_tracker WHERE year = ?',
      [currentYear]
    )

    // threads_posts 기반 예상 수익 (아직 정산 전)
    const pendingData = await queryOne<{ pending_revenue: number }>(
      `SELECT COALESCE(SUM(revenue), 0) as pending_revenue
       FROM threads_posts
       WHERE status = 'posted'
         AND created_at >= datetime('now', 'start of year')`
    )

    const confirmedGross = yearData?.gross_income ?? 0
    const confirmedTax = yearData?.tax_withheld ?? 0
    const confirmedNet = yearData?.net_income ?? 0
    const pendingRevenue = Math.round(pendingData?.pending_revenue ?? 0)
    const estimatedAnnualGross = confirmedGross + pendingRevenue

    // 세금 신고 가이드
    const filingDeadline = `${currentYear + 1}-05-31`
    const needsBusinessReg = estimatedAnnualGross >= BUSINESS_REGISTRATION_THRESHOLD

    // 최근 3개년 내역
    const history = await query<IncomeTracker>(
      'SELECT * FROM income_tracker ORDER BY year DESC LIMIT 3'
    )

    return NextResponse.json({
      current_year: currentYear,
      confirmed: {
        gross_income: confirmedGross,
        tax_withheld: confirmedTax,
        net_income: confirmedNet,
      },
      pending_revenue: pendingRevenue,
      estimated_annual_gross: estimatedAnnualGross,
      tax_info: {
        withholding_rate: TAX_WITHHOLDING_RATE,
        estimated_total_tax: Math.round(estimatedAnnualGross * TAX_WITHHOLDING_RATE),
        filing_deadline: filingDeadline,
        needs_business_registration: needsBusinessReg,
        business_reg_threshold: BUSINESS_REGISTRATION_THRESHOLD,
      },
      guide: {
        income_type: '사업소득 (쿠팡 파트너스)',
        withholding: '쿠팡이 지급 시 3.3% 원천징수 후 입금',
        filing: '매년 5월 종합소득세 신고 (홈택스)',
        minimum_payout: '월 수수료 10,000원 이상 시 익월 말 정산',
        business_reg_benefit: '사업자등록 시 관련 비용 경비처리 가능 (인터넷, 장비 등)',
      },
      history,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
