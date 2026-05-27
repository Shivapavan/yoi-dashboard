'use client'

import { useEffect, useState } from 'react'

interface ContainerRow { [key: string]: string }

export default function Containers() {
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows]       = useState<ContainerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [search, setSearch]   = useState('')

  const load = () => {
    setLoading(true)
    fetch('/api/containers')
      .then(r => r.json())
      .then(d => {
        setHeaders(d.headers ?? [])
        setRows(d.rows ?? [])
        setLastUpdated(new Date())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = search.trim()
    ? rows.filter(row =>
        Object.values(row).some(v => v.toLowerCase().includes(search.toLowerCase()))
      )
    : rows

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Containers List</h2>
          {!loading && rows.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{rows.length} items from Google Sheets</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button onClick={load} className="text-teal-600 hover:text-teal-800 font-medium">
            Refresh
          </button>
        </div>
      </div>

      {!loading && rows.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search containers…"
            className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading containers…</p>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-400 text-sm">
          No data found. Make sure the "Containers list" spreadsheet is in Google Drive and the service account has access.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {headers.map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={headers.length} className="px-4 py-6 text-center text-gray-400">
                      No results for "{search}"
                    </td>
                  </tr>
                ) : (
                  filtered.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      {headers.map(h => (
                        <td key={h} className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                          {row[h] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {search && filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
              Showing {filtered.length} of {rows.length} items
            </div>
          )}
        </div>
      )}
    </div>
  )
}
