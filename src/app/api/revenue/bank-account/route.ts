import { NextResponse } from 'next/server'
import { query, execute } from '@/lib/db'
import type { BankAccount } from '@/lib/db'

// GET /api/revenue/bank-account — 등록 계좌 조회
export async function GET() {
  try {
    const accounts = await query<BankAccount>(
      'SELECT * FROM bank_accounts ORDER BY is_primary DESC, created_at DESC'
    )
    return NextResponse.json({ accounts })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/revenue/bank-account — 계좌 등록
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      bank_name: string
      account_number: string   // 전체 계좌번호 입력받아 마스킹 처리
      account_holder: string
      is_primary?: boolean
      platform?: string
    }

    const { bank_name, account_number, account_holder, is_primary = false, platform = 'coupang_partners' } = body

    // 계좌번호 마스킹: 앞 2자리 + **** + 마지막 4자리
    const digits = account_number.replace(/[^0-9]/g, '')
    const masked = digits.length > 6
      ? `${digits.slice(0, 2)}****${digits.slice(-4)}`
      : `****${digits.slice(-4)}`

    // 기본 계좌로 설정 시 기존 기본 계좌 해제
    if (is_primary) {
      await execute(
        `UPDATE bank_accounts SET is_primary = 0 WHERE platform = ?`,
        [platform]
      )
    }

    const result = await execute(
      `INSERT INTO bank_accounts (bank_name, account_number_masked, account_holder, is_primary, platform)
       VALUES (?, ?, ?, ?, ?)`,
      [bank_name, masked, account_holder, is_primary ? 1 : 0, platform]
    )

    return NextResponse.json({
      id: result.lastInsertRowid,
      bank_name,
      account_number_masked: masked,
      account_holder,
      is_primary,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/revenue/bank-account?id=X — 계좌 삭제
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await execute('DELETE FROM bank_accounts WHERE id = ?', [parseInt(id, 10)])
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
