'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { SkeletonCards, SkeletonTable } from './Skeleton'

interface Shift { date: string; start: string; end: string; hours: number }
interface Employee { employee: string; totalHours: number; shifts: Shift[] }
interface Data { startDate: string; endDate: string; employees: Employee[]; totalHours: number }

function hm(h: number) {
  const hrs = Math.floor(h)
  const min = Math.round((h - hrs) * 60)
  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`
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

export default function StaffHoursPublic({ slug }: { slug: string }) {
  const [weekStart, setWeekStart] = useState(() => weekMonday(centralToday()))
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/staff-hours?param=${weekStart}&slug=${encodeURIComponent(slug)}`)
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setData(d)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [weekStart, slug])

  useEffect(() => { fetchData() }, [fetchData])

  const today = centralToday()
  const todayMon = weekMonday(today)
  const options = weekOptions()

  return (
    <div>
      <div className="flex items-center justify-center mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week"
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-gray-500 font-bold">‹</button>
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={weekStart >= todayMon} aria-label="Next week"
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-gray-500 font-bold disabled:opacity-30 disabled:cursor-not-allowed">›</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>}

      {loading && (
        <>
          <SkeletonCards count={3} />
          <SkeletonTable rows={6} />
        </>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-teal-600">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Hours</div>
              <div className="text-xl font-bold text-gray-900">{hm(data.totalHours)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-indigo-500">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Employees</div>
              <div className="text-xl font-bold text-gray-900">{data.employees.length}</div>
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
                    <th className="text-right px-5 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((emp) => (
                    <React.Fragment key={emp.employee}>
                      <tr
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded === emp.employee}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer focus-visible:bg-teal-50"
                        onClick={() => setExpanded(expanded === emp.employee ? null : emp.employee)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpanded(expanded === emp.employee ? null : emp.employee)
                          }
                        }}>
                        <td className="px-5 py-3 font-semibold text-gray-800">{emp.employee}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{emp.shifts.length}</td>
                        <td className="px-5 py-3 text-right font-bold text-yoi-primary">{hm(emp.totalHours)}</td>
                        <td className="px-5 py-3 text-right text-gray-500 text-xs whitespace-nowrap">
                          {expanded === emp.employee ? '▲ Hide' : '▼ Details'}
                        </td>
                      </tr>
                      {expanded === emp.employee && (
                        <tr key={emp.employee + '-detail'} className="bg-gray-50 border-b border-gray-100">
                          <td colSpan={4} className="px-5 py-2">
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
