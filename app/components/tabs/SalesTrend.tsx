'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

const REFRESH_MS = 5 * 60 * 1000
type View = 'daily' | 'weekly' | 'monthly'
type RevenueRow = { label: string; count: number | null; amount: number }
type ActivityData = {
  grossSales: number
  netSales: number
  grossByRevenue: RevenueRow[]
  netByRevenue: RevenueRow[]
  orderTypes?: { type: string; count: number; amount: number }[]
}

function fmt(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtShortDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtFullDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}
function fmtMonth(s: string) {
  const [y, m] = s.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function fmtMonthShort(s: string) {
  const [y, m] = s.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function weekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().split('T')[0]
}
// Business day starts at 4 AM CDT — shift back 4 h before extracting date
function todayStr() {
  return new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}
function thisMonthStr() { return todayStr().slice(0, 7) }

// Generate week options from Aug 4 2025 to current week
function weekOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = []
  let cur = '2025-08-04'
  const last = weekMonday(todayStr())
  while (cur <= last) {
    const end = addDays(cur, 6)
    options.push({ value: cur, label: `${fmtShortDate(cur)} – ${fmtShortDate(end)}` })
    cur = addDays(cur, 7)
  }
  return options.reverse()
}

// Generate month options from Aug 2025 to current month
function monthOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = []
  const start = new Date(2025, 7, 1) // August 2025
  const [y, m] = thisMonthStr().split('-').map(Number)
  const end = new Date(y, m - 1, 1)
  const cur = new Date(start)
  while (cur <= end) {
    const value = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    const label = cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    options.push({ value, label })
    cur.setMonth(cur.getMonth() + 1)
  }
  return options.reverse() // most recent first
}

const selectStyle: React.CSSProperties = {
  backgroundColor: '#0D1117',
  border: '1px solid #30363D',
  color: '#E6EDF3',
  colorScheme: 'dark',
}

function NavBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-9 h-9 flex items-center justify-center rounded-full font-bold text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      style={{ border: '1px solid #30363D', color: '#8B949E', backgroundColor: 'transparent' }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.backgroundColor = '#21262D')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </button>
  )
}

function RevenueTable({ title, rows, accentColor }: { title: string; rows: RevenueRow[]; accentColor: string }) {
  const dataRows = rows.filter((r) => !r.label.startsWith('Total'))
  const totalRow = rows.find((r) => r.label.startsWith('Total'))
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#161B22', border: '1px solid #21262D' }}>
      <div
        className="px-5 py-3"
        style={{ borderLeft: `4px solid ${accentColor}`, borderBottom: '1px solid #21262D' }}
      >
        <h4 className="font-semibold text-sm" style={{ color: '#E6EDF3' }}>{title}</h4>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #21262D' }}>
            <th className="text-left px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Category</th>
            <th className="text-right px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Count</th>
            <th className="text-right px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {dataRows.map((r) => (
            <tr key={r.label} style={{ borderBottom: '1px solid #1C2333' }} className="last:border-0">
              <td className="px-5 py-2.5" style={{ color: '#C9D1D9' }}>{r.label}</td>
              <td className="px-5 py-2.5 text-right" style={{ color: '#6E7681' }}>{r.count ?? '—'}</td>
              <td className="px-5 py-2.5 text-right" style={{ color: '#C9D1D9' }}>{fmt(r.amount)}</td>
            </tr>
          ))}
        </tbody>
        {totalRow && (
          <tfoot>
            <tr style={{ borderTop: '1px solid #21262D', backgroundColor: '#1C2333' }}>
              <td className="px-5 py-2.5 font-bold" style={{ color: '#E6EDF3' }}>{totalRow.label.replace(':', '')}</td>
              <td className="px-5 py-2.5 text-right font-bold" style={{ color: '#E6EDF3' }}>{totalRow.count ?? '—'}</td>
              <td className="px-5 py-2.5 text-right font-bold" style={{ color: '#E6EDF3' }}>{fmt(totalRow.amount)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export default function SalesTrend() {
  type DDPayout = { weekStart: string; weekEnd: string; amount: number; type: 'projected' | 'finalized' }

  const [view, setView] = useState<View>('daily')
  const [weekStart, setWeekStart] = useState(() => weekMonday(todayStr()))
  const [month, setMonth] = useState(thisMonthStr)
  const [ddPayouts, setDdPayouts] = useState<DDPayout[]>([])
  const [ddWeek, setDdWeek] = useState('')  // selected week in DD payout dropdown
  const [dailyMonth, setDailyMonth] = useState(thisMonthStr)
  const [trend, setTrend] = useState<any[]>([])
  const [activityData, setActivityData] = useState<ActivityData | null>(null)
  const [cateringCash, setCateringCash] = useState<{ total: number; sheetName: string } | null>(null)
  const [dailyPeriodLabel, setDailyPeriodLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch DoorDash payouts once on mount
  useEffect(() => {
    fetch('/api/doordash-payouts')
      .then(r => r.json())
      .then(d => {
        if (d.payouts?.length) {
          setDdPayouts(d.payouts)
          setDdWeek(d.payouts[0].weekStart)  // default to most recent
        }
      })
      .catch(() => {})
  }, [])

  const fetchData = useCallback((immediate = false) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const delay = immediate ? 0 : 300
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      let url = `/api/sales-trend?view=${view}`
      if (view === 'daily')   url += `&dailyMonth=${dailyMonth}`
      if (view === 'weekly')  url += `&week=${weekStart}`
      if (view === 'monthly') url += `&month=${month}`

      try {
        // Phase 1 — chart data only (fast: reads dashboard.json, no Lighthouse call)
        const r1 = await fetch(url + '&lite=true')
        const d1 = await r1.json()
        if (d1.error) throw new Error(d1.error)
        setTrend(d1.trend ?? [])
        if (d1.periodLabel) setDailyPeriodLabel(d1.periodLabel)
        setLoading(false) // chart is ready

        // Phase 2 — activity summary (slow: Lighthouse API call)
        const r2 = await fetch(url)
        const d2 = await r2.json()
        if (!d2.error) {
          if (d2.trend) setTrend(d2.trend)
          setActivityData(d2.activityData ?? null)
          setCateringCash(d2.cateringCash ?? null)
          if (d2.periodLabel) setDailyPeriodLabel(d2.periodLabel)
          setLastUpdated(new Date())
        }
      } catch (e: any) {
        setError(e.message)
        setLoading(false)
      }
    }, delay)
  }, [view, weekStart, month, dailyMonth])

  // Clear data immediately only when switching between view TYPES (daily/weekly/monthly)
  // so the chart resets. For period navigation (month/week changes), keep stale data
  // visible while the debounced fetch runs — avoids jarring gray-box flash.
  const prevViewRef = useRef(view)
  useEffect(() => {
    if (view !== prevViewRef.current) {
      setTrend([]); setActivityData(null); setCateringCash(null)
      prevViewRef.current = view
    }
  }, [view])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => fetchData(true), REFRESH_MS)
    return () => {
      clearInterval(interval)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchData])

  // ── Summary stats ──────────────────────────────────────────────────────────
  const activeDays = trend.filter((d) => d.grossSales > 0)
  const totalGross = activeDays.reduce((s, d) => s + (d.grossSales || 0), 0)
  const totalNet   = activeDays.reduce((s, d) => s + (d.netSales   || 0), 0)
  const totalCash  = trend.reduce((s, d) => s + (d.cashPayments || 0), 0)

  const daysElapsed = (() => {
    const td = todayStr()
    if (view === 'daily') {
      const [y, m] = dailyMonth.split('-').map(Number)
      const lastDay = `${dailyMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
      if (td > lastDay) return new Date(y, m, 0).getDate()
      if (td < `${dailyMonth}-01`) return 1
      return parseInt(td.slice(8))
    }
    if (view === 'monthly') {
      const [y, m] = month.split('-').map(Number)
      const lastDay = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
      if (td > lastDay) return new Date(y, m, 0).getDate()
      if (td < `${month}-01`) return 1
      return parseInt(td.slice(8))
    }
    if (view === 'weekly') {
      const we = addDays(weekStart, 6)
      if (td > we) return 7
      if (td < weekStart) return 1
      const ms = new Date(weekStart + 'T12:00:00').getTime()
      const mt = new Date(td + 'T12:00:00').getTime()
      return Math.round((mt - ms) / 86400000) + 1
    }
    return activeDays.length || 1
  })()
  const avgGross = activeDays.length
    ? totalGross / activeDays.length
    : (activityData?.grossSales && daysElapsed > 0 ? activityData.grossSales / daysElapsed : 0)

  const best      = trend.reduce<any>((b, d) => (d.grossSales > (b?.grossSales ?? 0) ? d : b), null)
  const bestLabel = best?.grossSales > 0
    ? view === 'daily'
      ? fmtShortDate(best.date)
      : view === 'weekly'
      ? new Date(best.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : `${best.label} (${fmtMonthShort(month)})`
    : null

  const todayMonday  = weekMonday(todayStr())
  const canNextWeek  = weekStart < todayMonday
  const canNextMonth = month < thisMonthStr()

  const tooltipTitle = (label: string) => {
    if (view === 'daily') return fmtFullDate(label)
    const item = trend.find((d) => d.label === label)
    return item ? fmtFullDate(item.date) : label
  }

  const hasChartData = activeDays.length > 0 || (activityData?.grossSales ?? 0) > 0

  const showCatering = view === 'daily' && cateringCash

  return (
    <div>
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div
            className="flex gap-1 rounded-xl p-1"
            style={{ backgroundColor: '#1C2333' }}
          >
            {(['daily', 'weekly', 'monthly'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-5 py-1.5 rounded-lg text-sm font-medium transition-all capitalize"
                style={
                  view === v
                    ? { backgroundColor: '#0D9488', color: '#fff', boxShadow: '0 0 10px rgba(13,148,136,0.4)' }
                    : { color: '#8B949E', backgroundColor: 'transparent' }
                }
              >
                {v}
              </button>
            ))}
          </div>
          {view === 'daily' && (
            <div className="flex items-center gap-2">
              <NavBtn onClick={() => setDailyMonth(addMonths(dailyMonth, -1))}>‹</NavBtn>
              <select
                value={dailyMonth}
                onChange={(e) => setDailyMonth(e.target.value)}
                className="px-3 py-1 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                style={selectStyle}
              >
                {monthOptions().map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <NavBtn onClick={() => setDailyMonth(addMonths(dailyMonth, 1))} disabled={dailyMonth >= thisMonthStr()}>›</NavBtn>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: '#6E7681' }}>
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Auto-refresh 5 min
          </span>
          <button onClick={() => fetchData(true)} className="font-medium" style={{ color: '#0D9488' }}>Refresh now</button>
        </div>
      </div>

      {/* ── Period navigator ─────────────────────────────────────────────── */}
      {view === 'weekly' && (
        <div className="flex items-center justify-center gap-3 mb-4">
          <NavBtn onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</NavBtn>
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            style={selectStyle}
          >
            {weekOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <NavBtn onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={!canNextWeek}>›</NavBtn>
        </div>
      )}
      {view === 'monthly' && (
        <div className="flex items-center justify-center gap-2 mb-4">
          <NavBtn onClick={() => setMonth(addMonths(month, -1))}>‹</NavBtn>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            style={selectStyle}
          >
            {monthOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <NavBtn onClick={() => setMonth(addMonths(month, 1))} disabled={!canNextMonth}>›</NavBtn>
        </div>
      )}

      {error && (
        <div
          className="rounded-xl p-3 mb-4 text-sm"
          style={{ backgroundColor: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#F87171' }}
        >
          {error}
        </div>
      )}

      {/* ── Summary mini-cards ────────────────────────────────────────────── */}
      {(trend.length > 0 || activityData) && (
        <div className={`grid grid-cols-2 gap-3 mb-4 ${showCatering ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-3 lg:grid-cols-5'}`}>
          {[
            { label: 'Total Gross',   value: fmt(totalGross),                              borderColor: '#0D9488' },
            { label: 'Total Net',     value: fmt(totalNet),                                borderColor: '#D97706' },
            { label: 'Avg / Day',     value: avgGross > 0 ? fmt(avgGross) : '—',           borderColor: '#818CF8' },
            { label: 'Best Day',      value: best?.grossSales > 0 ? fmt(best.grossSales) : '—', borderColor: '#22C55E', sub: bestLabel },
            { label: 'Cash Received', value: fmt(totalCash),                               borderColor: '#2DD4BF' },
            ...(showCatering ? [{
              label: `${dailyPeriodLabel ? fmtMonth(dailyPeriodLabel) : ''} CAT CAH`,
              value: fmt(cateringCash!.total),
              borderColor: '#F97316',
            }] : []),
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl p-4"
              style={{ backgroundColor: '#161B22', border: '1px solid #21262D', borderLeft: `4px solid ${card.borderColor}` }}
            >
              <div className="text-xs uppercase tracking-wide mb-1" style={{ color: '#8B949E' }}>{card.label}</div>
              <div className="text-xl font-bold" style={{ color: '#E6EDF3' }}>{card.value}</div>
              {card.sub && <div className="text-xs mt-0.5" style={{ color: '#6E7681' }}>{card.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Chart ────────────────────────────────────────────────────────── */}
      <div
        className={`rounded-xl p-6 transition-opacity ${loading ? 'opacity-50' : ''}`}
        style={{ backgroundColor: '#161B22', border: '1px solid #21262D' }}
      >
        {!hasChartData && !loading ? (
          <p className="text-center py-12" style={{ color: '#6E7681' }}>No sales data for this period.</p>
        ) : view === 'daily' ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={activeDays} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262D" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8B949E' }} tickFormatter={fmtShortDate}
                interval={Math.max(0, Math.floor(activeDays.length / 10) - 1)} axisLine={{ stroke: '#21262D' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8B949E' }} tickFormatter={(v) => `$${v.toLocaleString()}`} width={72}
                domain={[0, (max: number) => Math.max(max, 100)]} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number, n: string) => [fmt(v), n]} labelFormatter={fmtFullDate}
                contentStyle={{ backgroundColor: '#1C2333', border: '1px solid #30363D', borderRadius: 8, fontSize: 12, color: '#E6EDF3' }}
                labelStyle={{ color: '#8B949E' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ color: '#8B949E', fontSize: 12 }} />
              <Bar dataKey="grossSales" name="Gross Sales" fill="#0D9488" radius={[3, 3, 0, 0]} />
              <Bar dataKey="netSales" name="Net Sales" fill="#D97706" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={trend} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262D" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8B949E' }}
                interval={view === 'monthly' ? Math.max(0, Math.floor(trend.length / 15) - 1) : 0}
                axisLine={{ stroke: '#21262D' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8B949E' }} tickFormatter={(v) => `$${v.toLocaleString()}`} width={72}
                domain={[0, (max: number) => Math.max(max, 100)]} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number, n: string) => [fmt(v), n]} labelFormatter={tooltipTitle}
                contentStyle={{ backgroundColor: '#1C2333', border: '1px solid #30363D', borderRadius: 8, fontSize: 12, color: '#E6EDF3' }}
                labelStyle={{ color: '#8B949E' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ color: '#8B949E', fontSize: 12 }} />
              <Bar dataKey="grossSales" name="Gross Sales" fill="#0D9488" radius={[3, 3, 0, 0]} />
              <Bar dataKey="netSales" name="Net Sales" fill="#D97706" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Revenue class tables ─────────────────────────────────────────── */}
      {activityData && activityData.grossByRevenue.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <RevenueTable title="Gross Sales by Revenue Class" rows={activityData.grossByRevenue} accentColor="#0D9488" />
          <RevenueTable title="Net Sales by Revenue Class" rows={activityData.netByRevenue} accentColor="#D97706" />
        </div>
      )}

      {/* ── Order Type Breakdown ─────────────────────────────────────────── */}
      {activityData && activityData.orderTypes && activityData.orderTypes.length > 0 && (
        <div
          className="mt-4 rounded-xl overflow-hidden"
          style={{ backgroundColor: '#161B22', border: '1px solid #21262D' }}
        >
          <div className="px-5 py-3" style={{ borderLeft: '4px solid #0D9488', borderBottom: '1px solid #21262D' }}>
            <h4 className="font-semibold text-sm" style={{ color: '#E6EDF3' }}>Sales by Order Type</h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #21262D' }}>
                <th className="text-left px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Type</th>
                <th className="text-right px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Orders</th>
                <th className="text-right px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {activityData.orderTypes.map((ot) => (
                <tr key={ot.type} style={{ borderBottom: '1px solid #1C2333' }} className="last:border-0">
                  <td className="px-5 py-2.5" style={{ color: '#C9D1D9' }}>{ot.type}</td>
                  <td className="px-5 py-2.5 text-right" style={{ color: '#6E7681' }}>{ot.count > 0 ? ot.count : '—'}</td>
                  <td className="px-5 py-2.5 text-right font-semibold" style={{ color: '#E6EDF3' }}>{fmt(ot.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DoorDash Payouts — weekly view only */}
      {view === 'weekly' && ddPayouts.length > 0 && (() => {
        const selected = ddPayouts.find(p => p.weekStart === ddWeek) ?? ddPayouts[0]
        const totalAll = ddPayouts.reduce((s, p) => s + p.amount, 0)
        return (
          <div
            className="mt-6 rounded-xl overflow-hidden"
            style={{ backgroundColor: '#161B22', border: '1px solid #21262D' }}
          >
            <div
              className="px-5 py-4 flex items-center justify-between flex-wrap gap-3"
              style={{ borderLeft: '4px solid #F87171', borderBottom: '1px solid #21262D' }}
            >
              <div>
                <h4 className="font-semibold" style={{ color: '#E6EDF3' }}>🚗 DoorDash Payout</h4>
                <p className="text-xs mt-0.5" style={{ color: '#6E7681' }}>Auto-synced from email · Total {ddPayouts.length} weeks: {fmt(totalAll)}</p>
              </div>
              <div className="flex items-center gap-2">
                <NavBtn
                  onClick={() => {
                    const idx = ddPayouts.findIndex(p => p.weekStart === ddWeek)
                    if (idx < ddPayouts.length - 1) setDdWeek(ddPayouts[idx + 1].weekStart)
                  }}
                  disabled={ddPayouts.findIndex(p => p.weekStart === ddWeek) >= ddPayouts.length - 1}
                >‹</NavBtn>
                <select
                  value={ddWeek}
                  onChange={e => setDdWeek(e.target.value)}
                  className="px-3 py-1 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-400 cursor-pointer"
                  style={selectStyle}
                >
                  {ddPayouts.map(p => (
                    <option key={p.weekStart} value={p.weekStart}>
                      {fmtShortDate(p.weekStart)} – {fmtShortDate(p.weekEnd)}
                    </option>
                  ))}
                </select>
                <NavBtn
                  onClick={() => {
                    const idx = ddPayouts.findIndex(p => p.weekStart === ddWeek)
                    if (idx > 0) setDdWeek(ddPayouts[idx - 1].weekStart)
                  }}
                  disabled={ddPayouts.findIndex(p => p.weekStart === ddWeek) <= 0}
                >›</NavBtn>
              </div>
            </div>
            {selected && (
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide mb-1" style={{ color: '#6E7681' }}>
                    {fmtShortDate(selected.weekStart)} – {fmtShortDate(selected.weekEnd)}
                  </div>
                  <div className="text-2xl font-bold" style={{ color: '#E6EDF3' }}>{fmt(selected.amount)}</div>
                </div>
                <span
                  className="px-3 py-1 rounded-full text-sm font-semibold"
                  style={
                    selected.type === 'finalized'
                      ? { backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ADE80' }
                      : { backgroundColor: 'rgba(245,158,11,0.15)', color: '#FCD34D' }
                  }
                >
                  {selected.type === 'finalized' ? '✓ Finalized' : '⏳ Projected'}
                </span>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
