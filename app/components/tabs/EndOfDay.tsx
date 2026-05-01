'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import MetricCard from '../MetricCard'
import DatePicker from '../DatePicker'
import CardProcessingDetail from '../CardProcessingDetail'
import { EndOfDayMetrics } from '@/types/shift4'

const REFRESH_MS = 5 * 60 * 1000

const CARDS = [
  { key: 'grossSales',         label: 'Gross Sales',          color: '#3B82F6' },
  { key: 'netSales',           label: 'Net Sales',            color: '#22C55E' },
  { key: 'taxes',              label: 'Taxes',                color: '#F59E0B' },
  { key: 'voids',              label: 'Voids',                color: '#EF4444' },
  { key: 'cashPayments',       label: 'Cash Payments',        color: '#16A34A' },
  { key: 'creditCardPayments', label: 'Credit Card Payments', color: '#7C3AED' },
  { key: 'discounts',          label: 'Discounts',            color: '#EC4899' },
  { key: 'openTickets',        label: 'Open Tickets',         color: '#0891B2' },
] as const

const EMPTY: EndOfDayMetrics = {
  grossSales: 0, netSales: 0, taxes: 0, voids: 0,
  cashPayments: 0, creditCardPayments: 0, discounts: 0, openTickets: 0,
}

export default function EndOfDay() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState('')
  const [recommendedDate, setRecommendedDate] = useState('')
  const [earliestDate, setEarliestDate] = useState('')
  const [metrics, setMetrics] = useState<EndOfDayMetrics>(EMPTY)
  const [processingDetail, setProcessingDetail] = useState<any>(null)
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

    fetch(`/api/end-of-day?date=${d}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.error) throw new Error(res.error)

        setRecommendedDate(res.recommendedDate)
        if (res.earliestDate) setEarliestDate(res.earliestDate)

        // On first load only: auto-switch to last day with real data
        if (autoRedirect && res.metrics.grossSales === 0 && res.recommendedDate && res.recommendedDate !== d) {
          setDate(res.recommendedDate)
          return
        }

        // Manual selection with no data — show banner but display zeros
        if (res.metrics.grossSales === 0 && d !== res.recommendedDate) {
          setNoData(true)
        }

        setMetrics(res.metrics)
        setProcessingDetail(res.processingDetail)
        setLastUpdated(new Date())
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // First load: start with today, auto-redirect if $0
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      setDate(today)
      fetchData(today, true)
    }
  }, [today, fetchData])

  // Re-fetch when date changes (after first load)
  useEffect(() => {
    if (!date || isFirstLoad.current) return
    fetchData(date, false)
    const interval = setInterval(() => fetchData(date, false), REFRESH_MS)
    return () => clearInterval(interval)
  }, [date, fetchData])

  return (
    <div>
      <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <DatePicker value={date} onChange={setDate} min={earliestDate} />
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>
      )}

      {noData && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3 mb-4 text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>
            No data for {date}.
            {earliestDate && date < earliestDate
              ? ` Data starts from ${earliestDate}.`
              : ` This date hasn't been scraped yet.`}
            {recommendedDate && (
              <button
                onClick={() => setDate(recommendedDate)}
                className="ml-2 underline font-medium hover:text-yellow-900"
              >
                Go to {recommendedDate} (last available)
              </button>
            )}
          </span>
        </div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        {CARDS.map(({ key, label, color }) => (
          <MetricCard key={key} label={label} value={metrics[key]} borderColor={color} />
        ))}
      </div>

      {processingDetail && (
        <CardProcessingDetail
          windowLabel={processingDetail.windowLabel}
          rows={processingDetail.rows}
          historical={processingDetail.historical}
        />
      )}
    </div>
  )
}
