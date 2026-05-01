'use client'

import { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { SalesTrendDay } from '@/types/shift4'

const REFRESH_MS = 5 * 60 * 1000

export default function SalesTrend() {
  const [days, setDays] = useState(30)
  const [trend, setTrend] = useState<SalesTrendDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/sales-trend?days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setTrend(d.trend); setLastUpdated(new Date()) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [days])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchData])

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
      <div className="flex gap-2">
        {[7, 30, 90].map((r) => (
          <button key={r} onClick={() => setDays(r)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              days === r ? 'bg-purple-700 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>
            {r} days
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Auto-refresh 5 min
        </span>
        <button onClick={fetchData} className="text-purple-600 hover:text-purple-800 font-medium">Refresh now</button>
      </div>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>}
      <div className={`bg-white rounded-lg p-6 shadow-sm transition-opacity ${loading ? 'opacity-50' : ''}`}>
        {trend.length === 0 && !loading
          ? <p className="text-center text-gray-400 py-12">No sales data for this period.</p>
          : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={trend} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }}
                  tickFormatter={(v) => new Date(v + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                  labelFormatter={(l) => new Date(l + 'T12:00:00').toLocaleDateString('en-US', { dateStyle: 'medium' })} />
                <Bar dataKey="grossSales" name="Gross Sales" fill="#5B21B6" radius={[3,3,0,0]} />
                <Bar dataKey="netSales" name="Net Sales" fill="#B8860B" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
      </div>
    </div>
  )
}
