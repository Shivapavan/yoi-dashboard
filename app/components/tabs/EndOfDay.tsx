'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import MetricCard from '../MetricCard'
import DatePicker from '../DatePicker'
import CardProcessingDetail from '../CardProcessingDetail'
import { SectionCard, CollapsibleSection, Chevron } from '../SectionCard'
import { EndOfDayMetrics } from '@/types/shift4'
import type { DailyCateringOrder } from '@/lib/google'

import type { OnlineOrder } from '@/lib/lighthouse'

function fmt(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const PLATFORM_META: Record<string, { name: string; logo: string; border: string; bg: string; iconBg: string }> = {
  doordash: {
    name: 'DoorDash',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=doordash.com',
    border: 'border-red-400',
    bg: 'bg-red-50',
    iconBg: 'bg-red-100',
  },
  ubereats: {
    name: 'Uber Eats',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=ubereats.com',
    border: 'border-gray-700',
    bg: 'bg-gray-50',
    iconBg: 'bg-gray-900',
  },
  grubhub: {
    name: 'Grubhub',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=grubhub.com',
    border: 'border-orange-400',
    bg: 'bg-orange-50',
    iconBg: 'bg-orange-100',
  },
  other: {
    name: 'Online',
    logo: '',
    border: 'border-teal-300',
    bg: 'bg-teal-50',
    iconBg: 'bg-teal-100',
  },
}

function fmtTime(utc: string | null): string {
  if (!utc) return '—'
  return new Date(utc).toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

const REFRESH_MS = 5 * 60 * 1000

const GROSS_FORMULA = 'Net Sales + Taxes + Surcharges. The total billed amount on closed tickets. "Surcharges" are usually cash-rounding adjustments or card-processing fees — small amounts that aren\'t items, discounts, or tax.'

const CARDS = [
  { key: 'netSales',           label: 'Net Sales',            color: '#22C55E', inverse: false,
    formula: 'Sum of menu items sold (after discounts, before tax). Your actual food/beverage revenue.' },
  { key: 'taxes',              label: 'Taxes',                color: '#F59E0B', inverse: false,
    formula: 'Sales tax collected on Net Sales. Reported by Shift4.' },
  { key: 'voids',              label: 'Voids',                color: '#EF4444', inverse: true,
    formula: 'Items removed from tickets after being rung up. Already excluded from Gross Sales — shown separately for visibility.' },
  { key: 'cashPayments',       label: 'Cash Payments',        color: '#16A34A', inverse: false,
    formula: 'Cash received from customers paying for orders, net of any cash refunds. NOT the same as "Cash In" in the Cash Summary — that\'s drawer paid-ins (owner adding cash, bank change, etc.).' },
  { key: 'creditCardPayments', label: 'Credit Card Payments', color: '#0D9488', inverse: false,
    formula: 'Total card transactions — sum of Visa, Mastercard, Amex, Discover, Debit, EBT (see Card Processing Detail below).' },
  { key: 'discounts',          label: 'Discounts',            color: '#EC4899', inverse: true,
    formula: 'Total discount value applied to tickets. Subtracted from Gross Sales to get Net Sales.' },
  { key: 'openTickets',        label: 'Open Tickets',         color: '#0891B2', inverse: true,
    formula: 'Value of tickets still being served (not yet paid). Not part of Gross Sales until the ticket closes.' },
] as const

const EMPTY: EndOfDayMetrics = {
  grossSales: 0, netSales: 0, taxes: 0, voids: 0,
  cashPayments: 0, creditCardPayments: 0, discounts: 0, openTickets: 0,
}

// Returns the current BUSINESS DAY date (America/Chicago).
// The business day starts at 4 AM CDT, so 12:00 AM–3:59 AM still belongs
// to the previous day. We shift back 4 hours before extracting the date,
// which moves the day boundary from midnight to 4 AM.
function centralToday(): string {
  const shifted = new Date(Date.now() - 4 * 60 * 60 * 1000)
  return shifted.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

export default function EndOfDay() {
  const today = centralToday()
  const [date, setDate] = useState('')
  const [recommendedDate, setRecommendedDate] = useState('')
  const [earliestDate, setEarliestDate] = useState('')
  const [metrics, setMetrics] = useState<EndOfDayMetrics>(EMPTY)
  const [processingDetail, setProcessingDetail] = useState<any>(null)
  const [isLive, setIsLive] = useState(false)
  const [noData, setNoData] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [cateringOrders, setCateringOrders] = useState<DailyCateringOrder[]>([])
  const [cateringLoading, setCateringLoading] = useState(false)
  const [cashRefund, setCashRefund]     = useState(0)
  const [expanded, setExpanded]         = useState<string | null>(null)
  const [voidDetails, setVoidDetails]   = useState<{employee:string;approvedBy:string;voidedAt:string;ticket:string;item:string;reason:string;amount:number}[]>([])
  const [cashDetails, setCashDetails]   = useState<{label:string;amount:number}[]>([])
  const [orderTypes, setOrderTypes]     = useState<{type:string;count:number;amount:number}[]>([])
  const [averages, setAverages]         = useState<EndOfDayMetrics | null>(null)
  const [openTicketsList, setOpenTicketsList]       = useState<{guid:string;orderName:string;orderTypeName:string;customerName:string|null;employeeName:string;createdAt:string;grandTotal:number}[]>([])
  const [openTicketsLoading, setOpenTicketsLoading] = useState(false)
  const [onlineOrders, setOnlineOrders]         = useState<OnlineOrder[]>([])
  const [onlineLoading, setOnlineLoading]       = useState(false)
  const [orderItems, setOrderItems]             = useState<Record<string, {name:string;qty:number;price:number|null}[] | null>>({})
  const [orderItemsLoading, setOrderItemsLoading] = useState<Record<string, boolean>>({})
  const isFirstLoad = useRef(true)

  const fetchData = useCallback(async (d: string, autoRedirect = false) => {
    if (!d) return
    setLoading(true)
    setError(null)
    setNoData(false)
    setProcessingDetail(null)
    setCashRefund(0)
    setVoidDetails([])
    setCashDetails([])
    setOrderTypes([])
    try {
      const r = await fetch(`/api/end-of-day?date=${d}`)
      const res = await r.json()
      if (res.error) throw new Error(res.error)

      setRecommendedDate(res.recommendedDate)
      if (res.earliestDate) setEarliestDate(res.earliestDate)

      // Only auto-redirect to last available date if NOT live (i.e. not today's data)
      if (autoRedirect && !res.live && res.metrics.grossSales === 0 && res.recommendedDate && res.recommendedDate !== d) {
        setDate(res.recommendedDate)
        return
      }

      if (!res.live && res.metrics.grossSales === 0 && d !== res.recommendedDate) setNoData(true)

      setMetrics(res.metrics)
      setProcessingDetail(res.processingDetail)
      setCashRefund(res.cashRefund ?? 0)
      setVoidDetails(res.voidDetails ?? [])
      setCashDetails(res.cashDetails ?? [])
      setOrderTypes(res.orderTypes ?? [])
      setAverages(res.averages ?? null)
      setIsLive(!!res.live)
      setLastUpdated(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // First load: start with today, auto-redirect if $0
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      setDate(today)
      fetchData(today, true)
    }
  }, [today, fetchData])

  // Re-fetch when date changes (after first load)
  useEffect(() => {
    if (!date || isFirstLoad.current) return
    fetchData(date, false)
    const interval = setInterval(() => fetchData(date, false), REFRESH_MS)
    return () => clearInterval(interval)
  }, [date, fetchData])

  // Fetch catering orders for the selected date
  useEffect(() => {
    if (!date) return
    setCateringLoading(true)
    fetch(`/api/catering/daily?date=${date}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setCateringOrders(d.orders ?? []) })
      .catch(() => {})
      .finally(() => setCateringLoading(false))
  }, [date])

  // Fetch open tickets — only meaningful on today's live view
  useEffect(() => {
    if (date !== today) { setOpenTicketsList([]); return }
    const load = () => {
      setOpenTicketsLoading(true)
      fetch('/api/open-tickets')
        .then(r => r.json())
        .then(d => setOpenTicketsList(d.tickets ?? []))
        .catch(() => {})
        .finally(() => setOpenTicketsLoading(false))
    }
    load()
    const interval = setInterval(load, REFRESH_MS)
    return () => clearInterval(interval)
  }, [date, today])

  // Fetch online delivery orders — auto-refresh every 5 min when viewing today
  useEffect(() => {
    if (!date) return
    const load = () => {
      fetch(`/api/online-orders?date=${date}`)
        .then((r) => r.json())
        .then((d) => { setOnlineOrders(d.orders ?? []); setOnlineLoading(false) })
        .catch(() => { setOnlineLoading(false) })
    }
    setOnlineOrders([])
    setOnlineLoading(true)
    load()
    // Only poll on today's live view — historical dates are static
    if (date === today) {
      const interval = setInterval(load, REFRESH_MS)
      return () => clearInterval(interval)
    }
  }, [date, today])

  // ── Hero (Gross Sales) — the single number the owner checks first ──
  const grossSurcharge = Math.max(0, metrics.grossSales - metrics.netSales - metrics.taxes)
  const grossBreakdown = grossSurcharge > 0.01
    ? `${fmt(metrics.netSales)} Net + ${fmt(metrics.taxes)} Tax + ${fmt(grossSurcharge)} Surcharge`
    : `${fmt(metrics.netSales)} Net + ${fmt(metrics.taxes)} Tax`
  const grossDelta = (averages && averages.grossSales > 0.01)
    ? ((metrics.grossSales - averages.grossSales) / averages.grossSales) * 100
    : null

  return (
    <div>
      <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <DatePicker value={date} onChange={setDate} min={earliestDate} max={today} />
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {isLive && (
              <span className="flex items-center gap-1 text-red-500 font-semibold">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
            )}
            {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Auto-refresh 5 min
            </span>
            <button onClick={() => fetchData(date, false)} className="text-teal-600 hover:text-teal-800 font-medium">
              Refresh now
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>
      )}

      {noData && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 mb-4 text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>
            No data for {date}.
            {earliestDate && date < earliestDate
              ? ` Data starts from ${earliestDate}.`
              : ` This date hasn't been scraped yet.`}
            {recommendedDate && (
              <button
                onClick={() => setDate(recommendedDate)}
                className="ml-2 underline font-medium hover:text-amber-900"
              >
                Go to {recommendedDate} (last available)
              </button>
            )}
          </span>
        </div>
      )}

      {/* Hero — Gross Sales gets the eye first */}
      <div
        className={`relative bg-white rounded-2xl shadow-sm border-l-4 border-yoi-primary p-6 mb-4 transition-opacity ${loading ? 'opacity-50' : ''}`}
        title={GROSS_FORMULA}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Gross Sales — {date === today ? 'Today' : date}
            </p>
            <p className="text-4xl sm:text-5xl font-extrabold text-gray-900 mt-1 leading-none">{fmt(metrics.grossSales)}</p>
            {metrics.grossSales > 0 && <p className="text-xs text-gray-500 mt-2 font-mono">= {grossBreakdown}</p>}
          </div>
          {grossDelta !== null && (
            <div className="text-right flex-shrink-0">
              <div className={`inline-flex items-center gap-1 text-base font-bold ${grossDelta >= 0 ? 'text-success' : 'text-danger'}`}>
                {grossDelta >= 0 ? '▲' : '▼'} {Math.abs(grossDelta).toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500 mt-0.5">vs 14-day avg</p>
            </div>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        {CARDS.map(({ key, label, color, formula, inverse }) => {
          // Open Tickets — for today, use the live list sum (only currently-OPEN tickets).
          // Lighthouse's open-tickets metric sometimes counts settlement-pending or stale tickets.
          const value = (key === 'openTickets' && date === today)
            ? openTicketsList.reduce((s, t) => s + t.grandTotal, 0)
            : metrics[key]

          // Build a numerical breakdown for cards that have a meaningful one
          let breakdown: string | undefined
          if (key === 'netSales') {
            breakdown = metrics.discounts > 0
              ? `= Items rung up − ${fmt(metrics.discounts)} (Discounts)`
              : undefined
          } else if (key === 'cashPayments') {
            // Only show breakdown if the math actually checks out against the
            // displayed value. Lighthouse's "Cash Summary > Received" can include
            // drawer paid-ins (owner adding change, bank cash, etc.) which are
            // NOT customer payments — pulling that number into a subtitle below
            // the customer-payments value misleads readers when they disagree.
            const received = cashDetails.find(r => /received/i.test(r.label))?.amount ?? 0
            const refunded = cashDetails.find(r => /refund/i.test(r.label))?.amount ?? 0
            const reconciles = Math.abs((received - refunded) - value) < 0.05
            if (reconciles && (received > 0 || refunded > 0)) {
              breakdown = refunded > 0
                ? `= ${fmt(received)} (Received) − ${fmt(refunded)} (Refunded)`
                : `= ${fmt(received)} (Received from customers)`
            } else if (received > value + 0.05) {
              const drawerIn = received - value - refunded
              breakdown = `${fmt(drawerIn)} of cash drawer flow is paid-ins (not customer payments) — see Cash Summary below`
            }
          } else if (key === 'openTickets' && date === today && openTicketsList.length > 0) {
            breakdown = `${openTicketsList.length} open ticket${openTicketsList.length !== 1 ? 's' : ''} — see detail below`
          }

          // Delta vs 14-day average
          let deltaPct: number | null = null
          if (averages && averages[key] > 0.01) {
            deltaPct = ((value - averages[key]) / averages[key]) * 100
          }

          return (
            <MetricCard
              key={key} label={label} value={value} borderColor={color}
              formula={formula} breakdown={breakdown}
              deltaPct={deltaPct} inverse={inverse}
              note={key === 'cashPayments' && cashRefund > 0
                ? `incl. −$${cashRefund.toFixed(2)} cash refund`
                : undefined}
            />
          )
        })}
      </div>

      {processingDetail && (
        <CardProcessingDetail
          windowLabel={processingDetail.windowLabel}
          rows={processingDetail.rows}
          historical={processingDetail.historical}
        />
      )}


      {/* Open Tickets detail (today only) */}
      {date === today && openTicketsList.length > 0 && (
        <CollapsibleSection
          title="Open Tickets Detail"
          subtitle="Tickets that haven't been settled yet — verify they're real and not stale"
          accent="border-l-cyan-600"
          open={expanded === 'openTickets'}
          onToggle={() => setExpanded(expanded === 'openTickets' ? null : 'openTickets')}
          summary={
            <>
              {openTicketsLoading
                ? <span className="text-xs text-gray-400 animate-pulse">Loading…</span>
                : <span className="text-gray-500">{openTicketsList.length} ticket{openTicketsList.length !== 1 ? 's' : ''}</span>}
              <span className="font-bold text-cyan-700">{fmt(openTicketsList.reduce((s, t) => s + t.grandTotal, 0))}</span>
            </>
          }
        >
              {openTicketsList.length === 0 && !openTicketsLoading && (
                <p className="px-6 py-4 text-sm text-gray-400">No open tickets returned by Lighthouse.</p>
              )}
              {openTicketsList.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left  px-6 py-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Order</th>
                      <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Type</th>
                      <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Customer / Table</th>
                      <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Server</th>
                      <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Opened</th>
                      <th className="text-right px-6 py-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openTicketsList.map((t) => {
                      const ageHrs = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 3600000)
                      const stale  = ageHrs >= 6
                      return (
                        <tr key={t.guid} className={`border-b border-gray-50 last:border-0 ${stale ? 'bg-red-50' : ''}`}>
                          <td className="px-6 py-2.5 font-semibold text-gray-800">{t.orderName}</td>
                          <td className="px-4 py-2.5 text-gray-500">{t.orderTypeName || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-700">{t.customerName || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500">{t.employeeName || '—'}</td>
                          <td className={`px-4 py-2.5 whitespace-nowrap ${stale ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            {fmtTime(t.createdAt)}
                            {ageHrs > 0 && <span className="ml-1 text-xs">({ageHrs}h ago)</span>}
                          </td>
                          <td className="px-6 py-2.5 text-right font-semibold text-gray-900">{fmt(t.grandTotal)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={5} className="px-6 py-2 font-bold text-gray-900">Total Open</td>
                      <td className="px-6 py-2 text-right font-bold text-cyan-700">
                        {fmt(openTicketsList.reduce((s, t) => s + t.grandTotal, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
          <p className="px-6 py-2 text-xs text-gray-500 border-t border-gray-100 bg-gray-50">
            Tickets older than 6 hours appear in red — likely forgotten/stale.
          </p>
        </CollapsibleSection>
      )}

      {/* Void breakdown */}
      {voidDetails.length > 0 && (() => {
        // Group by employee
        const empMap = new Map<string, typeof voidDetails>()
        for (const v of voidDetails) {
          if (!empMap.has(v.employee)) empMap.set(v.employee, [])
          empMap.get(v.employee)!.push(v)
        }
        const byEmployee = [...empMap.entries()]
          .map(([emp, rows]) => ({ emp, rows, total: rows.reduce((s,r)=>s+r.amount,0) }))
          .sort((a,b) => b.total - a.total)
        const grandTotal = voidDetails.reduce((s,v)=>s+v.amount,0)
        return (
          <SectionCard
            title="Void Detail"
            accent="border-l-danger"
            className="mt-6"
            summary={<span className="text-xs text-gray-500">{voidDetails.length} voids · {fmt(grandTotal)}</span>}
          >
            {byEmployee.map(({ emp, rows, total }) => (
              <div key={emp} className="border-b border-gray-100 last:border-0">
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(expanded === `void-${emp}` ? null : `void-${emp}`)}
                  className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800">{emp}</span>
                    <span className="text-xs text-gray-400">{rows.length} void{rows.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-danger">{fmt(total)}</span>
                    <Chevron open={expanded === `void-${emp}`} />
                  </div>
                </button>
                {/* Detail rows */}
                {expanded === `void-${emp}` && (
                  <table className="w-full text-xs border-t border-gray-100 bg-gray-50">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-8 py-2 text-gray-400 font-semibold uppercase tracking-wide">Time</th>
                        <th className="text-left px-4 py-2 text-gray-400 font-semibold uppercase tracking-wide">Ticket</th>
                        <th className="text-left px-4 py-2 text-gray-400 font-semibold uppercase tracking-wide">Item</th>
                        <th className="text-left px-4 py-2 text-gray-400 font-semibold uppercase tracking-wide">Reason</th>
                        <th className="text-right px-5 py-2 text-gray-400 font-semibold uppercase tracking-wide">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((v, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="px-8 py-2 text-gray-500 whitespace-nowrap">{v.voidedAt}</td>
                          <td className="px-4 py-2 text-gray-500">{v.ticket}</td>
                          <td className="px-4 py-2 text-gray-700">{v.item}</td>
                          <td className="px-4 py-2 text-gray-500">{v.reason}</td>
                          <td className="px-5 py-2 text-right font-medium text-red-600">{fmt(v.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </SectionCard>
        )
      })()}

      {/* Cash reconciliation */}
      {cashDetails.length > 0 && (() => {
        const startingCash = cashDetails.find(r => r.label === 'Starting Cash')?.amount ?? 0
        const cashExpected = cashDetails.find(r => r.label === 'Cash Expected')?.amount ?? 0
        const isOpen = expanded === 'cash-summary'
        return (
          <CollapsibleSection
            title="Cash Summary"
            accent="border-l-success"
            open={isOpen}
            onToggle={() => setExpanded(isOpen ? null : 'cash-summary')}
            summary={
              <>
                <span className="text-gray-500">Starting: <span className="font-semibold text-gray-800">{fmt(startingCash)}</span></span>
                <span className="text-gray-500">Expected: <span className="font-semibold text-green-700">{fmt(cashExpected)}</span></span>
              </>
            }
          >
            <table className="w-full text-sm">
              <tbody>
                {cashDetails.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-50 last:border-0 ${r.label === 'Cash Expected' || r.label === 'Final Deposit' ? 'bg-gray-50 font-semibold' : ''}`}>
                    <td className="px-6 py-2.5 text-gray-700">{r.label}</td>
                    <td className={`px-6 py-2.5 text-right ${r.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>{r.amount !== 0 ? fmt(r.amount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CollapsibleSection>
        )
      })()}

      {/* ── Order Type Breakdown ──────────────────────────────────────────── */}
      {orderTypes.length > 0 && (
        <CollapsibleSection
          title="Sales by Order Type"
          accent="border-l-teal-600"
          open={expanded === 'orderTypes'}
          onToggle={() => setExpanded(expanded === 'orderTypes' ? null : 'orderTypes')}
          summary={<span className="text-gray-500">{orderTypes.length} types</span>}
        >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Type</th>
                  <th className="text-right px-6 py-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Orders</th>
                  <th className="text-right px-6 py-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {orderTypes.map((ot) => (
                  <tr key={ot.type} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-2.5 text-gray-700">{ot.type}</td>
                    <td className="px-6 py-2.5 text-right text-gray-400">{ot.count > 0 ? ot.count : '—'}</td>
                    <td className="px-6 py-2.5 text-right font-semibold text-gray-900">{fmt(ot.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </CollapsibleSection>
      )}

      {/* ── Online Delivery Orders ────────────────────────────────────────── */}
      {(onlineLoading || onlineOrders.length > 0) && (
        <div className="bg-white rounded-lg shadow-sm mt-4 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">Online Delivery Orders</h3>
              {!onlineLoading && onlineOrders.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {onlineOrders.length} order{onlineOrders.length !== 1 ? 's' : ''} · {fmt(onlineOrders.reduce((s, o) => s + o.grandTotal, 0))} total
                </p>
              )}
            </div>
            {onlineLoading && <span className="text-xs text-gray-400 animate-pulse">Loading…</span>}
            {/* Platform summary badges */}
            {!onlineLoading && onlineOrders.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {(['doordash', 'ubereats', 'grubhub'] as const).map(p => {
                  const count = onlineOrders.filter(o => o.platform === p).length
                  if (!count) return null
                  const meta = PLATFORM_META[p]
                  return (
                    <span key={p} className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${meta.bg} border ${meta.border}`}>
                      <img src={meta.logo} alt={meta.name} className="w-4 h-4 rounded object-contain" />
                      {meta.name} {count}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {!onlineLoading && onlineOrders.length === 0 && (
            <p className="px-6 py-5 text-sm text-gray-400">No delivery orders found for this day.</p>
          )}

          <div className="divide-y divide-gray-50">
            {onlineOrders.map((order) => {
              const meta = PLATFORM_META[order.platform] ?? PLATFORM_META.other
              const key = `online-${order.guid}`
              const isOpen = expanded === key
              return (
                <div key={order.guid}>
                  <button
                    className="w-full flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => {
                      setExpanded(isOpen ? null : key)
                      if (!isOpen && orderItems[order.guid] === undefined) {
                        setOrderItemsLoading(p => ({ ...p, [order.guid]: true }))
                        // businessDay is a UTC ISO string like "2026-05-04T09:00:00.000Z"
                        const dateStr = order.businessDay
                          ? order.businessDay.slice(0, 10)
                          : (order.completedAt ?? order.createdAt).slice(0, 10)
                        fetch(`/api/order-items?platform=${order.platform}&date=${dateStr}&total=${order.grandTotal}&customer=${encodeURIComponent(order.customerName ?? '')}`)
                          .then(r => r.json())
                          .then(d => setOrderItems(p => ({ ...p, [order.guid]: d.items ?? null })))
                          .catch(() => setOrderItems(p => ({ ...p, [order.guid]: null })))
                          .finally(() => setOrderItemsLoading(p => ({ ...p, [order.guid]: false })))
                      }
                    }}
                  >
                    {/* Platform logo */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${meta.border} ${meta.iconBg}`}>
                      {meta.logo
                        ? <img src={meta.logo} alt={meta.name} className="w-7 h-7 object-contain rounded" />
                        : <span className="text-xs font-bold text-gray-500">?</span>
                      }
                    </div>
                    {/* Order info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">Order #{order.orderNumber}</span>
                        <span className="text-xs text-gray-400">{fmtTime(order.completedAt ?? order.createdAt)}</span>
                      </div>
                      {order.customerName && (
                        <div className="text-xs text-gray-500 truncate">{order.customerName}</div>
                      )}
                    </div>
                    {/* Total + expand */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-bold text-gray-900">{fmt(order.grandTotal)}</span>
                      <Chevron open={isOpen} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className={`px-6 pb-4 ${meta.bg}`}>
                      {/* ── Items from email receipt ── */}
                      <div className="mt-3 mb-3 bg-white rounded-lg overflow-hidden border border-gray-100">
                        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Items</span>
                          {orderItemsLoading[order.guid] && <span className="text-xs text-gray-400 animate-pulse">Looking up…</span>}
                        </div>
                        {orderItemsLoading[order.guid] && (
                          <div className="px-4 py-3 text-sm text-gray-400">Searching email receipt…</div>
                        )}
                        {!orderItemsLoading[order.guid] && orderItems[order.guid] === null && (
                          <div className="px-4 py-3 text-sm text-gray-400">No email receipt found for this order.</div>
                        )}
                        {!orderItemsLoading[order.guid] && Array.isArray(orderItems[order.guid]) && orderItems[order.guid]!.length === 0 && (
                          <div className="px-4 py-3 text-sm text-gray-400">Email found but couldn't read item list.</div>
                        )}
                        {!orderItemsLoading[order.guid] && orderItems[order.guid] && orderItems[order.guid]!.length > 0 && (
                          <table className="w-full text-sm">
                            <tbody>
                              {orderItems[order.guid]!.map((item, i) => (
                                <tr key={i} className="border-b border-gray-50 last:border-0">
                                  <td className="px-4 py-2 text-gray-700">
                                    <span className="text-gray-400 mr-2">{item.qty}×</span>
                                    {item.name}
                                  </td>
                                  <td className="px-4 py-2 text-right text-gray-700 font-medium">
                                    {item.price !== null ? fmt(item.price) : ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {orderItems[order.guid] === undefined && !orderItemsLoading[order.guid] && (
                          <div className="px-4 py-3 text-sm text-gray-300 italic">Expand to load</div>
                        )}
                      </div>

                      {/* ── Financials ── */}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                        <div className="text-gray-500">Platform</div>
                        <div className="font-medium text-gray-800">{order.paymentTypeName}</div>
                        {order.customerName && (
                          <>
                            <div className="text-gray-500">Customer</div>
                            <div className="font-medium text-gray-800">{order.customerName}</div>
                          </>
                        )}
                        <div className="text-gray-500">Processed by</div>
                        <div className="font-medium text-gray-800">{order.employeeName || '—'}</div>
                        <div className="text-gray-500">Time</div>
                        <div className="font-medium text-gray-800">{fmtTime(order.completedAt ?? order.createdAt)} CDT</div>
                        <div className="text-gray-500">Subtotal</div>
                        <div className="font-medium text-gray-800">{fmt(order.subtotal)}</div>
                        {order.discountTotal > 0 && (
                          <>
                            <div className="text-gray-500">Discount</div>
                            <div className="font-medium text-red-600">−{fmt(order.discountTotal)}</div>
                          </>
                        )}
                        {order.surchargeTotal > 0 && (
                          <>
                            <div className="text-gray-500">Surcharge</div>
                            <div className="font-medium text-gray-800">{fmt(order.surchargeTotal)}</div>
                          </>
                        )}
                        <div className="text-gray-500">Tax</div>
                        <div className="font-medium text-gray-800">{fmt(order.taxTotal)}</div>
                        <div className="text-gray-500 font-semibold">Total</div>
                        <div className="font-bold text-gray-900">{fmt(order.grandTotal)}</div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Catering Orders for selected date */}
      <div className="mt-6">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-3">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">Catering Orders — {date}</h3>
              {!cateringLoading && cateringOrders.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {cateringOrders.length} order{cateringOrders.length !== 1 ? 's' : ''} · {fmt(cateringOrders.reduce((s, o) => s + (o.finalPrice ?? o.total), 0))} total
                </p>
              )}
            </div>
            {cateringLoading && <span className="text-xs text-gray-400">Loading…</span>}
          </div>
          {!cateringLoading && cateringOrders.length === 0 && (
            <p className="px-6 pb-4 text-sm text-gray-400">No catering orders for this day.</p>
          )}
        </div>

        {cateringOrders.map((order, idx) => {
          const palettes = [
            { border: 'border-l-teal-600', titleBg: 'bg-teal-50',  titleBorder: 'border-teal-100',  titleText: 'text-teal-900',  totalText: 'text-teal-700' },
            { border: 'border-l-indigo-600', titleBg: 'bg-indigo-50',  titleBorder: 'border-indigo-100',  titleText: 'text-indigo-900',  totalText: 'text-indigo-700' },
            { border: 'border-l-emerald-600',titleBg: 'bg-emerald-50', titleBorder: 'border-emerald-100', titleText: 'text-emerald-900', totalText: 'text-emerald-700'},
            { border: 'border-l-amber-600',  titleBg: 'bg-amber-50',   titleBorder: 'border-amber-100',   titleText: 'text-amber-900',   totalText: 'text-amber-700'  },
            { border: 'border-l-rose-600',   titleBg: 'bg-rose-50',    titleBorder: 'border-rose-100',    titleText: 'text-rose-900',    totalText: 'text-rose-700'   },
            { border: 'border-l-cyan-600',   titleBg: 'bg-cyan-50',    titleBorder: 'border-cyan-100',    titleText: 'text-cyan-900',    totalText: 'text-cyan-700'   },
          ]
          const c = palettes[idx % palettes.length]
          const finalPrice = order.finalPrice ?? order.total
          const hasDiscount = order.total > 0 && finalPrice > 0 && Math.abs(order.total - finalPrice) > 0.01
          return (
            <div key={idx} className={`bg-white rounded-lg shadow-sm overflow-hidden mb-3 border-l-4 ${c.border}`}>
              {/* Order title + final price */}
              <div className={`px-6 py-3 ${c.titleBg} border-b ${c.titleBorder} flex items-center justify-between flex-wrap gap-2`}>
                <p className={`font-semibold text-sm ${c.titleText}`}>{order.title}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Final Price</span>
                  <span className={`text-lg font-bold ${c.totalText}`}>{fmt(finalPrice)}</span>
                </div>
              </div>
              {/* Items table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-2 text-xs uppercase tracking-wide text-gray-500 font-semibold">Item</th>
                    <th className="text-center px-4 py-2 text-xs uppercase tracking-wide text-gray-500 font-semibold">Tray</th>
                    <th className="text-right px-6 py-2 text-xs uppercase tracking-wide text-gray-500 font-semibold">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-2 text-gray-700">{item.name}</td>
                      <td className="px-4 py-2 text-center text-gray-400">{item.traySize || '—'}</td>
                      <td className="px-6 py-2 text-right text-gray-700">
                        {item.price > 0 ? fmt(item.price) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {hasDiscount && (
                    <>
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td colSpan={2} className="px-6 py-2 text-gray-700">Total Price</td>
                        <td className="px-6 py-2 text-right text-gray-700">{fmt(order.total)}</td>
                      </tr>
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td colSpan={2} className="px-6 py-2 text-gray-500">Discount</td>
                        <td className="px-6 py-2 text-right text-red-600">−{fmt(order.total - finalPrice)}</td>
                      </tr>
                    </>
                  )}
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td colSpan={2} className="px-6 py-2 font-bold text-gray-900">
                      {hasDiscount ? 'Final Price' : 'Grand Total'}
                      {order.cash !== finalPrice && (
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          (Cash: {fmt(order.cash)})
                        </span>
                      )}
                    </td>
                    <td className={`px-6 py-2 text-right font-bold ${c.totalText}`}>{fmt(finalPrice)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
