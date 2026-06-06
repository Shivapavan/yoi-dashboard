'use client'

import { useEffect, useMemo, useState } from 'react'

export interface Booking {
  id: string
  date: string         // YYYY-MM-DD
  name: string
  party_size: number | null
  start_time: string | null
  phone: string | null
  status: 'Tentative' | 'Confirmed'
  notes: string | null
  created_at: string
  updated_at: string
}

interface Props {
  /** End date (inclusive), YYYY-MM-DD. Start is always today (CDT). */
  endDate: string
  /** If set, used as ?slug=<value> on all API calls (public QR mode). */
  slug?: string
  /** Label shown at the top of the calendar. */
  title?: string
  /** Sub-label shown under the title. */
  subtitle?: string
}

// Today in America/Chicago — YYYY-MM-DD
function todayChicago(): string {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(now)
}

function addDays(yyyymmdd: string, days: number): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function prettyDate(yyyymmdd: string): { weekday: string; main: string; isWeekend: boolean } {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const wd = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  const main = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const dayIdx = dt.getUTCDay() // 0=Sun, 6=Sat
  return { weekday: wd, main, isWeekend: dayIdx === 0 || dayIdx === 6 }
}

function dayStatus(bookings: Booking[]): { label: string; cls: string } {
  if (bookings.length === 0) return { label: 'Open', cls: 'bg-gray-100 text-gray-500 border-gray-200' }
  if (bookings.some(b => b.status === 'Confirmed'))
    return { label: 'Confirmed', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
  return { label: 'Tentative', cls: 'bg-amber-100 text-amber-800 border-amber-300' }
}

function statusBarColor(bookings: Booking[]): string {
  if (bookings.length === 0) return 'bg-gray-200'
  if (bookings.some(b => b.status === 'Confirmed')) return 'bg-emerald-500'
  return 'bg-amber-400'
}

export default function EventsCalendar({ endDate, slug, title, subtitle }: Props) {
  const startDate = useMemo(() => todayChicago(), [])

  const days = useMemo(() => {
    const out: string[] = []
    let d = startDate
    while (d <= endDate) {
      out.push(d)
      d = addDays(d, 1)
    }
    return out
  }, [startDate, endDate])

  const [bookings, setBookings] = useState<Record<string, Booking[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)

  const slugParam = slug ? `&slug=${encodeURIComponent(slug)}` : ''

  async function load() {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/events/bookings?start=${startDate}&end=${endDate}${slugParam}`,
        { cache: 'no-store', credentials: 'include' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      const j = await r.json()
      const byDate: Record<string, Booking[]> = {}
      for (const b of (j.bookings || []) as Booking[]) {
        ;(byDate[b.date] ||= []).push(b)
      }
      setBookings(byDate)
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [startDate, endDate, slug])

  function toggleDay(date: string) {
    setOpenDays(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

  async function addBooking(date: string, form: NewBookingForm) {
    const r = await fetch(`/api/events/bookings?${slugParam.slice(1)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...form, date }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(j.error || `HTTP ${r.status}`)
    }
    await load()
  }

  async function deleteBooking(id: string) {
    if (!confirm('Delete this booking?')) return
    const url = slug
      ? `/api/events/bookings/${id}?slug=${encodeURIComponent(slug)}`
      : `/api/events/bookings/${id}`
    const r = await fetch(url, { method: 'DELETE', credentials: 'include' })
    if (r.ok) await load()
  }

  async function toggleStatus(b: Booking) {
    const next = b.status === 'Confirmed' ? 'Tentative' : 'Confirmed'
    const url = slug
      ? `/api/events/bookings/${b.id}?slug=${encodeURIComponent(slug)}`
      : `/api/events/bookings/${b.id}`
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: next }),
    })
    if (r.ok) await load()
  }

  async function saveEdit(id: string, patch: NewBookingForm) {
    const url = slug
      ? `/api/events/bookings/${id}?slug=${encodeURIComponent(slug)}`
      : `/api/events/bookings/${id}`
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(j.error || `HTTP ${r.status}`)
    }
    setEditingId(null)
    await load()
  }

  return (
    <div className="space-y-4">
      {(title || subtitle) && (
        <div>
          {title && <h2 className="text-2xl font-bold text-yoi-primary">{title}</h2>}
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-600">
        <Legend swatch="bg-gray-200"     label="Open" />
        <Legend swatch="bg-amber-400"    label="Tentative" />
        <Legend swatch="bg-emerald-500"  label="Confirmed" />
        <span className="ml-auto">{startDate} → {endDate}</span>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}
      {loading && !error && (
        <div className="text-sm text-gray-500">Loading…</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {days.map(date => {
          const dayBookings = bookings[date] || []
          const status = dayStatus(dayBookings)
          const isOpen = openDays.has(date)
          const pretty = prettyDate(date)
          return (
            <div key={date} className="bg-white rounded-lg shadow-sm overflow-hidden">
              <button
                onClick={() => toggleDay(date)}
                className="w-full text-left"
                aria-expanded={isOpen}
              >
                <div className={`h-1 ${statusBarColor(dayBookings)}`} />
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-shrink-0 w-12 text-center">
                    <div className={`text-[10px] uppercase tracking-wide ${pretty.isWeekend ? 'text-yoi-accent' : 'text-gray-400'}`}>{pretty.weekday}</div>
                    <div className="font-bold text-gray-800 text-sm">{pretty.main}</div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded border ${status.cls}`}>
                    {status.label}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {dayBookings.length > 0 ? `${dayBookings.length} booking${dayBookings.length === 1 ? '' : 's'}` : '—'}
                  </span>
                  <span className="text-gray-300 text-xs">{isOpen ? '▾' : '▸'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="space-y-2 mt-3">
                    {dayBookings.map(b => (
                      <div key={b.id} className="bg-gray-50 rounded p-3">
                        {editingId === b.id ? (
                          <BookingForm
                            heading="Edit booking"
                            initial={{
                              name:       b.name,
                              party_size: b.party_size != null ? String(b.party_size) : '',
                              start_time: b.start_time ?? '',
                              phone:      b.phone ?? '',
                              status:     b.status,
                              notes:      b.notes ?? '',
                            }}
                            submitLabel="Save changes"
                            onSubmit={(form) => saveEdit(b.id, form)}
                            onCancel={() => setEditingId(null)}
                          />
                        ) : (
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-800 truncate">
                                {b.name}
                                {b.party_size != null && <span className="text-gray-500 font-normal"> · {b.party_size} ppl</span>}
                                {b.start_time && <span className="text-gray-500 font-normal"> · {b.start_time}</span>}
                              </div>
                              {b.phone && <div className="text-xs text-gray-500">📞 {b.phone}</div>}
                              {b.notes && <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{b.notes}</div>}
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                              <button onClick={() => toggleStatus(b)}
                                className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded border ${
                                  b.status === 'Confirmed'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                                }`}>
                                {b.status}
                              </button>
                              <button onClick={() => setEditingId(b.id)}
                                className="text-[10px] text-yoi-primary hover:underline">
                                edit
                              </button>
                              <button onClick={() => deleteBooking(b.id)}
                                className="text-[10px] text-red-500 hover:underline">
                                delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <BookingForm
                    heading="Add booking"
                    submitLabel="Save booking"
                    onSubmit={(form) => addBooking(date, form)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-3 h-1 rounded ${swatch}`} />
      {label}
    </span>
  )
}

type NewBookingForm = {
  name: string
  party_size: string
  start_time: string
  phone: string
  status: 'Tentative' | 'Confirmed'
  notes: string
}

interface BookingFormProps {
  heading: string
  submitLabel: string
  initial?: NewBookingForm
  onSubmit: (f: NewBookingForm) => Promise<void>
  onCancel?: () => void
}

const EMPTY_FORM: NewBookingForm = {
  name: '', party_size: '', start_time: '', phone: '', status: 'Tentative', notes: '',
}

function BookingForm({ heading, submitLabel, initial, onSubmit, onCancel }: BookingFormProps) {
  const [form, setForm] = useState<NewBookingForm>(initial ?? EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const isEdit = !!onCancel

  return (
    <form
      className={isEdit ? 'space-y-2' : 'mt-3 border-t border-gray-100 pt-3 space-y-2'}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!form.name.trim()) { setErr('Name is required'); return }
        setBusy(true); setErr(null)
        try {
          await onSubmit(form)
          if (!isEdit) setForm(EMPTY_FORM)
        } catch (e: any) {
          setErr(e?.message || 'Failed')
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{heading}</div>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="col-span-2 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yoi-primary/30"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
        />
        <input
          className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yoi-primary/30"
          placeholder="Party size"
          inputMode="numeric"
          value={form.party_size}
          onChange={(e) => setForm(f => ({ ...f, party_size: e.target.value }))}
        />
        <input
          className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yoi-primary/30"
          placeholder="Time (e.g. 7:00 PM)"
          value={form.start_time}
          onChange={(e) => setForm(f => ({ ...f, start_time: e.target.value }))}
        />
        <input
          className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yoi-primary/30"
          placeholder="Phone"
          inputMode="tel"
          value={form.phone}
          onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
        />
        <select
          className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yoi-primary/30"
          value={form.status}
          onChange={(e) => setForm(f => ({ ...f, status: e.target.value as 'Tentative' | 'Confirmed' }))}
        >
          <option>Tentative</option>
          <option>Confirmed</option>
        </select>
        <textarea
          className="col-span-2 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yoi-primary/30"
          placeholder="Notes (deposit, special requests, etc.)"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
        />
      </div>
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="text-sm bg-yoi-primary text-white px-3 py-1.5 rounded font-medium hover:bg-yoi-primary-dark disabled:opacity-50"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
