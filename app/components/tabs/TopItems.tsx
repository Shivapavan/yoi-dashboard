'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import DatePicker from '../DatePicker'

const REFRESH_MS = 5 * 60 * 1000

type SortBy = 'revenue' | 'quantity'

interface Item { name: string; count: number; revenue: number }

export default function TopItems() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [items, setItems] = useState<Item[]>([])
  const [sortBy, setSortBy] = useState<SortBy>('revenue')
  const [recommendedDate, setRecommendedDate] = useState('')
  const [noData, setNoData] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const isFirstLoad = useRef(true)

  const fetchData = useCallback((d: string, autoRedirect = false) => {
    if (!d) return
    setLoading(true)
    setError(null)
    setNoData(false)

    fetch(`/api/top-items?date=${d}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.error) throw new Error(res.error)
        setRecommendedDate(res.recommendedDate)

        // First load: auto-switch to last date with data
        if (autoRedirect && res.items.length === 0 && res.recommendedDate && res.recommendedDate !== d) {
          setDate(res.recommendedDate)
          return
        }

        if (res.items.length === 0) setNoData(true)
        setItems(res.items)
        setLastUpdated(new Date())
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      setDate(today)
      fetchData(today, true)
    }
  }, [today, fetchData])

  useEffect(() => {
    if (!date || isFirstLoad.current) return
    fetchData(date, false)
    const interval = setInterval(() => fetchData(date, false), REFRESH_MS)
    return () => clearInterval(interval)
  }, [date, fetchData])

  const sorted = [...items].sort((a, b) =>
    sortBy === 'revenue' ? b.revenue - a.revenue : b.count - a.count
  )

  return (
    <div>
      <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <DatePicker value={date} onChange={setDate} />
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Auto-refresh 5 min
            </span>
            <button onClick={() => fetchData(date, false)} className="text-purple-600 hover:text-purple-800 font-medium">
              Refresh now
            </button>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>}

      {noData && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3 mb-4 text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>
            No items data for {date} — not yet scraped.
            {recommendedDate && (
              <button onClick={() => setDate(recommendedDate)} className="ml-2 underline font-medium hover:text-yellow-900">
                Go to {recommendedDate} (last available)
              </button>
            )}
          </span>
        </div>
      )}

      {!noData && items.length > 0 && (
        <>
          {/* Sort toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSortBy('revenue')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                sortBy === 'revenue'
                  ? 'bg-purple-700 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Sort by Revenue ↓
            </button>
            <button
              onClick={() => setSortBy('quantity')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                sortBy === 'quantity'
                  ? 'bg-purple-700 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Sort by Quantity ↓
            </button>
          </div>

          <div className={`bg-white rounded-lg shadow-sm transition-opacity ${loading ? 'opacity-50' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold">
                  <th className="text-left px-6 py-3">#</th>
                  <th className="text-left px-6 py-3">Item</th>
                  <th
                    className={`px-6 py-3 text-right cursor-pointer select-none hover:text-purple-600 ${sortBy === 'quantity' ? 'text-purple-700 font-bold' : ''}`}
                    onClick={() => setSortBy('quantity')}
                  >
                    Qty {sortBy === 'quantity' ? '↓' : ''}
                  </th>
                  <th
                    className={`px-6 py-3 text-right cursor-pointer select-none hover:text-purple-600 ${sortBy === 'revenue' ? 'text-purple-700 font-bold' : ''}`}
                    onClick={() => setSortBy('revenue')}
                  >
                    Revenue {sortBy === 'revenue' ? '↓' : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, i) => (
                  <tr key={item.name} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                    <td className="px-6 py-3 font-medium text-gray-800">{item.name}</td>
                    <td className={`px-6 py-3 text-right ${sortBy === 'quantity' ? 'font-bold text-purple-700' : 'text-gray-600'}`}>
                      {item.count}
                    </td>
                    <td className={`px-6 py-3 text-right ${sortBy === 'revenue' ? 'font-bold text-purple-700' : 'text-gray-700'}`}>
                      ${item.revenue.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
