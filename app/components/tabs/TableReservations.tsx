'use client'

import { useCallback, useEffect, useState } from 'react'

interface Booking {
  id: string
  date: string
  name: string
  party_size: number | null
  start_time: string | null
  phone: string | null
  status: 'Tentative' | 'Confirmed' | 'NotAvailable'
  notes: string | null
  handled_by: string | null
  created_at: string
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function StatusBadge({ status }: { status: Booking['status'] }) {
  const styles: Record<Booking['status'], string> = {
    Tentative:    'bg-amber-100 text-amber-800 border border-amber-300',
    Confirmed:    'bg-emerald-100 text-emerald-800 border border-emerald-300',
    NotAvailable: 'bg-red-100 text-red-800 border border-red-300',
  }
  const labels: Record<Booking['status'], string> = {
    Tentative:    'Pending',
    Confirmed:    'Confirmed',
    NotAvailable: 'Cancelled',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

export default function TableReservations() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  const start = (() => { const d = new Date(today); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })()
  const end   = (() => { const d = new Date(today); d.setDate(d.getDate() + 90); return d.toISOString().slice(0, 10) })()

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [filter,   setFilter]   = useState<'all' | 'Tentative' | 'Confirmed' | 'NotAvailable'>('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/events/bookings?start=${start}&end=${end}`, { credentials: 'include', cache: 'no-store' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      const j = await r.json()
      const chatBot = ((j.bookings ?? []) as Booking[]).filter(b => b.handled_by === 'chat-bot')
      setBookings(chatBot)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => { load() }, [load])

  async function confirm(b: Booking) {
    await fetch(`/api/events/bookings/${b.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'Confirmed' }),
    })
    await load()
  }

  async function cancel(b: Booking) {
    if (!window.confirm(`Cancel reservation for ${b.name}?`)) return
    await fetch(`/api/events/bookings/${b.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'NotAvailable' }),
    })
    await load()
  }

  const visible = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)
  const todayBookings = bookings.filter(b => b.date === today && b.status !== 'NotAvailable')
  const pendingCount  = bookings.filter(b => b.status === 'Tentative').length
  const thisWeekEnd   = (() => { const d = new Date(today); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) })()
  const weekCount     = bookings.filter(b => b.date >= today && b.date <= thisWeekEnd && b.status !== 'NotAvailable').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-gray-800">Table Reservations</h2>
        <button onClick={load} className="text-xs text-teal-600 hover:text-teal-800 font-medium">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Today',           value: todayBookings.length, color: 'border-teal-500' },
          { label: 'Pending Confirm', value: pendingCount,         color: 'border-amber-500' },
          { label: 'Next 7 Days',     value: weekCount,            color: 'border-indigo-500' },
        ].map(c => (
          <div key={c.label} className={`bg-white rounded-lg p-4 shadow-sm border-l-4 ${c.color}`}>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{c.label}</div>
            <div className="text-2xl font-bold text-gray-900">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['all', 'Tentative', 'Confirmed', 'NotAvailable'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              filter === f
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'All' : f === 'NotAvailable' ? 'Cancelled' : f}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">{error}</div>
      )}

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading reservations…</p>
        </div>
      )}

      {!loading && visible.length === 0 && !error && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No reservations found.
          <br />
          <span className="text-xs mt-1 block">Bookings from the website chat widget appear here.</span>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Date', 'Time', 'Name', 'Party', 'Phone', 'Status', 'Notes', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(b => (
                  <tr key={b.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{formatDate(b.date)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.start_time ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{b.name}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{b.party_size ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {b.phone
                        ? <a href={`tel:${b.phone}`} className="hover:text-teal-600">{b.phone}</a>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[180px] truncate" title={b.notes ?? ''}>{b.notes || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-2">
                        {b.status === 'Tentative' && (
                          <button
                            onClick={() => confirm(b)}
                            className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 font-medium"
                          >
                            Confirm
                          </button>
                        )}
                        {b.status !== 'NotAvailable' && (
                          <button
                            onClick={() => cancel(b)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Showing chat-bot reservations · {start} – {end}
      </p>
    </div>
  )
}
