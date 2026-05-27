'use client'

import { useEffect, useState } from 'react'
import { SkeletonCards, SkeletonTable } from '../Skeleton'

interface Review {
  id: string
  rating: number
  author: string
  authorPhoto: string | null
  text: string
  relativeTime: string
  publishTime: string
  uri: string | null
}

interface Data {
  month: string
  monthAvg: number
  monthCount: number
  reviews: Review[]
  availableMonths: string[]
  overall: { rating?: number; ratingCount?: number; mapsUrl?: string | null } | null
  error?: string
}

function currentMonthStr() {
  return new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    .slice(0, 7)
}

function fmtMonth(s: string) {
  const [y, m] = s.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function addMonths(s: string, n: number) {
  const [y, m] = s.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const filled = Math.round(rating)
  const cls = size === 'lg' ? 'text-2xl' : 'text-base'
  return (
    <span className={cls + ' tracking-tight'}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < filled ? 'text-amber-500' : 'text-gray-300'}>★</span>
      ))}
    </span>
  )
}

export default function Reviews() {
  const today = currentMonthStr()
  const [month, setMonth]     = useState(today)
  const [data, setData]       = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = (m: string = month) => {
    setLoading(true)
    fetch(`/api/reviews?month=${m}`)
      .then(r => r.json())
      .then(d => {
        // Ignore late responses from older months
        if (d.month && d.month !== m) return
        setData(d); setLastUpdated(new Date())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // Abort previous request when month changes so stale responses don't overwrite
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/reviews?month=${month}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { if (d.month === month) { setData(d); setLastUpdated(new Date()) } })
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [month])

  const canNext = month < today

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Google Reviews</h2>
          <p className="text-xs text-gray-400 mt-0.5">Auto-checked daily — SMS alert on any new ≤3★ review.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button onClick={() => load()} className="text-teal-600 hover:text-teal-800 font-medium">Refresh</button>
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <button onClick={() => setMonth(addMonths(month, -1))}
          className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-gray-500 font-bold">‹</button>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300 cursor-pointer min-w-[180px]"
        >
          {/* Always include the current month even if empty */}
          {(() => {
            // Always include the currently-selected month + today so the dropdown
            // can correctly display April even when April has no captured reviews.
            const set = new Set<string>(data?.availableMonths ?? [])
            set.add(today)
            set.add(month)
            return [...set].sort((a, b) => b.localeCompare(a))
          })().map(m => (
            <option key={m} value={m}>{fmtMonth(m)}{m === today ? '  (current)' : ''}</option>
          ))}
        </select>
        <button onClick={() => setMonth(addMonths(month, 1))} disabled={!canNext}
          className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-gray-500 font-bold disabled:opacity-30 disabled:cursor-not-allowed">›</button>
      </div>

      {loading && (
        <>
          <SkeletonCards count={3} />
          <SkeletonTable rows={4} />
        </>
      )}

      {!loading && data?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{data.error}</div>
      )}

      {!loading && data && !data.error && (
        <>
          {/* All-time + this-month summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            {/* All-time */}
            <div className="bg-gradient-to-r from-amber-50 to-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold mb-1">All-Time Rating</p>
              <div className="flex items-center gap-3">
                <div className="text-4xl font-bold text-amber-700">{data.overall?.rating?.toFixed(1) ?? '—'}</div>
                <div>
                  <Stars rating={data.overall?.rating ?? 0} size="lg" />
                  <p className="text-sm text-gray-600">{data.overall?.ratingCount?.toLocaleString() ?? 0} reviews</p>
                </div>
              </div>
              {data.overall?.mapsUrl && (
                <a href={data.overall.mapsUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-block mt-2 text-xs text-teal-600 hover:text-teal-800 font-medium">
                  View on Google Maps →
                </a>
              )}
            </div>

            {/* Month */}
            <div className="bg-gradient-to-r from-teal-50 to-fuchsia-50 border border-teal-200 rounded-xl p-5">
              <p className="text-xs uppercase tracking-wide text-teal-700 font-semibold mb-1">{fmtMonth(data.month)}</p>
              <div className="flex items-center gap-3">
                <div className="text-4xl font-bold text-teal-700">
                  {data.monthCount > 0 ? data.monthAvg.toFixed(1) : '—'}
                </div>
                <div>
                  <Stars rating={data.monthAvg} size="lg" />
                  <p className="text-sm text-gray-600">{data.monthCount} review{data.monthCount !== 1 ? 's' : ''} this month</p>
                </div>
              </div>
            </div>
          </div>

          {/* Reviews list */}
          <div className="space-y-3">
            {data.reviews.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-400 text-sm">
                No reviews captured for {fmtMonth(data.month)}.
                {data.month === today
                  ? ' New reviews will appear as they\'re posted on Google.'
                  : ' Google\'s API only returns the 5 most recent reviews, so older months may be empty until reviews were captured live.'}
              </div>
            )}
            {data.reviews.map(r => {
              const isLow = r.rating <= 3
              return (
                <div key={r.id}
                  className={`bg-white rounded-lg shadow-sm p-5 border-l-4 ${isLow ? 'border-red-500' : 'border-green-500'}`}>
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex items-center gap-3">
                      {r.authorPhoto && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.authorPhoto} alt={r.author} className="w-8 h-8 rounded-full" />
                      )}
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{r.author}</p>
                        <p className="text-xs text-gray-400">{r.relativeTime}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Stars rating={r.rating} />
                      {isLow && <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">LOW</span>}
                    </div>
                  </div>
                  {r.text ? (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{r.text}</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No text — rating only.</p>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-xs text-gray-400 mt-5 text-center">
            Google&apos;s API exposes only the 5 most recent reviews. As new reviews appear, they&apos;re stored automatically — over time, every month will have its full history captured.
          </p>
        </>
      )}
    </div>
  )
}
