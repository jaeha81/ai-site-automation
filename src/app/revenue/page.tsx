'use client'

import { useState, useEffect } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface PayoutRecord {
  id: number
  payout_date: string
  gross_amount: number
  tax_withheld: number
  net_amount: number
  platform: string
  status: 'expected' | 'received'
  memo: string | null
  bank_name?: string
  account_number_masked?: string
}

interface PayoutSummary {
  records: PayoutRecord[]
  summary: {
    total_gross: number
    total_tax_withheld: number
    total_net: number
    received_count: number
    expected_count: number
    next_payout_expected: PayoutRecord | null
  }
}

interface TaxSummary {
  current_year: number
  confirmed: { gross_income: number; tax_withheld: number; net_income: number }
  pending_revenue: number
  estimated_annual_gross: number
  tax_info: {
    withholding_rate: number
    estimated_total_tax: number
    filing_deadline: string
    needs_business_registration: boolean
    business_reg_threshold: number
  }
  guide: {
    income_type: string
    withholding: string
    filing: string
    minimum_payout: string
    business_reg_benefit: string
  }
  history: Array<{ year: number; gross_income: number; tax_withheld: number; net_income: number }>
}

interface BankAccount {
  id: number
  bank_name: string
  account_number_masked: string
  account_holder: string
  is_primary: number
  platform: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function won(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억원`
  if (n >= 10_000) return `${Math.floor(n / 10_000).toLocaleString()}만 ${n % 10_000 > 0 ? `${(n % 10_000).toLocaleString()}원` : '원'}`
  return `${n.toLocaleString()}원`
}

function pct(rate: number) { return `${(rate * 100).toFixed(1)}%` }

const STATUS_BADGE: Record<string, string> = {
  received: 'bg-green-100 text-green-700',
  expected: 'bg-yellow-100 text-yellow-700',
}
const STATUS_LABEL: Record<string, string> = {
  received: '입금완료',
  expected: '입금예정',
}

// ─── AddPayoutModal ──────────────────────────────────────────────────────────

function AddPayoutModal({
  accounts,
  onClose,
  onSaved,
}: {
  accounts: BankAccount[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    payout_date: new Date().toISOString().slice(0, 10),
    gross_amount: '',
    bank_account_id: '',
    memo: '',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/revenue/payout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payout_date: form.payout_date,
        gross_amount: parseInt(form.gross_amount.replace(/,/g, ''), 10),
        bank_account_id: form.bank_account_id ? parseInt(form.bank_account_id, 10) : undefined,
        memo: form.memo || undefined,
      }),
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h3 className="font-bold text-lg mb-4">정산 내역 수동 입력</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">정산일</label>
            <input
              type="date"
              value={form.payout_date}
              onChange={e => setForm(f => ({ ...f, payout_date: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">정산금액 (원, 세전)</label>
            <input
              type="text"
              value={form.gross_amount}
              onChange={e => setForm(f => ({ ...f, gross_amount: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="예: 150000"
              required
            />
            {form.gross_amount && !isNaN(parseInt(form.gross_amount, 10)) && (
              <p className="text-xs text-gray-500 mt-1">
                원천징수(3.3%) {won(Math.round(parseInt(form.gross_amount, 10) * 0.033))} 공제 →
                실수령 <span className="font-semibold text-green-600">{won(Math.round(parseInt(form.gross_amount, 10) * 0.967))}</span>
              </p>
            )}
          </div>
          {accounts.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700">입금 계좌</label>
              <select
                value={form.bank_account_id}
                onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— 계좌 선택 —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.bank_name} {a.account_number_masked} ({a.account_holder})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700">메모 (선택)</label>
            <input
              type="text"
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="예: 6월 쿠팡 파트너스 정산"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">취소</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 bg-yellow-500 text-gray-900 font-semibold rounded-lg text-sm">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── AddBankModal ────────────────────────────────────────────────────────────

function AddBankModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ bank_name: '', account_number: '', account_holder: '', is_primary: true })
  const [saving, setSaving] = useState(false)

  const BANKS = ['국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행', 'IBK기업은행', '카카오뱅크', '토스뱅크', '케이뱅크']

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/revenue/bank-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h3 className="font-bold text-lg mb-4">입금 계좌 등록</h3>
        <p className="text-xs text-gray-500 mb-4">쿠팡 파트너스 정산금이 입금될 계좌를 등록하세요. 계좌번호는 마스킹 처리되어 저장됩니다.</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">은행</label>
            <select
              value={form.bank_name}
              onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              required
            >
              <option value="">— 은행 선택 —</option>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">계좌번호</label>
            <input
              type="text"
              value={form.account_number}
              onChange={e => setForm(f => ({ ...f, account_number: e.target.value.replace(/[^0-9-]/g, '') }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="숫자만 입력"
              required
            />
            <p className="text-xs text-gray-400 mt-1">앞 2자리 + 마지막 4자리만 표시 (마스킹 저장)</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">예금주</label>
            <input
              type="text"
              value={form.account_holder}
              onChange={e => setForm(f => ({ ...f, account_holder: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="이름"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
              className="rounded"
            />
            기본 정산 계좌로 설정
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">취소</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 bg-yellow-500 text-gray-900 font-semibold rounded-lg text-sm">
              {saving ? '저장 중...' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function RevenuePage() {
  const [payout, setPayout] = useState<PayoutSummary | null>(null)
  const [tax, setTax] = useState<TaxSummary | null>(null)
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [modal, setModal] = useState<'payout' | 'bank' | null>(null)
  const [tab, setTab] = useState<'overview' | 'payout' | 'tax' | 'account'>('overview')

  async function loadAll() {
    const [payoutRes, taxRes, bankRes] = await Promise.all([
      fetch('/api/revenue/payout').then(r => r.json()),
      fetch('/api/revenue/tax-summary').then(r => r.json()),
      fetch('/api/revenue/bank-account').then(r => r.json()),
    ])
    setPayout(payoutRes)
    setTax(taxRes)
    setAccounts(bankRes.accounts ?? [])
  }

  useEffect(() => { loadAll() }, [])

  const primaryAccount = accounts.find(a => a.is_primary === 1) ?? accounts[0]

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">수익 관리</h2>
          <p className="text-sm text-gray-500 mt-0.5">쿠팡 파트너스 정산 · 세금 · 계좌 통합 관리</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModal('bank')}
            className="text-sm px-3 py-2 border border-gray-300 rounded-lg hover:border-gray-500"
          >
            + 계좌 등록
          </button>
          <button
            onClick={() => setModal('payout')}
            className="text-sm px-4 py-2 bg-yellow-500 text-gray-900 font-semibold rounded-lg"
          >
            + 정산 입력
          </button>
        </div>
      </div>

      {/* 법적 안내 배너 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">사업자등록 없이 운영 가능합니다</p>
        <p>쿠팡 파트너스 수익은 <strong>사업소득</strong>으로 분류됩니다. 쿠팡이 지급 시 <strong>3.3% 원천징수</strong> 후 등록 계좌로 입금하며, 매년 5월 종합소득세 신고가 필요합니다.
        {tax?.tax_info.needs_business_registration && (
          <span className="block mt-1 text-orange-700 font-medium">⚠️ 연 수익 예상 1,000만원 이상 — 사업자등록을 고려하세요 (비용 경비처리 가능)</span>
        )}</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['overview', '개요'], ['payout', '정산 내역'], ['tax', '세금 현황'], ['account', '계좌 관리']] as [typeof tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 개요 탭 ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* KPI 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: `${tax?.current_year ?? '올해'} 총 수입`, value: won(tax?.estimated_annual_gross ?? 0), sub: '예상 포함', color: 'text-gray-900' },
              { label: '실수령 합계', value: won(payout?.summary.total_net ?? 0), sub: '원천징수 후', color: 'text-green-600' },
              { label: '원천징수 합계', value: won(payout?.summary.total_tax_withheld ?? 0), sub: '3.3% 자동공제', color: 'text-red-500' },
              { label: '입금예정', value: won(payout?.summary.next_payout_expected?.net_amount ?? 0), sub: '다음 정산', color: 'text-yellow-600' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl p-5 border border-gray-200">
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* 수익 흐름 다이어그램 */}
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-4">수익 흐름 구조</h3>
            <div className="flex items-center gap-2 text-sm overflow-x-auto pb-2">
              {[
                { icon: '📱', label: 'Threads 게시', sub: '16계정 자동게시' },
                { icon: '→', label: '', sub: '' },
                { icon: '🛒', label: '쿠팡 구매', sub: '링크 클릭 → 결제' },
                { icon: '→', label: '', sub: '' },
                { icon: '💰', label: '수수료 발생', sub: `카테고리별 ${pct(0.03)}~${pct(0.07)}` },
                { icon: '→', label: '', sub: '' },
                { icon: '🏦', label: '익월 말 정산', sub: '3.3% 원천징수 후' },
                { icon: '→', label: '', sub: '' },
                { icon: '💳', label: primaryAccount ? `${primaryAccount.bank_name} ${primaryAccount.account_number_masked}` : '계좌 미등록', sub: primaryAccount ? primaryAccount.account_holder : '계좌를 등록하세요' },
              ].map((node, i) =>
                node.icon === '→' ? (
                  <span key={i} className="text-gray-400 text-lg flex-shrink-0">→</span>
                ) : (
                  <div key={i} className="flex-shrink-0 text-center bg-gray-50 rounded-lg p-3 min-w-[90px]">
                    <div className="text-xl">{node.icon}</div>
                    <div className="font-medium text-gray-800 text-xs mt-1 leading-tight">{node.label}</div>
                    <div className="text-gray-400 text-xs mt-0.5 leading-tight">{node.sub}</div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* 최근 정산 3건 */}
          {(payout?.records.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">최근 정산</h3>
                <button onClick={() => setTab('payout')} className="text-xs text-yellow-600 hover:underline">전체 보기</button>
              </div>
              <div className="space-y-2">
                {payout!.records.slice(0, 3).map(r => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{r.payout_date}</p>
                      <p className="text-xs text-gray-500">{r.bank_name ? `${r.bank_name} ${r.account_number_masked}` : r.platform}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">{won(r.net_amount)}</p>
                      <p className="text-xs text-gray-400">세전 {won(r.gross_amount)}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-3 ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(payout?.records.length ?? 0) === 0 && (
            <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
              <p className="text-gray-400 text-sm">정산 내역이 없습니다.</p>
              <p className="text-gray-400 text-xs mt-1">쿠팡 파트너스 정산 후 "+ 정산 입력"으로 기록하세요.</p>
            </div>
          )}
        </div>
      )}

      {/* ── 정산 내역 탭 ────────────────────────────────────────────── */}
      {tab === 'payout' && (
        <div className="space-y-4">
          {/* 요약 */}
          {payout && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                <p className="text-xs text-gray-500">총 수입 (세전)</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{won(payout.summary.total_gross)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                <p className="text-xs text-gray-500">원천징수 합계</p>
                <p className="text-xl font-bold text-red-500 mt-1">{won(payout.summary.total_tax_withheld)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                <p className="text-xs text-gray-500">실수령 합계</p>
                <p className="text-xl font-bold text-green-600 mt-1">{won(payout.summary.total_net)}</p>
              </div>
            </div>
          )}

          {/* 정산 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">정산 내역</h3>
            </div>
            {(payout?.records.length ?? 0) === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                정산 내역이 없습니다. 쿠팡 파트너스 정산 후 기록하세요.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs text-gray-500">
                      <th className="px-4 py-3 font-medium">정산일</th>
                      <th className="px-4 py-3 font-medium text-right">세전금액</th>
                      <th className="px-4 py-3 font-medium text-right">원천징수(3.3%)</th>
                      <th className="px-4 py-3 font-medium text-right">실수령액</th>
                      <th className="px-4 py-3 font-medium">입금계좌</th>
                      <th className="px-4 py-3 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payout!.records.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium">{r.payout_date}</p>
                          {r.memo && <p className="text-xs text-gray-400">{r.memo}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{won(r.gross_amount)}</td>
                        <td className="px-4 py-3 text-right text-red-500">−{won(r.tax_withheld)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{won(r.net_amount)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {r.bank_name ? `${r.bank_name} ${r.account_number_masked}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 세금 현황 탭 ────────────────────────────────────────────── */}
      {tab === 'tax' && tax && (
        <div className="space-y-4">
          {/* 연간 현황 */}
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-4">{tax.current_year}년 소득 현황</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500">확정 수입 (정산완료)</p>
                <p className="text-lg font-bold mt-0.5">{won(tax.confirmed.gross_income)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">정산 대기 예상 수익</p>
                <p className="text-lg font-bold text-yellow-600 mt-0.5">{won(tax.pending_revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">연간 예상 총 수입</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{won(tax.estimated_annual_gross)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">원천징수 합계</p>
                <p className="text-lg font-bold text-red-500 mt-0.5">−{won(tax.confirmed.tax_withheld)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">실수령 합계</p>
                <p className="text-lg font-bold text-green-600 mt-0.5">{won(tax.confirmed.net_income)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">종합소득세 신고 기한</p>
                <p className="text-lg font-bold mt-0.5">{tax.tax_info.filing_deadline}</p>
              </div>
            </div>
          </div>

          {/* 세금 가이드 */}
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-4">세금 가이드 (개인 운영 기준)</h3>
            <div className="space-y-3">
              {[
                { icon: '📋', label: '소득 구분', value: tax.guide.income_type },
                { icon: '🏦', label: '원천징수', value: tax.guide.withholding },
                { icon: '📅', label: '세금 신고', value: tax.guide.filing },
                { icon: '💰', label: '정산 기준', value: tax.guide.minimum_payout },
                { icon: '🏢', label: '사업자등록 혜택', value: tax.guide.business_reg_benefit },
              ].map(item => (
                <div key={item.label} className="flex gap-3 text-sm">
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <div>
                    <p className="font-medium text-gray-700">{item.label}</p>
                    <p className="text-gray-500 mt-0.5">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {tax.tax_info.needs_business_registration && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                <p className="font-semibold">사업자등록을 고려하세요</p>
                <p className="mt-0.5">예상 연 수입이 {won(tax.tax_info.business_reg_threshold)} 이상입니다. 사업자등록 시 인터넷 비용, 장비, 콘텐츠 관련 비용을 경비로 처리해 세금을 절감할 수 있습니다.</p>
              </div>
            )}
          </div>

          {/* 연도별 히스토리 */}
          {tax.history.length > 0 && (
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-3">연도별 수익 이력</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="pb-2 font-medium">연도</th>
                    <th className="pb-2 font-medium text-right">총 수입</th>
                    <th className="pb-2 font-medium text-right">원천징수</th>
                    <th className="pb-2 font-medium text-right">실수령</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tax.history.map(h => (
                    <tr key={h.year} className="hover:bg-gray-50">
                      <td className="py-2 font-medium">{h.year}년</td>
                      <td className="py-2 text-right">{won(h.gross_income)}</td>
                      <td className="py-2 text-right text-red-500">−{won(h.tax_withheld)}</td>
                      <td className="py-2 text-right font-semibold text-green-600">{won(h.net_income)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 계좌 관리 탭 ────────────────────────────────────────────── */}
      {tab === 'account' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">등록 계좌</h3>
              <button
                onClick={() => setModal('bank')}
                className="text-sm px-3 py-1.5 bg-yellow-500 text-gray-900 font-semibold rounded-lg"
              >
                + 계좌 추가
              </button>
            </div>
            {accounts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">등록된 계좌가 없습니다.</p>
                <p className="text-gray-400 text-xs mt-1">쿠팡 파트너스 정산금이 입금될 계좌를 등록하세요.</p>
                <button
                  onClick={() => setModal('bank')}
                  className="mt-4 text-sm px-4 py-2 bg-yellow-500 text-gray-900 font-semibold rounded-lg"
                >
                  계좌 등록하기
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-lg">🏦</div>
                      <div>
                        <p className="font-medium text-sm">{a.bank_name}</p>
                        <p className="text-xs text-gray-500">{a.account_number_masked} · {a.account_holder}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.is_primary === 1 && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">기본</span>
                      )}
                      <button
                        onClick={async () => {
                          await fetch(`/api/revenue/bank-account?id=${a.id}`, { method: 'DELETE' })
                          loadAll()
                        }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 쿠팡 파트너스 계좌 등록 안내 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
            <p className="font-semibold text-blue-800 mb-2">쿠팡 파트너스에서도 계좌를 등록해야 합니다</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700">
              <li>partners.coupang.com 로그인</li>
              <li>마이페이지 → 정산 정보 관리</li>
              <li>계좌번호 입력 → 1원 인증</li>
              <li>월 수수료 1만원 이상이면 익월 말 자동 입금</li>
            </ol>
            <p className="text-blue-600 text-xs mt-2">※ 여기서 등록한 계좌는 대시보드 관리용이며, 실제 입금은 쿠팡 파트너스에서 별도 등록 필요합니다.</p>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal === 'payout' && (
        <AddPayoutModal accounts={accounts} onClose={() => setModal(null)} onSaved={loadAll} />
      )}
      {modal === 'bank' && (
        <AddBankModal onClose={() => setModal(null)} onSaved={loadAll} />
      )}
    </div>
  )
}
