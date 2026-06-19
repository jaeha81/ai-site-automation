import { NextResponse } from 'next/server'
import { query, execute } from '@/lib/db'
import type { PayoutRecord, BankAccount } from '@/lib/db'

// GET /api/revenue/payout — 정산 내역 조회
export async function GET() {
  try {
    const records = await query<PayoutRecord & { bank_name: string; account_number_masked: string }>(
      `SELECT pr.*, ba.bank_name, ba.account_number_masked
       FROM payout_records pr
       LEFT JOIN bank_accounts ba ON ba.id = pr.bank_account_id
       ORDER BY pr.payout_date DESC
       LIMIT 24`
    )

    const totalGross = records.reduce((s, r) => s + r.gross_amount, 0)
    const totalTax = records.reduce((s, r) => s + r.tax_withheld, 0)
    const totalNet = records.reduce((s, r) => s + r.net_amount, 0)
    const received = records.filter(r => r.status === 'received')
    const expected = records.filter(r => r.status === 'expected')

    return NextResponse.json({
      records,
      summary: {
        total_gross: totalGross,
        total_tax_withheld: totalTax,
        total_net: totalNet,
        received_count: received.length,
        expected_count: expected.length,
        next_payout_expected: expected[0] ?? null,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/revenue/payout — 정산 기록 추가 (수동 입력)
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      payout_date: string
      gross_amount: number
      platform?: string
      bank_account_id?: number
      memo?: string
    }

    const { payout_date, gross_amount, platform = 'coupang_partners', bank_account_id, memo } = body
    const tax = Math.round(gross_amount * 0.033)
    const net = gross_amount - tax

    const result = await execute(
      `INSERT INTO payout_records (payout_date, gross_amount, tax_withheld, net_amount, platform, bank_account_id, status, memo)
       VALUES (?, ?, ?, ?, ?, ?, 'received', ?)`,
      [payout_date, gross_amount, tax, net, platform, bank_account_id ?? null, memo ?? null]
    )

    // 연간 소득 집계 업데이트
    const year = new Date(payout_date).getFullYear()
    await execute(
      `INSERT INTO income_tracker (year, gross_income, tax_withheld, net_income, last_updated)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(year) DO UPDATE SET
         gross_income = gross_income + excluded.gross_income,
         tax_withheld = tax_withheld + excluded.tax_withheld,
         net_income = net_income + excluded.net_income,
         last_updated = datetime('now')`,
      [year, gross_amount, tax, net]
    )

    return NextResponse.json({ id: result.lastInsertRowid, tax_withheld: tax, net_amount: net })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
