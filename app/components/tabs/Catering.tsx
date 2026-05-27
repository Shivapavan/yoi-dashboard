'use client'

import { useEffect, useState } from 'react'
import type { CateringSheet } from '@/lib/google'

function fmt(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function Catering() {
  const [sheets, setSheets] = useState<CateringSheet[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/catering')
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setSheets(d.sheets)
      setTotalRevenue(d.totalRevenue)
      setLastUpdated(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // orders array is empty (we only load summary totals) — kept for future use
  const totalOrders = sheets.length

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-gray-800">Catering Orders</h2>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button onClick={fetchData} className="text-purple-600 hover:text-purple-800 font-medium">Refresh now</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>}

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading catering data from Google Sheets…</p>
        </div>
      )}

      {!loading && sheets.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-orange-500">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total CAT CAH</div>
              <div className="text-2xl font-bold text-gray-900">{fmt(totalRevenue)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-indigo-500">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Months</div>
              <div className="text-2xl font-bold text-gray-900">{sheets.length}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-green-500">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Months Tracked</div>
              <div className="text-2xl font-bold text-gray-900">{totalOrders}</div>
            </div>
          </div>

          {/* Monthly summary table */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Monthly Summary (CAT CAH)</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold">Month</th>
                  <th className="text-right px-5 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold">CAT CAH Total</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((sheet) => (
                  <tr key={sheet.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{sheet.name}</td>
                    <td className="px-5 py-3 text-right font-bold text-orange-600">{fmt(sheet.totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-5 py-3 font-bold text-gray-900">Total</td>
                  <td className="px-5 py-3 text-right font-bold text-orange-600 text-base">{fmt(totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!loading && sheets.length === 0 && !error && (
        <p className="text-center text-gray-400 py-12">No catering data found.</p>
      )}
    </div>
  )
}
