'use client'

import { useEffect, useMemo, useState } from 'react'

interface LoginEvent {
  username: string
  email: string | null
  logged_in_at: string
  ip_address: string | null
  user_agent: string | null
}

function chicagoDate(utc: string): string {
  // YYYY-MM-DD in America/Chicago
  return new Date(utc).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function fmtDateLabel(yyyymmdd: string): string {
  return new Date(yyyymmdd + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function parseDevice(ua: string | null): string {
  if (!ua) return '—'
  if (/iPhone|iPad/.test(ua)) return '📱 iPhone/iPad'
  if (/Android/.test(ua)) return '📱 Android'
  if (/Windows/.test(ua)) return '🖥 Windows'
  if (/Macintosh|Mac OS/.test(ua)) return '🖥 Mac'
  return '🌐 Browser'
}

export default function Activity() {
  const [logins, setLogins] = useState<LoginEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')

  const load = () => {
    setLoading(true)
    fetch('/api/admin/login-history')
      .then(r => r.json())
      .then(d => {
        const events = d.logins ?? []
        setLogins(events)
        setLastUpdated(new Date())
        // Default to most recent date with activity
        if (events.length > 0 && !selectedDate) {
          setSelectedDate(chicagoDate(events[0].logged_in_at))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Build list of unique dates from logins (newest first)
  const availableDates = useMemo(() => {
    const set = new Set<string>()
    for (const l of logins) set.add(chicagoDate(l.logged_in_at))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [logins])

  // Filter logins for selected date
  const dayEvents = useMemo(
    () => logins.filter(l => chicagoDate(l.logged_in_at) === selectedDate),
    [logins, selectedDate]
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Login Activity</h2>
          <p className="text-xs text-gray-400 mt-0.5">All user logins — most recent first</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button onClick={load} className="text-teal-600 hover:text-teal-800 font-medium">
            Refresh
          </button>
        </div>
      </div>

      {!loading && availableDates.length > 0 && (
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-gray-700">Date:</label>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            {availableDates.map(d => (
              <option key={d} value={d}>{fmtDateLabel(d)}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">
            {dayEvents.length} login{dayEvents.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading activity…</p>
        </div>
      )}

      {!loading && logins.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-400 text-sm">
          No login activity recorded yet.
        </div>
      )}

      {!loading && logins.length > 0 && dayEvents.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-400 text-sm">
          No logins on {fmtDateLabel(selectedDate)}.
        </div>
      )}

      {!loading && dayEvents.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left px-5 py-2.5 font-semibold">User</th>
                <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-2.5 font-semibold">Time</th>
                <th className="text-left px-4 py-2.5 font-semibold hidden md:table-cell">Device</th>
                <th className="text-left px-4 py-2.5 font-semibold hidden lg:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {dayEvents.map((e, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-semibold text-gray-800">{e.username}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {e.email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(e.logged_in_at).toLocaleTimeString('en-US', {
                      timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true,
                    })} CDT
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {parseDevice(e.user_agent)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs hidden lg:table-cell">
                    {e.ip_address ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
