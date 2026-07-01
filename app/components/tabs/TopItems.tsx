'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import DatePicker from '../DatePicker'

const REFRESH_MS = 5 * 60 * 1000

type SortBy = 'revenue' | 'quantity'

interface Item { name: string; count: number; revenue: number }

export default function TopItems() {
  const today = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const [date, setDate] = useState(today)
  const [items, setItems] = useState<Item[]>([])
  const [orderTypes, setOrderTypes] = useState<{type:string;amount:number}[]>([])
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

        if (autoRedirect && !res.live && res.items.length === 0 && res.recommendedDate && res.recommendedDate !== d) {
          setDate(res.recommendedDate)
          return
        }

        if (!res.live && res.items.length === 0) setNoData(true)
        setItems(res.items)
        setOrderTypes(res.orderTypes ?? [])
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
      <div
        className="rounded-xl p-4 mb-6"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <DatePicker value={date} onChange={setDate} />
          <div className="flex items-center gap-3 text-xs" style={{ color: '#94A3B8' }}>
            {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Auto-refresh 5 min
            </span>
            <button onClick={() => fetchData(date, false)} className="font-medium" style={{ color: '#4F46E5' }}>
              Refresh now
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl p-3 mb-4 text-sm"
          style={{ backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: '#DC2626' }}
        >
          {error}
        </div>
      )}

      {noData && (
        <div
          className="rounded-xl p-3 mb-4 text-sm flex items-center gap-2"
          style={{ backgroundColor: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', color: '#B45309' }}
        >
          <span>⚠️</span>
          <span>
            No items data for {date} — not yet scraped.
            {recommendedDate && (
              <button onClick={() => setDate(recommendedDate)} className="ml-2 underline font-medium" style={{ color: '#B45309' }}>
                Go to {recommendedDate} (last available)
              </button>
            )}
          </span>
        </div>
      )}

      {!noData && items.length > 0 && (
        <>
          {/* Order type summary */}
          {orderTypes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {orderTypes.map((ot) => {
                const style = ot.type === 'Dine In'
                  ? { backgroundColor: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)' }
                  : ot.type === 'To Go'
                  ? { backgroundColor: 'rgba(16,185,129,0.08)', color: '#059669', border: '1px solid rgba(16,185,129,0.25)' }
                  : { backgroundColor: '#F5F6FD', color: '#64748B', border: '1px solid #E4E7F3' }
                return (
                  <div key={ot.type} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium" style={style}>
                    <span>{ot.type === 'Dine In' ? '🍽' : ot.type === 'To Go' ? '🥡' : '📦'}</span>
                    <span>{ot.type}</span>
                    <span className="font-bold">${ot.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )
              })}
            </div>
          )}
          {/* Sort toggle */}
          <div className="flex gap-2 mb-4">
            {(['revenue', 'quantity'] as SortBy[]).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={
                  sortBy === s
                    ? { background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: '#fff', boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }
                    : { backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', color: '#64748B' }
                }
              >
                Sort by {s === 'revenue' ? 'Revenue' : 'Quantity'} ↓
              </button>
            ))}
          </div>

          <div
            className={`rounded-xl overflow-hidden transition-opacity ${loading ? 'opacity-50' : ''}`}
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #E4E7F3' }} className="text-xs uppercase font-semibold">
                  <th className="text-left px-6 py-3" style={{ color: '#94A3B8' }}>#</th>
                  <th className="text-left px-6 py-3" style={{ color: '#94A3B8' }}>Item</th>
                  <th className="px-6 py-3 text-right" aria-sort={sortBy === 'quantity' ? 'descending' : 'none'}>
                    <button
                      onClick={() => setSortBy('quantity')}
                      className="uppercase select-none transition-colors"
                      style={{ color: sortBy === 'quantity' ? '#4F46E5' : '#94A3B8', fontWeight: sortBy === 'quantity' ? '700' : undefined }}
                    >
                      Qty {sortBy === 'quantity' ? '↓' : ''}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-right" aria-sort={sortBy === 'revenue' ? 'descending' : 'none'}>
                    <button
                      onClick={() => setSortBy('revenue')}
                      className="uppercase select-none transition-colors"
                      style={{ color: sortBy === 'revenue' ? '#4F46E5' : '#94A3B8', fontWeight: sortBy === 'revenue' ? '700' : undefined }}
                    >
                      Revenue {sortBy === 'revenue' ? '↓' : ''}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, i) => (
                  <tr
                    key={item.name}
                    style={{ borderBottom: '1px solid #F0F2FA', backgroundColor: 'transparent' }}
                    className="last:border-0 transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F5F6FD')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td className="px-6 py-3 font-mono text-xs" style={{ color: '#94A3B8' }}>{i + 1}</td>
                    <td className="px-6 py-3 font-medium" style={{ color: '#1E1B4B' }}>{item.name}</td>
                    <td className="px-6 py-3 text-right" style={{ color: sortBy === 'quantity' ? '#4F46E5' : '#94A3B8', fontWeight: sortBy === 'quantity' ? '700' : undefined }}>
                      {item.count}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold" style={{ color: sortBy === 'revenue' ? '#0D9488' : '#64748B', fontWeight: sortBy === 'revenue' ? '700' : undefined }}>
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
