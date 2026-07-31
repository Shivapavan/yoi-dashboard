'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
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
function todayStr() {
  return new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}
function thisMonthStr() { return todayStr().slice(0, 7) }

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

function monthOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = []
  const start = new Date(2025, 7, 1)
  const [y, m] = thisMonthStr().split('-').map(Number)
  const end = new Date(y, m - 1, 1)
  const cur = new Date(start)
  while (cur <= end) {
    const value = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    const label = cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    options.push({ value, label })
    cur.setMonth(cur.getMonth() + 1)
  }
  return options.reverse()
}

const selectStyle: React.CSSProperties = {
  backgroundColor: '#F5F6FD',
  border: '1px solid #E4E7F3',
  color: '#1E1B4B',
}

function NavBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-9 h-9 flex items-center justify-center rounded-full font-bold text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      style={{ border: '1px solid #E4E7F3', color: '#64748B', backgroundColor: '#FFFFFF' }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.backgroundColor = '#F5F6FD')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
    >
      {children}
    </button>
  )
}

function RevenueTable({ title, rows, accentColor }: { title: string; rows: RevenueRow[]; accentColor: string }) {
  const dataRows = rows.filter((r) => !r.label.startsWith('Total'))
  const totalRow = rows.find((r) => r.label.startsWith('Total'))
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}>
      <div
        className="px-5 py-3"
        style={{ borderLeft: `4px solid ${accentColor}`, borderBottom: '1px solid #E4E7F3' }}
      >
        <h4 className="font-semibold text-sm" style={{ color: '#1E1B4B' }}>{title}</h4>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #E4E7F3' }}>
            <th className="text-left px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#94A3B8' }}>Category</th>
            <th className="text-right px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#94A3B8' }}>Count</th>
            <th className="text-right px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#94A3B8' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {dataRows.map((r) => (
            <tr key={r.label} style={{ borderBottom: '1px solid #F0F2FA' }} className="last:border-0">
              <td className="px-5 py-2.5" style={{ color: '#4B5563' }}>{r.label}</td>
              <td className="px-5 py-2.5 text-right" style={{ color: '#94A3B8' }}>{r.count ?? '—'}</td>
              <td className="px-5 py-2.5 text-right font-semibold" style={{ color: '#0D9488' }}>{fmt(r.amount)}</td>
            </tr>
          ))}
        </tbody>
        {totalRow && (
          <tfoot>
            <tr style={{ borderTop: '1px solid #E4E7F3', backgroundColor: '#F5F6FD' }}>
              <td className="px-5 py-2.5 font-bold" style={{ color: '#1E1B4B' }}>{totalRow.label.replace(':', '')}</td>
              <td className="px-5 py-2.5 text-right font-bold" style={{ color: '#1E1B4B' }}>{totalRow.count ?? '—'}</td>
              <td className="px-5 py-2.5 text-right font-bold" style={{ color: '#0D9488' }}>{fmt(totalRow.amount)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export default function SalesTrend() {
  type DDPayout = { weekStart: string; weekEnd: string; amount: number; type: 'projected' | 'finalized' }
  type DDEarnings = {
    weekStart: string; weekEnd: string; grossSales: number
    marketplace: number; dashpass: number; pickup: number
    orderVolume: number; avgTicket: number
  }

  const [view, setView] = useState<View>('daily')
  const [weekStart, setWeekStart] = useState(() => weekMonday(todayStr()))
  const [month, setMonth] = useState(thisMonthStr)
  const [ddPayouts, setDdPayouts] = useState<DDPayout[]>([])
  const [ddEarnings, setDdEarnings] = useState<DDEarnings[]>([])
  const [ddWeek, setDdWeek] = useState('')
  const [dailyMonth, setDailyMonth] = useState(thisMonthStr)
  const [trend, setTrend] = useState<any[]>([])
  const [activityData, setActivityData] = useState<ActivityData | null>(null)
  const [cateringCash, setCateringCash] = useState<{ total: number; sheetName: string } | null>(null)
  const [dailyPeriodLabel, setDailyPeriodLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/doordash-payouts')
      .then(r => r.json())
      .then(d => {
        if (d.payouts?.length) {
          setDdPayouts(d.payouts)
          setDdWeek(d.payouts[0].weekStart)
        }
        if (d.earningsSummaries?.length) setDdEarnings(d.earningsSummaries)
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
        const r1 = await fetch(url + '&lite=true')
        const d1 = await r1.json()
        if (d1.error) throw new Error(d1.error)
        setTrend(d1.trend ?? [])
        if (d1.periodLabel) setDailyPeriodLabel(d1.periodLabel)
        setLoading(false)

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

  const chartTooltipStyle = {
    backgroundColor: '#1E1B4B',
    border: '1px solid #312E81',
    borderRadius: 10,
    fontSize: 12,
    color: '#E0E7FF',
  }

  return (
    <div>
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex gap-1 rounded-xl p-1"
            style={{ backgroundColor: '#F0F2FA', border: '1px solid #E4E7F3' }}
          >
            {(['daily', 'weekly', 'monthly'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-5 py-1.5 rounded-lg text-sm font-medium transition-all capitalize"
                style={
                  view === v
                    ? { background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: '#fff', boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }
                    : { color: '#64748B', backgroundColor: 'transparent' }
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
                className="px-3 py-1 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
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
        <div className="flex items-center gap-3 text-xs" style={{ color: '#94A3B8' }}>
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Auto-refresh 5 min
          </span>
          <button onClick={() => fetchData(true)} className="font-medium" style={{ color: '#4F46E5' }}>Refresh now</button>
        </div>
      </div>

      {/* ── Period navigator ─────────────────────────────────────────────── */}
      {view === 'weekly' && (
        <div className="flex items-center justify-center gap-3 mb-4">
          <NavBtn onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</NavBtn>
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
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
            className="px-3 py-1.5 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
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
          style={{ backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: '#DC2626' }}
        >
          {error}
        </div>
      )}

      {/* ── Summary mini-cards ────────────────────────────────────────────── */}
      {(trend.length > 0 || activityData) && (
        <div className={`grid grid-cols-2 gap-3 mb-4 ${showCatering ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-3 lg:grid-cols-5'}`}>
          {[
            { label: 'Total Gross',   value: fmt(totalGross),                              borderColor: '#4F46E5' },
            { label: 'Total Net',     value: fmt(totalNet),                                borderColor: '#D946EF' },
            { label: 'Avg / Day',     value: avgGross > 0 ? fmt(avgGross) : '—',           borderColor: '#0D9488' },
            { label: 'Best Day',      value: best?.grossSales > 0 ? fmt(best.grossSales) : '—', borderColor: '#F59E0B', sub: bestLabel },
            { label: 'Cash Received', value: fmt(totalCash),                               borderColor: '#10B981' },
            ...(showCatering ? [{
              label: `${dailyPeriodLabel ? fmtMonth(dailyPeriodLabel) : ''} CAT CAH`,
              value: fmt(cateringCash!.total),
              borderColor: '#F97316',
            }] : []),
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl p-4"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', borderLeft: `4px solid ${card.borderColor}`, boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
            >
              <div className="text-xs uppercase tracking-wide mb-1" style={{ color: '#94A3B8' }}>{card.label}</div>
              <div className="text-xl font-bold" style={{ color: '#1E1B4B' }}>{card.value}</div>
              {card.sub && <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>{card.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Chart ────────────────────────────────────────────────────────── */}
      <div
        className={`rounded-xl p-6 transition-opacity ${loading ? 'opacity-50' : ''}`}
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
      >
        {!hasChartData && !loading ? (
          <p className="text-center py-12" style={{ color: '#94A3B8' }}>No sales data for this period.</p>
        ) : view === 'daily' ? (
          /* Smooth area chart for daily — Dashcom style */
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={activeDays} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="grossGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D946EF" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#D946EF" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F2FA" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={fmtShortDate}
                interval={Math.max(0, Math.floor(activeDays.length / 10) - 1)} axisLine={{ stroke: '#E4E7F3' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(v) => `$${v.toLocaleString()}`} width={72}
                domain={[0, (max: number) => Math.max(max, 100)]} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number, n: string) => [fmt(v), n]} labelFormatter={fmtFullDate}
                contentStyle={chartTooltipStyle}
                labelStyle={{ color: '#A5B4FC' }} cursor={{ stroke: '#4F46E5', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Legend wrapperStyle={{ color: '#64748B', fontSize: 12 }} />
              <Area type="monotone" dataKey="grossSales" name="Gross Sales" stroke="#4F46E5" strokeWidth={2.5}
                fill="url(#grossGradient)" dot={false} activeDot={{ r: 5, fill: '#4F46E5' }} />
              <Area type="monotone" dataKey="netSales" name="Net Sales" stroke="#D946EF" strokeWidth={2.5}
                fill="url(#netGradient)" dot={false} activeDot={{ r: 5, fill: '#D946EF' }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          /* Bar chart for weekly/monthly */
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={trend} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F2FA" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }}
                interval={view === 'monthly' ? Math.max(0, Math.floor(trend.length / 15) - 1) : 0}
                axisLine={{ stroke: '#E4E7F3' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(v) => `$${v.toLocaleString()}`} width={72}
                domain={[0, (max: number) => Math.max(max, 100)]} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number, n: string) => [fmt(v), n]} labelFormatter={tooltipTitle}
                contentStyle={chartTooltipStyle}
                labelStyle={{ color: '#A5B4FC' }} cursor={{ fill: 'rgba(79,70,229,0.05)' }} />
              <Legend wrapperStyle={{ color: '#64748B', fontSize: 12 }} />
              <Bar dataKey="grossSales" name="Gross Sales" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="netSales" name="Net Sales" fill="#D946EF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Revenue class tables ─────────────────────────────────────────── */}
      {activityData && activityData.grossByRevenue.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <RevenueTable title="Gross Sales by Revenue Class" rows={activityData.grossByRevenue} accentColor="#4F46E5" />
          <RevenueTable title="Net Sales by Revenue Class" rows={activityData.netByRevenue} accentColor="#D946EF" />
        </div>
      )}

      {/* ── Order Type Breakdown ─────────────────────────────────────────── */}
      {activityData && activityData.orderTypes && activityData.orderTypes.length > 0 && (
        <div
          className="mt-4 rounded-xl overflow-hidden"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
        >
          <div className="px-5 py-3" style={{ borderLeft: '4px solid #0D9488', borderBottom: '1px solid #E4E7F3' }}>
            <h4 className="font-semibold text-sm" style={{ color: '#1E1B4B' }}>Sales by Order Type</h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #E4E7F3' }}>
                <th className="text-left px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#94A3B8' }}>Type</th>
                <th className="text-right px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#94A3B8' }}>Orders</th>
                <th className="text-right px-5 py-2 text-xs uppercase tracking-wide font-semibold" style={{ color: '#94A3B8' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {activityData.orderTypes.map((ot) => (
                <tr key={ot.type} style={{ borderBottom: '1px solid #F0F2FA' }} className="last:border-0">
                  <td className="px-5 py-2.5" style={{ color: '#4B5563' }}>{ot.type}</td>
                  <td className="px-5 py-2.5 text-right" style={{ color: '#94A3B8' }}>{ot.count > 0 ? ot.count : '—'}</td>
                  <td className="px-5 py-2.5 text-right font-semibold" style={{ color: '#0D9488' }}>{fmt(ot.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DoorDash Payouts + Earnings breakdown — weekly and monthly views */}
      {(view === 'weekly' || view === 'monthly') && (ddPayouts.length > 0 || ddEarnings.length > 0) && (() => {
        const breakdownGrid = (rows: Array<[string, string]>) => (
          <div className="px-5 pb-4 pt-4 grid grid-cols-3 sm:grid-cols-6 gap-2 border-t" style={{ borderColor: '#E4E7F3' }}>
            {rows.map(([label, val]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: '#94A3B8' }}>{label}</div>
                <div className="text-sm font-bold" style={{ color: '#1E1B4B' }}>{val}</div>
              </div>
            ))}
          </div>
        )

        if (view === 'weekly') {
          if (ddPayouts.length === 0) return null
          const selected = ddPayouts.find(p => p.weekStart === ddWeek) ?? ddPayouts[0]
          const selectedEarnings = ddEarnings.find(e => e.weekStart === (selected?.weekStart ?? ddWeek))
          const totalAll = ddPayouts.reduce((s, p) => s + p.amount, 0)
          return (
            <div
              className="mt-6 rounded-xl overflow-hidden"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
            >
              <div
                className="px-5 py-4 flex items-center justify-between flex-wrap gap-3"
                style={{ borderLeft: '4px solid #EF4444', borderBottom: '1px solid #E4E7F3' }}
              >
                <div>
                  <h4 className="font-semibold" style={{ color: '#1E1B4B' }}>🚗 DoorDash Payout</h4>
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Auto-synced from email · Total {ddPayouts.length} weeks: {fmt(totalAll)}</p>
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
                    <div className="text-xs uppercase tracking-wide mb-1" style={{ color: '#94A3B8' }}>
                      {fmtShortDate(selected.weekStart)} – {fmtShortDate(selected.weekEnd)}
                    </div>
                    <div className="text-2xl font-bold" style={{ color: '#1E1B4B' }}>{fmt(selected.amount)}</div>
                  </div>
                  <span
                    className="px-3 py-1 rounded-full text-sm font-semibold"
                    style={
                      selected.type === 'finalized'
                        ? { backgroundColor: 'rgba(16,185,129,0.1)', color: '#059669' }
                        : { backgroundColor: 'rgba(245,158,11,0.1)', color: '#D97706' }
                    }
                  >
                    {selected.type === 'finalized' ? '✓ Finalized' : '⏳ Projected'}
                  </span>
                </div>
              )}
              {selectedEarnings && breakdownGrid([
                ['Gross Sales', fmt(selectedEarnings.grossSales)],
                ['Marketplace', fmt(selectedEarnings.marketplace)],
                ['DashPass', fmt(selectedEarnings.dashpass)],
                ['Pickup', fmt(selectedEarnings.pickup)],
                ['Orders', String(selectedEarnings.orderVolume)],
                ['Avg Ticket', fmt(selectedEarnings.avgTicket)],
              ])}
            </div>
          )
        }

        // Monthly: aggregate all weeks whose weekStart falls in the selected month
        const monthPayouts = ddPayouts.filter(p => p.weekStart.slice(0, 7) === month)
        const monthEarnings = ddEarnings.filter(e => e.weekStart.slice(0, 7) === month)
        if (monthPayouts.length === 0 && monthEarnings.length === 0) return null

        const monthTotal = monthPayouts.reduce((s, p) => s + p.amount, 0)
        const mGross    = monthEarnings.reduce((s, e) => s + e.grossSales, 0)
        const mMarket   = monthEarnings.reduce((s, e) => s + e.marketplace, 0)
        const mDashpass = monthEarnings.reduce((s, e) => s + e.dashpass, 0)
        const mPickup   = monthEarnings.reduce((s, e) => s + e.pickup, 0)
        const mVolume   = monthEarnings.reduce((s, e) => s + e.orderVolume, 0)
        const mAvgTicket = mVolume > 0 ? mGross / mVolume : 0

        return (
          <div
            className="mt-6 rounded-xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
          >
            <div className="px-5 py-4" style={{ borderLeft: '4px solid #EF4444', borderBottom: '1px solid #E4E7F3' }}>
              <h4 className="font-semibold" style={{ color: '#1E1B4B' }}>🚗 DoorDash Payout — {fmtMonth(month)}</h4>
              <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                Auto-synced from email · {monthPayouts.length} week{monthPayouts.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs uppercase tracking-wide mb-1" style={{ color: '#94A3B8' }}>Total Payout</div>
              <div className="text-2xl font-bold" style={{ color: '#1E1B4B' }}>{fmt(monthTotal)}</div>
            </div>
            {monthEarnings.length > 0 && breakdownGrid([
              ['Gross Sales', fmt(mGross)],
              ['Marketplace', fmt(mMarket)],
              ['DashPass', fmt(mDashpass)],
              ['Pickup', fmt(mPickup)],
              ['Orders', String(mVolume)],
              ['Avg Ticket', fmt(mAvgTicket)],
            ])}
          </div>
        )
      })()}
    </div>
  )
}
