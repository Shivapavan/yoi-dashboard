'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { SkeletonCards, SkeletonTable } from './Skeleton'

interface Shift { date: string; start: string; end: string; hours: number }
interface Employee { employee: string; totalHours: number; pay: number; paid: number; balance: number; shifts: Shift[] }
interface Data {
  startDate: string; endDate: string; employees: Employee[]
  totalHours: number; totalPay: number; totalPaid: number; totalBalance: number
}

function hm(h: number) {
  const hrs = Math.floor(h)
  const min = Math.round((h - hrs) * 60)
  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`
}
function money(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function addDays(s: string, n: number) {
  const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function weekMonday(s: string) {
  const d = new Date(s + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().split('T')[0]
}
function centralToday() {
  return new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

// Generate all Mondays from Jun 1 2026 (first payroll week this page covers) to the current week.
function weekOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = []
  let cur = weekMonday('2026-06-01')
  const last = weekMonday(centralToday())
  while (cur <= last) {
    const end = addDays(cur, 6)
    options.push({ value: cur, label: `${fmtDate(cur)} – ${fmtDate(end)}` })
    cur = addDays(cur, 7)
  }
  return options.reverse() // most recent first
}

// Real pay cycle is semi-monthly (1st–15th, 16th–end of month), not calendar weeks.
function semiMonthStartFor(dateStr: string) {
  const monthPrefix = dateStr.slice(0, 7)
  const day = Number(dateStr.slice(8, 10))
  return day <= 15 ? `${monthPrefix}-01` : `${monthPrefix}-16`
}
function semiMonthOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = []
  let y = 2026, m = 6
  const todayStr = centralToday()
  while (`${y}-${String(m).padStart(2, '0')}` <= todayStr.slice(0, 7)) {
    const monthPrefix = `${y}-${String(m).padStart(2, '0')}`
    const lastDay = new Date(y, m, 0).getDate()
    const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })
    options.push({ value: `${monthPrefix}-01`, label: `${monthLabel} 1–15` })
    options.push({ value: `${monthPrefix}-16`, label: `${monthLabel} 16–${lastDay}` })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return options.filter((o) => o.value <= todayStr).reverse()
}

type PeriodType = 'weekly' | 'semimonthly'

export default function StaffHoursPublic({ slug }: { slug: string }) {
  const [periodType, setPeriodType] = useState<PeriodType>('weekly')
  const [weekStart, setWeekStart] = useState(() => weekMonday(centralToday()))
  const [semiMonthStart, setSemiMonthStart] = useState(() => semiMonthStartFor(centralToday()))
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [paidDrafts, setPaidDrafts] = useState<Record<string, string>>({})
  const [savingEmployee, setSavingEmployee] = useState<string | null>(null)

  const periodParam = periodType === 'weekly' ? weekStart : semiMonthStart

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/staff-hours?param=${periodParam}&view=${periodType}&slug=${encodeURIComponent(slug)}`)
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setData(d)
      setPaidDrafts({})
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [periodParam, periodType, slug])

  useEffect(() => { fetchData() }, [fetchData])

  const savePaid = async (employee: string, amount: number) => {
    if (!data) return
    setSavingEmployee(employee)
    try {
      const r = await fetch(`/api/staff-hours?slug=${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee, periodStart: data.startDate, periodEnd: data.endDate, paidAmount: amount }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      await fetchData()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSavingEmployee(null)
    }
  }

  const today = centralToday()
  const todayWeekMon = weekMonday(today)
  const todaySemiStart = semiMonthStartFor(today)
  const weekOpts = weekOptions()
  const semiOpts = semiMonthOptions()

  const atLatestPeriod = periodType === 'weekly' ? weekStart >= todayWeekMon : semiMonthStart >= todaySemiStart

  const goPrev = () => {
    if (periodType === 'weekly') { setWeekStart(addDays(weekStart, -7)); return }
    setSemiMonthStart((cur) => {
      const [y, m] = cur.split('-').map(Number)
      if (cur.endsWith('-16')) return `${cur.slice(0, 7)}-01`
      const prevY = m === 1 ? y - 1 : y
      const prevM = m === 1 ? 12 : m - 1
      return `${prevY}-${String(prevM).padStart(2, '0')}-16`
    })
  }
  const goNext = () => {
    if (periodType === 'weekly') { setWeekStart(addDays(weekStart, 7)); return }
    setSemiMonthStart((cur) => {
      const [y, m] = cur.split('-').map(Number)
      if (cur.endsWith('-01')) return `${cur.slice(0, 7)}-16`
      const nextY = m === 12 ? y + 1 : y
      const nextM = m === 12 ? 1 : m + 1
      return `${nextY}-${String(nextM).padStart(2, '0')}-01`
    })
  }

  return (
    <div>
      <div className="flex items-center justify-center mb-3">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {(['weekly', 'semimonthly'] as PeriodType[]).map((value) => (
            <button
              key={value}
              onClick={() => setPeriodType(value)}
              className={`px-3.5 py-1.5 text-sm font-semibold ${periodType === value ? 'bg-yoi-primary text-white' : 'bg-white text-gray-700'}`}
            >
              {value === 'weekly' ? 'Weekly' : 'Semi-Monthly'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center mb-5">
        <div className="flex items-center gap-3">
          <button onClick={goPrev} aria-label="Previous period"
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-gray-500 font-bold">‹</button>
          <select
            value={periodParam}
            onChange={(e) => periodType === 'weekly' ? setWeekStart(e.target.value) : setSemiMonthStart(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer"
          >
            {(periodType === 'weekly' ? weekOpts : semiOpts).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button onClick={goNext} disabled={atLatestPeriod} aria-label="Next period"
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-gray-500 font-bold disabled:opacity-30 disabled:cursor-not-allowed">›</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>}

      {loading && (
        <>
          <SkeletonCards count={4} />
          <SkeletonTable rows={6} />
        </>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-teal-600">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Hours</div>
              <div className="text-xl font-bold text-gray-900">{hm(data.totalHours)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-amber-600">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Amount</div>
              <div className="text-xl font-bold text-gray-900">{money(data.totalPay)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-green-600">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Paid</div>
              <div className="text-xl font-bold text-gray-900">{money(data.totalPaid ?? 0)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-red-600">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Balance</div>
              <div className="text-xl font-bold text-gray-900">{money(data.totalBalance ?? 0)}</div>
            </div>
          </div>

          {data.employees.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">No shift data for this period.</p>
          ) : (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold">Employee</th>
                    <th className="text-center px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold">Shifts</th>
                    <th className="text-right px-5 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold">Total Hours</th>
                    <th className="text-right px-5 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold">Pay</th>
                    <th className="text-right px-5 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold">Paid</th>
                    <th className="text-right px-5 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold">Balance</th>
                    <th className="text-right px-5 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((emp) => {
                    const draft = paidDrafts[emp.employee]
                    const paidValue = draft !== undefined ? draft : String(emp.paid ?? 0)
                    return (
                      <React.Fragment key={emp.employee}>
                        <tr className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-3 font-semibold text-gray-800 cursor-pointer"
                            onClick={() => setExpanded(expanded === emp.employee ? null : emp.employee)}>
                            {emp.employee}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">{emp.shifts.length}</td>
                          <td className="px-5 py-3 text-right font-bold text-yoi-primary">{hm(emp.totalHours)}</td>
                          <td className="px-5 py-3 text-right font-bold text-amber-700">{money(emp.pay)}</td>
                          <td className="px-5 py-3 text-right">
                            <input
                              type="number" step="0.01" min="0"
                              value={paidValue}
                              disabled={savingEmployee === emp.employee}
                              onChange={(e) => setPaidDrafts((cur) => ({ ...cur, [emp.employee]: e.target.value }))}
                              onBlur={(e) => {
                                const n = Number(e.target.value)
                                if (Number.isFinite(n) && n >= 0 && n !== emp.paid) savePaid(emp.employee, n)
                              }}
                              className="w-24 text-right px-2 py-1 rounded border border-gray-200 text-sm font-semibold text-green-700 focus:outline-none focus:ring-2 focus:ring-teal-300"
                            />
                          </td>
                          <td className={`px-5 py-3 text-right font-bold ${emp.balance > 0.01 ? 'text-red-600' : 'text-gray-500'}`}>{money(emp.balance)}</td>
                          <td className="px-5 py-3 text-right text-gray-500 text-xs whitespace-nowrap cursor-pointer"
                            onClick={() => setExpanded(expanded === emp.employee ? null : emp.employee)}>
                            {expanded === emp.employee ? '▲ Hide' : '▼ Details'}
                          </td>
                        </tr>
                        {expanded === emp.employee && (
                          <tr key={emp.employee + '-detail'} className="bg-gray-50 border-b border-gray-100">
                            <td colSpan={7} className="px-5 py-2">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-400">
                                    <th className="text-left py-1 pr-4">Date</th>
                                    <th className="text-left py-1 pr-4">Clock In</th>
                                    <th className="text-left py-1 pr-4">Clock Out</th>
                                    <th className="text-right py-1">Hours</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {emp.shifts.map((s, i) => (
                                    <tr key={i}>
                                      <td className="py-1 pr-4 text-gray-700">{s.date}</td>
                                      <td className="py-1 pr-4 text-gray-500">{s.start}</td>
                                      <td className="py-1 pr-4 text-gray-500">{s.end}</td>
                                      <td className="py-1 text-right text-gray-700">{s.hours}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
