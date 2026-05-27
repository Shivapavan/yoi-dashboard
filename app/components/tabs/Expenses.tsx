'use client'

import { useEffect, useState, useCallback } from 'react'

interface Item    { name: string; amount: number }
interface Section { section: string; total: number; items: Item[] }
interface Bill    { id: string; date: string; vendor: string; amount: number; balance: number; status: 'paid' | 'unpaid' | 'partial' }
interface Txn     { id: string; date: string; payee: string; amount: number; paymentType: string; category: string }
interface DDPayout { weekStart: string; weekEnd: string; amount: number; type: 'projected' | 'finalized'; receivedAt: string }

const SECTION_LABELS: Record<string, string> = {
  Income:                'Income',
  GrossProfit:           'Gross Profit',
  Expenses:              'Expenses',
  COGS:                  'Cost of Goods Sold',
  NetIncome:             'Net Income',
  NetOperatingIncome:    'Net Operating Income',
  OtherIncome:           'Other Income',
  OtherExpenses:         'Other Expenses',
  NonOperatingIncome:    'Non-Operating Income',
}

function fmt(v: number) {
  const abs = Math.abs(v)
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `-$${str}` : `$${str}`
}
function fmtMonth(s: string) {
  const [y, m] = s.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function addMonths(s: string, n: number) {
  const [y, m] = s.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = []
  let cur = '2025-08'
  const last = thisMonth()
  while (cur <= last) {
    options.push({ value: cur, label: fmtMonth(cur) })
    cur = addMonths(cur, 1)
  }
  return options.reverse()
}

const SECTION_COLORS: Record<string, string> = {
  Income:         'border-green-500',
  Expenses:       'border-red-500',
  COGS:           'border-orange-500',
  'Cost of Goods Sold': 'border-orange-500',
  NetIncome:      'border-teal-600',
  'Net Income':   'border-teal-600',
  'Net Earnings': 'border-teal-600',
}

export default function Expenses() {
  const [connected, setConnected]   = useState<boolean | null>(null)
  const [ddPayouts, setDdPayouts]   = useState<DDPayout[]>([])
  const [ddConnected, setDdConnected] = useState(false)
  const [month, setMonth]           = useState(thisMonth)
  const [sections, setSections]     = useState<Section[]>([])
  const [bills, setBills]           = useState<Bill[]>([])
  const [transactions, setTxns]     = useState<Txn[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [updated, setUpdated]       = useState<Date | null>(null)

  // Check QBO connection status
  useEffect(() => {
    fetch('/api/qbo/status')
      .then(r => r.json())
      .then(d => setConnected(d.connected))
      .catch(() => setConnected(false))
  }, [])

  // Fetch DoorDash payouts
  useEffect(() => {
    fetch('/api/doordash-payouts')
      .then(r => r.json())
      .then(d => { setDdConnected(d.connected); setDdPayouts(d.payouts ?? []) })
      .catch(() => {})
  }, [])

  // Check for ?qbo=connected in URL after OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('qbo') === 'connected') {
      setConnected(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('gmail') === 'connected') {
      setDdConnected(true)
      fetch('/api/doordash-payouts').then(r => r.json()).then(d => setDdPayouts(d.payouts ?? []))
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('qbo') === 'error') {
      const reason = params.get('reason') || ''
      setError(`QuickBooks connection failed: ${reason || 'Please try again.'}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const fetchExpenses = useCallback(async () => {
    if (!connected) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/qbo/expenses?month=${month}`)
      const d = await r.json()
      if (d.error === 'not_connected') { setConnected(false); return }
      if (d.error) throw new Error(d.error)
      setSections(d.sections ?? [])
      setBills(d.bills ?? [])
      setTxns(d.transactions ?? [])
      setUpdated(new Date())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [connected, month])

  useEffect(() => { fetchExpenses() }, [fetchExpenses])

  const income  = sections.find(s => s.section === 'Income' || s.section === 'GrossProfit')
  const expenses = sections.find(s => s.section === 'Expenses')
  const net     = sections.find(s => s.section === 'NetIncome' || s.section === 'Net Earnings')

  if (connected === null) {
    return <div className="text-center py-16 text-gray-400 text-sm">Checking connection…</div>
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-4xl">📊</div>
        <h3 className="text-lg font-semibold text-gray-800">Connect QuickBooks Online</h3>
        <p className="text-sm text-gray-500 text-center max-w-sm">
          Connect your QuickBooks account to view monthly income and expenses on your dashboard.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <a href="/api/qbo/connect"
          className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors">
          Connect QuickBooks
        </a>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setMonth(addMonths(month, -1))}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-gray-500 font-bold">‹</button>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer"
          >
            {monthOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button onClick={() => setMonth(addMonths(month, 1))} disabled={month >= thisMonth()}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-gray-500 font-bold disabled:opacity-30 disabled:cursor-not-allowed">›</button>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {updated && <span>Updated {updated.toLocaleTimeString()}</span>}
          <button onClick={fetchExpenses} className="text-teal-600 hover:text-teal-800 font-medium">Refresh now</button>
          <a href="/api/qbo/connect" className="text-gray-400 hover:text-gray-600">Reconnect</a>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>}

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading QuickBooks data…</p>
        </div>
      )}

      {!loading && sections.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-green-500">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Income</div>
              <div className="text-xl font-bold text-gray-900">{income ? fmt(income.total) : '—'}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-red-500">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Expenses</div>
              <div className="text-xl font-bold text-gray-900">{expenses ? fmt(Math.abs(expenses.total)) : '—'}</div>
            </div>
            <div className={`bg-white rounded-lg p-4 shadow-sm border-l-4 ${net && net.total >= 0 ? 'border-teal-600' : 'border-red-600'}`}>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Net Income</div>
              <div className={`text-xl font-bold ${net && net.total >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {net ? fmt(net.total) : '—'}
              </div>
            </div>
          </div>

          {/* P&L Sections */}
          <div className="flex flex-col gap-4">
            {sections.filter(s => s.section !== 'NetIncome' && s.section !== 'NetOperatingIncome').map((sec) => (
              <div key={sec.section} className="bg-white rounded-lg shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === sec.section ? null : sec.section)}
                  className={`w-full flex items-center justify-between px-5 py-4 border-l-4 ${SECTION_COLORS[sec.section] || 'border-gray-300'} hover:bg-gray-50 transition-colors`}
                >
                  <span className="font-semibold text-gray-800">{SECTION_LABELS[sec.section] || sec.section}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-900">{fmt(sec.total)}</span>
                    <span className="text-gray-400 text-xs">{expanded === sec.section ? '▲' : '▼'}</span>
                  </div>
                </button>
                {expanded === sec.section && sec.items.length > 0 && (
                  <table className="w-full text-sm border-t border-gray-100">
                    <tbody>
                      {sec.items.map((item, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <td className="px-5 py-2.5 text-gray-700">{item.name}</td>
                          <td className="px-5 py-2.5 text-right font-medium text-gray-900">{fmt(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>

          {/* Vendor Bills */}
          {bills.length > 0 && (
            <div className="mt-6 bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-l-4 border-orange-500 border-b border-gray-100">
                <h4 className="font-semibold text-gray-800">Vendor Bills & Payments</h4>
                <p className="text-xs text-gray-400 mt-0.5">{bills.length} bill{bills.length !== 1 ? 's' : ''} this month</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-2.5 text-xs uppercase tracking-wide text-gray-500 font-semibold">Date</th>
                    <th className="text-left px-5 py-2.5 text-xs uppercase tracking-wide text-gray-500 font-semibold">Vendor</th>
                    <th className="text-right px-5 py-2.5 text-xs uppercase tracking-wide text-gray-500 font-semibold">Amount</th>
                    <th className="text-right px-5 py-2.5 text-xs uppercase tracking-wide text-gray-500 font-semibold">Balance</th>
                    <th className="text-right px-5 py-2.5 text-xs uppercase tracking-wide text-gray-500 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-2.5 text-gray-600">
                        {new Date(bill.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-5 py-2.5 font-medium text-gray-800">{bill.vendor}</td>
                      <td className="px-5 py-2.5 text-right text-gray-900">{fmt(bill.amount)}</td>
                      <td className="px-5 py-2.5 text-right text-gray-600">{fmt(bill.balance)}</td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          bill.status === 'paid'    ? 'bg-green-100 text-green-700' :
                          bill.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                                                      'bg-red-100 text-red-700'
                        }`}>
                          {bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Expense Transactions — grouped by payee */}
          {transactions.length > 0 && (() => {
            // Group by payee, sort each group by date desc
            const grouped = new Map<string, Txn[]>()
            for (const t of transactions) {
              if (!grouped.has(t.payee)) grouped.set(t.payee, [])
              grouped.get(t.payee)!.push(t)
            }
            const payees = [...grouped.entries()]
              .map(([payee, txns]) => ({
                payee,
                txns: [...txns].sort((a, b) => b.date.localeCompare(a.date)),
                total: txns.reduce((s, t) => s + t.amount, 0),
              }))
              .sort((a, b) => b.total - a.total)
            const grandTotal = transactions.reduce((s, t) => s + t.amount, 0)

            return (
              <div className="mt-6 bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-l-4 border-red-500 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-800">Expense Transactions by Vendor</h4>
                    <p className="text-xs text-gray-400 mt-0.5">{payees.length} vendors · {transactions.length} transactions</p>
                  </div>
                  <span className="font-bold text-red-600">{fmt(grandTotal)}</span>
                </div>
                {payees.map(({ payee, txns, total }) => (
                  <div key={payee} className="border-b border-gray-100 last:border-0">
                    {/* Vendor summary row */}
                    <button
                      onClick={() => setExpanded(expanded === `txn-${payee}` ? null : `txn-${payee}`)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-800">{payee}</span>
                        <span className="text-xs text-gray-400">{txns.length} transaction{txns.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-red-600">{fmt(total)}</span>
                        <span className="text-gray-400 text-xs">{expanded === `txn-${payee}` ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {/* Date-wise detail */}
                    {expanded === `txn-${payee}` && (
                      <table className="w-full text-xs border-t border-gray-100 bg-gray-50">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left px-8 py-2 text-gray-400 font-semibold uppercase tracking-wide">Date</th>
                            <th className="text-left px-4 py-2 text-gray-400 font-semibold uppercase tracking-wide">Category</th>
                            <th className="text-left px-4 py-2 text-gray-400 font-semibold uppercase tracking-wide">Type</th>
                            <th className="text-right px-5 py-2 text-gray-400 font-semibold uppercase tracking-wide">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txns.map((t) => (
                            <tr key={t.id} className="border-b border-gray-100 last:border-0">
                              <td className="px-8 py-2 text-gray-600">
                                {new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </td>
                              <td className="px-4 py-2 text-gray-600">{t.category}</td>
                              <td className="px-4 py-2 text-gray-500">{t.paymentType}</td>
                              <td className="px-5 py-2 text-right font-medium text-red-600">{fmt(t.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
        </>
      )}

      {!loading && sections.length === 0 && !error && (
        <p className="text-center text-gray-400 py-12 text-sm">No data for this period.</p>
      )}

    </div>
  )
}
