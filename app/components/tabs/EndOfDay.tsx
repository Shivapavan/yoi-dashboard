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

const PLATFORM_META: Record<string, { name: string; logo: string; borderColor: string; bgColor: string; iconBgColor: string }> = {
  doordash: {
    name: 'DoorDash',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=doordash.com',
    borderColor: '#F87171',
    bgColor: 'rgba(239,68,68,0.08)',
    iconBgColor: 'rgba(239,68,68,0.15)',
  },
  ubereats: {
    name: 'Uber Eats',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=ubereats.com',
    borderColor: '#4B5563',
    bgColor: 'rgba(75,85,99,0.08)',
    iconBgColor: 'rgba(17,24,39,0.5)',
  },
  grubhub: {
    name: 'Grubhub',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=grubhub.com',
    borderColor: '#FB923C',
    bgColor: 'rgba(251,146,60,0.08)',
    iconBgColor: 'rgba(251,146,60,0.15)',
  },
  other: {
    name: 'Online',
    logo: '',
    borderColor: '#2DD4BF',
    bgColor: 'rgba(45,212,191,0.08)',
    iconBgColor: 'rgba(45,212,191,0.15)',
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
      {/* Controls bar */}
      <div
        className="rounded-xl p-4 mb-6"
        style={{ backgroundColor: '#161B22', border: '1px solid #21262D' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <DatePicker value={date} onChange={setDate} min={earliestDate} max={today} />
          <div className="flex items-center gap-3 text-xs" style={{ color: '#6E7681' }}>
            {isLive && (
              <span className="flex items-center gap-1 font-semibold" style={{ color: '#F87171' }}>
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
            )}
            {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Auto-refresh 5 min
            </span>
            <button
              onClick={() => fetchData(date, false)}
              className="font-medium transition-colors"
              style={{ color: '#0D9488' }}
            >
              Refresh now
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl p-3 mb-4 text-sm"
          style={{ backgroundColor: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#F87171' }}
        >
          {error}
        </div>
      )}

      {noData && (
        <div
          className="rounded-xl p-3 mb-4 text-sm flex items-center gap-2"
          style={{ backgroundColor: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', color: '#FCD34D' }}
        >
          <span>⚠️</span>
          <span>
            No data for {date}.
            {earliestDate && date < earliestDate
              ? ` Data starts from ${earliestDate}.`
              : ` This date hasn't been scraped yet.`}
            {recommendedDate && (
              <button
                onClick={() => setDate(recommendedDate)}
                className="ml-2 underline font-medium"
                style={{ color: '#FCD34D' }}
              >
                Go to {recommendedDate} (last available)
              </button>
            )}
          </span>
        </div>
      )}

      {/* Hero — Gross Sales gets the eye first */}
      <div
        className={`relative rounded-2xl p-6 mb-4 transition-opacity ${loading ? 'opacity-50' : ''}`}
        style={{
          backgroundColor: '#161B22',
          border: '1px solid #21262D',
          borderLeft: '4px solid #0D9488',
        }}
        title={GROSS_FORMULA}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B949E' }}>
              Gross Sales — {date === today ? 'Today' : date}
            </p>
            <p className="text-4xl sm:text-5xl font-extrabold mt-1 leading-none" style={{ color: '#E6EDF3' }}>
              {fmt(metrics.grossSales)}
            </p>
            {metrics.grossSales > 0 && (
              <p className="text-xs mt-2 font-mono" style={{ color: '#6E7681' }}>= {grossBreakdown}</p>
            )}
          </div>
          {grossDelta !== null && (
            <div className="text-right flex-shrink-0">
              <div
                className="inline-flex items-center gap-1 text-base font-bold"
                style={{ color: grossDelta >= 0 ? '#4ADE80' : '#F87171' }}
              >
                {grossDelta >= 0 ? '▲' : '▼'} {Math.abs(grossDelta).toFixed(1)}%
              </div>
              <p className="text-xs mt-0.5" style={{ color: '#6E7681' }}>vs 14-day avg</p>
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
                ? <span className="text-xs animate-pulse" style={{ color: '#6E7681' }}>Loading…</span>
                : <span style={{ color: '#6E7681' }}>{openTicketsList.length} ticket{openTicketsList.length !== 1 ? 's' : ''}</span>}
              <span className="font-bold" style={{ color: '#22D3EE' }}>{fmt(openTicketsList.reduce((s, t) => s + t.grandTotal, 0))}</span>
            </>
          }
        >
              {openTicketsList.length === 0 && !openTicketsLoading && (
                <p className="px-6 py-4 text-sm" style={{ color: '#6E7681' }}>No open tickets returned by Lighthouse.</p>
              )}
              {openTicketsList.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #21262D' }}>
                      <th className="text-left  px-6 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Order</th>
                      <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Type</th>
                      <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Customer / Table</th>
                      <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Server</th>
                      <th className="text-left  px-4 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Opened</th>
                      <th className="text-right px-6 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openTicketsList.map((t) => {
                      const ageHrs = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 3600000)
                      const stale  = ageHrs >= 6
                      return (
                        <tr
                          key={t.guid}
                          style={{
                            borderBottom: '1px solid #1C2333',
                            backgroundColor: stale ? 'rgba(220,38,38,0.08)' : 'transparent',
                          }}
                        >
                          <td className="px-6 py-2.5 font-semibold" style={{ color: '#E6EDF3' }}>{t.orderName}</td>
                          <td className="px-4 py-2.5" style={{ color: '#8B949E' }}>{t.orderTypeName || '—'}</td>
                          <td className="px-4 py-2.5" style={{ color: '#C9D1D9' }}>{t.customerName || '—'}</td>
                          <td className="px-4 py-2.5" style={{ color: '#8B949E' }}>{t.employeeName || '—'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: stale ? '#F87171' : '#8B949E', fontWeight: stale ? '500' : undefined }}>
                            {fmtTime(t.createdAt)}
                            {ageHrs > 0 && <span className="ml-1 text-xs">({ageHrs}h ago)</span>}
                          </td>
                          <td className="px-6 py-2.5 text-right font-semibold" style={{ color: '#E6EDF3' }}>{fmt(t.grandTotal)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#1C2333', borderTop: '1px solid #21262D' }}>
                      <td colSpan={5} className="px-6 py-2 font-bold" style={{ color: '#E6EDF3' }}>Total Open</td>
                      <td className="px-6 py-2 text-right font-bold" style={{ color: '#22D3EE' }}>
                        {fmt(openTicketsList.reduce((s, t) => s + t.grandTotal, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
          <p className="px-6 py-2 text-xs" style={{ borderTop: '1px solid #21262D', backgroundColor: '#1C2333', color: '#6E7681' }}>
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
            summary={<span className="text-xs" style={{ color: '#8B949E' }}>{voidDetails.length} voids · {fmt(grandTotal)}</span>}
          >
            {byEmployee.map(({ emp, rows, total }) => (
              <div key={emp} style={{ borderBottom: '1px solid #21262D' }} className="last:border-0">
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(expanded === `void-${emp}` ? null : `void-${emp}`)}
                  className="w-full flex items-center justify-between px-6 py-3 transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1C2333')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold" style={{ color: '#E6EDF3' }}>{emp}</span>
                    <span className="text-xs" style={{ color: '#6E7681' }}>{rows.length} void{rows.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold" style={{ color: '#F87171' }}>{fmt(total)}</span>
                    <Chevron open={expanded === `void-${emp}`} />
                  </div>
                </button>
                {/* Detail rows */}
                {expanded === `void-${emp}` && (
                  <table className="w-full text-xs" style={{ borderTop: '1px solid #21262D', backgroundColor: '#1C2333' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #21262D' }}>
                        <th className="text-left px-8 py-2 font-semibold uppercase tracking-wide" style={{ color: '#6E7681' }}>Time</th>
                        <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide" style={{ color: '#6E7681' }}>Ticket</th>
                        <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide" style={{ color: '#6E7681' }}>Item</th>
                        <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide" style={{ color: '#6E7681' }}>Reason</th>
                        <th className="text-right px-5 py-2 font-semibold uppercase tracking-wide" style={{ color: '#6E7681' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((v, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #21262D' }} className="last:border-0">
                          <td className="px-8 py-2 whitespace-nowrap" style={{ color: '#8B949E' }}>{v.voidedAt}</td>
                          <td className="px-4 py-2" style={{ color: '#8B949E' }}>{v.ticket}</td>
                          <td className="px-4 py-2" style={{ color: '#C9D1D9' }}>{v.item}</td>
                          <td className="px-4 py-2" style={{ color: '#8B949E' }}>{v.reason}</td>
                          <td className="px-5 py-2 text-right font-medium" style={{ color: '#F87171' }}>{fmt(v.amount)}</td>
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
                <span style={{ color: '#8B949E' }}>Starting: <span className="font-semibold" style={{ color: '#E6EDF3' }}>{fmt(startingCash)}</span></span>
                <span style={{ color: '#8B949E' }}>Expected: <span className="font-semibold" style={{ color: '#4ADE80' }}>{fmt(cashExpected)}</span></span>
              </>
            }
          >
            <table className="w-full text-sm">
              <tbody>
                {cashDetails.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid #1C2333',
                      backgroundColor: (r.label === 'Cash Expected' || r.label === 'Final Deposit') ? '#1C2333' : 'transparent',
                      fontWeight: (r.label === 'Cash Expected' || r.label === 'Final Deposit') ? '600' : undefined,
                    }}
                    className="last:border-0"
                  >
                    <td className="px-6 py-2.5" style={{ color: '#C9D1D9' }}>{r.label}</td>
                    <td className="px-6 py-2.5 text-right" style={{ color: r.amount < 0 ? '#F87171' : '#E6EDF3' }}>
                      {r.amount !== 0 ? fmt(r.amount) : '—'}
                    </td>
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
          summary={<span style={{ color: '#8B949E' }}>{orderTypes.length} types</span>}
        >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #21262D' }}>
                  <th className="text-left px-6 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Type</th>
                  <th className="text-right px-6 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Orders</th>
                  <th className="text-right px-6 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {orderTypes.map((ot) => (
                  <tr key={ot.type} style={{ borderBottom: '1px solid #1C2333' }} className="last:border-0">
                    <td className="px-6 py-2.5" style={{ color: '#C9D1D9' }}>{ot.type}</td>
                    <td className="px-6 py-2.5 text-right" style={{ color: '#6E7681' }}>{ot.count > 0 ? ot.count : '—'}</td>
                    <td className="px-6 py-2.5 text-right font-semibold" style={{ color: '#E6EDF3' }}>{fmt(ot.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </CollapsibleSection>
      )}

      {/* ── Online Delivery Orders ────────────────────────────────────────── */}
      {(onlineLoading || onlineOrders.length > 0) && (
        <div
          className="rounded-xl mt-4 overflow-hidden"
          style={{ backgroundColor: '#161B22', border: '1px solid #21262D' }}
        >
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #21262D' }}>
            <div>
              <h3 className="font-semibold" style={{ color: '#E6EDF3' }}>Online Delivery Orders</h3>
              {!onlineLoading && onlineOrders.length > 0 && (
                <p className="text-xs mt-0.5" style={{ color: '#6E7681' }}>
                  {onlineOrders.length} order{onlineOrders.length !== 1 ? 's' : ''} · {fmt(onlineOrders.reduce((s, o) => s + o.grandTotal, 0))} total
                </p>
              )}
            </div>
            {onlineLoading && <span className="text-xs animate-pulse" style={{ color: '#6E7681' }}>Loading…</span>}
            {/* Platform summary badges */}
            {!onlineLoading && onlineOrders.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {(['doordash', 'ubereats', 'grubhub'] as const).map(p => {
                  const count = onlineOrders.filter(o => o.platform === p).length
                  if (!count) return null
                  const meta = PLATFORM_META[p]
                  return (
                    <span
                      key={p}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: meta.bgColor, border: `1px solid ${meta.borderColor}`, color: '#E6EDF3' }}
                    >
                      <img src={meta.logo} alt={meta.name} className="w-4 h-4 rounded object-contain" />
                      {meta.name} {count}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {!onlineLoading && onlineOrders.length === 0 && (
            <p className="px-6 py-5 text-sm" style={{ color: '#6E7681' }}>No delivery orders found for this day.</p>
          )}

          <div>
            {onlineOrders.map((order) => {
              const meta = PLATFORM_META[order.platform] ?? PLATFORM_META.other
              const key = `online-${order.guid}`
              const isOpen = expanded === key
              return (
                <div key={order.guid} style={{ borderBottom: '1px solid #1C2333' }} className="last:border-0">
                  <button
                    className="w-full flex items-center gap-3 px-6 py-3.5 transition-colors text-left"
                    style={{ backgroundColor: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1C2333')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
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
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ border: `1px solid ${meta.borderColor}`, backgroundColor: meta.iconBgColor }}
                    >
                      {meta.logo
                        ? <img src={meta.logo} alt={meta.name} className="w-7 h-7 object-contain rounded" />
                        : <span className="text-xs font-bold" style={{ color: '#8B949E' }}>?</span>
                      }
                    </div>
                    {/* Order info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: '#E6EDF3' }}>Order #{order.orderNumber}</span>
                        <span className="text-xs" style={{ color: '#6E7681' }}>{fmtTime(order.completedAt ?? order.createdAt)}</span>
                      </div>
                      {order.customerName && (
                        <div className="text-xs truncate" style={{ color: '#8B949E' }}>{order.customerName}</div>
                      )}
                    </div>
                    {/* Total + expand */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-bold" style={{ color: '#E6EDF3' }}>{fmt(order.grandTotal)}</span>
                      <Chevron open={isOpen} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-4" style={{ backgroundColor: meta.bgColor }}>
                      {/* ── Items from email receipt ── */}
                      <div
                        className="mt-3 mb-3 rounded-lg overflow-hidden"
                        style={{ backgroundColor: '#161B22', border: '1px solid #21262D' }}
                      >
                        <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid #21262D' }}>
                          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6E7681' }}>Order Items</span>
                          {orderItemsLoading[order.guid] && <span className="text-xs animate-pulse" style={{ color: '#6E7681' }}>Looking up…</span>}
                        </div>
                        {orderItemsLoading[order.guid] && (
                          <div className="px-4 py-3 text-sm" style={{ color: '#6E7681' }}>Searching email receipt…</div>
                        )}
                        {!orderItemsLoading[order.guid] && orderItems[order.guid] === null && (
                          <div className="px-4 py-3 text-sm" style={{ color: '#6E7681' }}>No email receipt found for this order.</div>
                        )}
                        {!orderItemsLoading[order.guid] && Array.isArray(orderItems[order.guid]) && orderItems[order.guid]!.length === 0 && (
                          <div className="px-4 py-3 text-sm" style={{ color: '#6E7681' }}>Email found but couldn't read item list.</div>
                        )}
                        {!orderItemsLoading[order.guid] && orderItems[order.guid] && orderItems[order.guid]!.length > 0 && (
                          <table className="w-full text-sm">
                            <tbody>
                              {orderItems[order.guid]!.map((item, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #1C2333' }} className="last:border-0">
                                  <td className="px-4 py-2" style={{ color: '#C9D1D9' }}>
                                    <span className="mr-2" style={{ color: '#6E7681' }}>{item.qty}×</span>
                                    {item.name}
                                  </td>
                                  <td className="px-4 py-2 text-right font-medium" style={{ color: '#C9D1D9' }}>
                                    {item.price !== null ? fmt(item.price) : ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {orderItems[order.guid] === undefined && !orderItemsLoading[order.guid] && (
                          <div className="px-4 py-3 text-sm italic" style={{ color: '#6E7681' }}>Expand to load</div>
                        )}
                      </div>

                      {/* ── Financials ── */}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                        <div style={{ color: '#8B949E' }}>Platform</div>
                        <div className="font-medium" style={{ color: '#E6EDF3' }}>{order.paymentTypeName}</div>
                        {order.customerName && (
                          <>
                            <div style={{ color: '#8B949E' }}>Customer</div>
                            <div className="font-medium" style={{ color: '#E6EDF3' }}>{order.customerName}</div>
                          </>
                        )}
                        <div style={{ color: '#8B949E' }}>Processed by</div>
                        <div className="font-medium" style={{ color: '#E6EDF3' }}>{order.employeeName || '—'}</div>
                        <div style={{ color: '#8B949E' }}>Time</div>
                        <div className="font-medium" style={{ color: '#E6EDF3' }}>{fmtTime(order.completedAt ?? order.createdAt)} CDT</div>
                        <div style={{ color: '#8B949E' }}>Subtotal</div>
                        <div className="font-medium" style={{ color: '#E6EDF3' }}>{fmt(order.subtotal)}</div>
                        {order.discountTotal > 0 && (
                          <>
                            <div style={{ color: '#8B949E' }}>Discount</div>
                            <div className="font-medium" style={{ color: '#F87171' }}>−{fmt(order.discountTotal)}</div>
                          </>
                        )}
                        {order.surchargeTotal > 0 && (
                          <>
                            <div style={{ color: '#8B949E' }}>Surcharge</div>
                            <div className="font-medium" style={{ color: '#E6EDF3' }}>{fmt(order.surchargeTotal)}</div>
                          </>
                        )}
                        <div style={{ color: '#8B949E' }}>Tax</div>
                        <div className="font-medium" style={{ color: '#E6EDF3' }}>{fmt(order.taxTotal)}</div>
                        <div className="font-semibold" style={{ color: '#8B949E' }}>Total</div>
                        <div className="font-bold" style={{ color: '#E6EDF3' }}>{fmt(order.grandTotal)}</div>
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
        <div
          className="rounded-xl overflow-hidden mb-3"
          style={{ backgroundColor: '#161B22', border: '1px solid #21262D' }}
        >
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold" style={{ color: '#E6EDF3' }}>Catering Orders — {date}</h3>
              {!cateringLoading && cateringOrders.length > 0 && (
                <p className="text-xs mt-0.5" style={{ color: '#6E7681' }}>
                  {cateringOrders.length} order{cateringOrders.length !== 1 ? 's' : ''} · {fmt(cateringOrders.reduce((s, o) => s + (o.finalPrice ?? o.total), 0))} total
                </p>
              )}
            </div>
            {cateringLoading && <span className="text-xs" style={{ color: '#6E7681' }}>Loading…</span>}
          </div>
          {!cateringLoading && cateringOrders.length === 0 && (
            <p className="px-6 pb-4 text-sm" style={{ color: '#6E7681' }}>No catering orders for this day.</p>
          )}
        </div>

        {cateringOrders.map((order, idx) => {
          const palettes = [
            { borderColor: '#0D9488', headerBg: 'rgba(13,148,136,0.1)',  totalColor: '#2DD4BF'  },
            { borderColor: '#818CF8', headerBg: 'rgba(129,140,248,0.1)', totalColor: '#A5B4FC'  },
            { borderColor: '#34D399', headerBg: 'rgba(52,211,153,0.1)',  totalColor: '#6EE7B7'  },
            { borderColor: '#F59E0B', headerBg: 'rgba(245,158,11,0.1)',  totalColor: '#FCD34D'  },
            { borderColor: '#F43F5E', headerBg: 'rgba(244,63,94,0.1)',   totalColor: '#FB7185'  },
            { borderColor: '#22D3EE', headerBg: 'rgba(34,211,238,0.1)',  totalColor: '#67E8F9'  },
          ]
          const c = palettes[idx % palettes.length]
          const finalPrice = order.finalPrice ?? order.total
          const hasDiscount = order.total > 0 && finalPrice > 0 && Math.abs(order.total - finalPrice) > 0.01
          return (
            <div
              key={idx}
              className="rounded-xl overflow-hidden mb-3"
              style={{ backgroundColor: '#161B22', border: '1px solid #21262D', borderLeft: `4px solid ${c.borderColor}` }}
            >
              {/* Order title + final price */}
              <div
                className="px-6 py-3 flex items-center justify-between flex-wrap gap-2"
                style={{ backgroundColor: c.headerBg, borderBottom: '1px solid #21262D' }}
              >
                <p className="font-semibold text-sm" style={{ color: '#E6EDF3' }}>{order.title}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide font-semibold" style={{ color: '#8B949E' }}>Final Price</span>
                  <span className="text-lg font-bold" style={{ color: c.totalColor }}>{fmt(finalPrice)}</span>
                </div>
              </div>
              {/* Items table */}
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #21262D' }}>
                    <th className="text-left px-6 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Item</th>
                    <th className="text-center px-4 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Tray</th>
                    <th className="text-right px-6 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1C2333' }} className="last:border-0">
                      <td className="px-6 py-2" style={{ color: '#C9D1D9' }}>{item.name}</td>
                      <td className="px-4 py-2 text-center" style={{ color: '#6E7681' }}>{item.traySize || '—'}</td>
                      <td className="px-6 py-2 text-right" style={{ color: '#C9D1D9' }}>
                        {item.price > 0 ? fmt(item.price) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {hasDiscount && (
                    <>
                      <tr style={{ borderTop: '1px solid #21262D', backgroundColor: '#1C2333' }}>
                        <td colSpan={2} className="px-6 py-2" style={{ color: '#C9D1D9' }}>Total Price</td>
                        <td className="px-6 py-2 text-right" style={{ color: '#C9D1D9' }}>{fmt(order.total)}</td>
                      </tr>
                      <tr style={{ borderTop: '1px solid #21262D', backgroundColor: '#1C2333' }}>
                        <td colSpan={2} className="px-6 py-2" style={{ color: '#8B949E' }}>Discount</td>
                        <td className="px-6 py-2 text-right" style={{ color: '#F87171' }}>−{fmt(order.total - finalPrice)}</td>
                      </tr>
                    </>
                  )}
                  <tr style={{ borderTop: '1px solid #21262D', backgroundColor: '#1C2333' }}>
                    <td colSpan={2} className="px-6 py-2 font-bold" style={{ color: '#E6EDF3' }}>
                      {hasDiscount ? 'Final Price' : 'Grand Total'}
                      {order.cash !== finalPrice && (
                        <span className="ml-2 text-xs font-normal" style={{ color: '#6E7681' }}>
                          (Cash: {fmt(order.cash)})
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-2 text-right font-bold" style={{ color: c.totalColor }}>{fmt(finalPrice)}</td>
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
