'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Stats {
  total: number
  today: number
  last7d: number
  devices: { ios: number; android: number; desktop: number; other: number }
  topCountries: [string, number][]
  dailyChart: { date: string; visits: number }[]
}

const COUNTRY_FLAG: Record<string, string> = {
  US: '🇺🇸', IN: '🇮🇳', GB: '🇬🇧', CA: '🇨🇦', AU: '🇦🇺',
  DE: '🇩🇪', FR: '🇫🇷', JP: '🇯🇵', SG: '🇸🇬', AE: '🇦🇪',
  MX: '🇲🇽', BR: '🇧🇷', NZ: '🇳🇿', ZA: '🇿🇦', PK: '🇵🇰',
}

const DEVICE_COLORS = {
  ios:     { bg: 'bg-blue-100',  text: 'text-blue-700',  bar: '#3B82F6', icon: '📱 iPhone / iPad' },
  android: { bg: 'bg-green-100', text: 'text-green-700', bar: '#22C55E', icon: '📱 Android' },
  desktop: { bg: 'bg-purple-100',text: 'text-purple-700',bar: '#7C3AED', icon: '🖥 Desktop' },
  other:   { bg: 'bg-gray-100',  text: 'text-gray-600',  bar: '#9CA3AF', icon: '❓ Other' },
}

function pct(n: number, total: number) {
  if (!total) return '0%'
  return Math.round((n / total) * 100) + '%'
}

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Visitors() {
  const [stats, setStats]     = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [updated, setUpdated] = useState<Date | null>(null)

  const fetchStats = () => {
    setLoading(true)
    fetch('/api/analytics/stats')
      .then((r) => r.json())
      .then((d) => { setStats(d); setUpdated(new Date()) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchStats() }, [])

  const deviceTotal = stats
    ? stats.devices.ios + stats.devices.android + stats.devices.desktop + stats.devices.other
    : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-gray-800">Visitor Analytics</h2>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {updated && <span>Updated {updated.toLocaleTimeString()}</span>}
          <button onClick={fetchStats} className="text-purple-600 hover:text-purple-800 font-medium">
            Refresh now
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading visitor stats…</p>
        </div>
      )}

      {!loading && stats && (
        <>
          {/* ── Top summary ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-purple-600">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Visits</div>
              <div className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-indigo-500">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Today</div>
              <div className="text-2xl font-bold text-gray-900">{stats.today.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-green-500">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Last 7 Days</div>
              <div className="text-2xl font-bold text-gray-900">{stats.last7d.toLocaleString()}</div>
            </div>
          </div>

          {/* ── Daily chart ────────────────────────────────────────────── */}
          {stats.dailyChart.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-5 mb-6">
              <h3 className="font-semibold text-gray-800 mb-4">Daily Visits (last 14 days)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.dailyChart} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={fmtDate} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                  <Tooltip
                    formatter={(v: number) => [v, 'Visits']}
                    labelFormatter={fmtDate}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                  />
                  <Bar dataKey="visits" fill="#7C3AED" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ── Device breakdown ─────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Devices</h3>
              <div className="space-y-3">
                {(Object.entries(stats.devices) as [keyof typeof DEVICE_COLORS, number][])
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, count]) => {
                    const c = DEVICE_COLORS[key]
                    const p = pct(count, deviceTotal)
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-700">{c.icon}</span>
                          <span className="font-semibold text-gray-900">{count} <span className="text-gray-400 font-normal">({p})</span></span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.bg.replace('100', '500')}`}
                            style={{ width: p, transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* ── Top countries ────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Top Locations</h3>
              {stats.topCountries.length === 0 ? (
                <p className="text-sm text-gray-400">No location data yet.</p>
              ) : (
                <div className="space-y-2">
                  {stats.topCountries.map(([code, count]) => (
                    <div key={code} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">
                        {COUNTRY_FLAG[code] ?? '🌐'} {code}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-400 rounded-full"
                            style={{ width: pct(count, stats.total) }} />
                        </div>
                        <span className="text-sm font-semibold text-gray-900 w-8 text-right">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {stats.total === 0 && (
            <p className="text-center text-gray-400 text-sm mt-6">
              No visits recorded yet — data will appear after someone opens the dashboard.
            </p>
          )}
        </>
      )}
    </div>
  )
}
