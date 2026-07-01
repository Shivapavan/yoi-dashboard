'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

export interface Booking {
  id: string
  date: string         // YYYY-MM-DD
  name: string
  party_size: number | null
  start_time: string | null
  phone: string | null
  status: 'Tentative' | 'Confirmed' | 'NotAvailable'
  notes: string | null
  created_at: string
  updated_at: string
}

interface Props {
  /** Kept for backwards compat — no longer used; calendar navigates freely. */
  endDate?: string
  slug?: string
  title?: string
  subtitle?: string
}

// ─── date helpers ────────────────────────────────────────────────────────────

function todayChicago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta, y = year
  while (m > 12) { m -= 12; y++ }
  while (m < 1)  { m += 12; y-- }
  return { year: y, month: m }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Returns rows of (date string | null) for a calendar grid (Sun–Sat). */
function buildGrid(year: number, month: number): (string | null)[][] {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const total = daysInMonth(year, month)
  const cells: (string | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= total; d++) cells.push(ymd(year, month, d))
  while (cells.length % 7) cells.push(null)
  const rows: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function firstOfMonth(year: number, month: number): string {
  return ymd(year, month, 1)
}

function lastOfMonth(year: number, month: number): string {
  return ymd(year, month, daysInMonth(year, month))
}

// ─── status helpers ───────────────────────────────────────────────────────────

type DayStatus = 'open' | 'tentative' | 'confirmed' | 'blocked'

function dayStatus(bookings: Booking[]): DayStatus {
  if (!bookings.length) return 'open'
  if (bookings.some(b => b.status === 'NotAvailable')) return 'blocked'
  if (bookings.some(b => b.status === 'Confirmed'))    return 'confirmed'
  return 'tentative'
}

const CELL_BG: Record<DayStatus, string> = {
  open:      'bg-white hover:bg-gray-50',
  tentative: 'bg-amber-50 hover:bg-amber-100',
  confirmed: 'bg-emerald-50 hover:bg-emerald-100',
  blocked:   'bg-red-50 hover:bg-red-100',
}
const CELL_RING: Record<DayStatus, string> = {
  open:      'ring-gray-200',
  tentative: 'ring-amber-300',
  confirmed: 'ring-emerald-400',
  blocked:   'ring-red-400',
}
const DOT_COLOR: Record<DayStatus, string> = {
  open:      'bg-transparent',
  tentative: 'bg-amber-400',
  confirmed: 'bg-emerald-500',
  blocked:   'bg-red-500',
}
const STATUS_LABEL: Record<DayStatus, string> = {
  open:      'Open',
  tentative: 'Tentative',
  confirmed: 'Confirmed',
  blocked:   'Not Available',
}
const STATUS_BADGE: Record<DayStatus, string> = {
  open:      'bg-gray-100 text-gray-500 border-gray-200',
  tentative: 'bg-amber-100 text-amber-800 border-amber-300',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  blocked:   'bg-red-100 text-red-800 border-red-300',
}

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// ─── main component ───────────────────────────────────────────────────────────

export default function EventsCalendar({ slug, title, subtitle }: Props) {
  const today = useMemo(() => todayChicago(), [])
  const [ty, tm] = today.split('-').map(Number)

  // offset from today's month: 0 = current month shown on left
  const [offset, setOffset] = useState(0)

  const leftMonth  = useMemo(() => shiftMonth(ty, tm, offset),     [ty, tm, offset])
  const rightMonth = useMemo(() => shiftMonth(ty, tm, offset + 1), [ty, tm, offset])

  const rangeStart = useMemo(() => firstOfMonth(leftMonth.year,  leftMonth.month),  [leftMonth])
  const rangeEnd   = useMemo(() => lastOfMonth(rightMonth.year, rightMonth.month), [rightMonth])

  const [bookings, setBookings]     = useState<Record<string, Booking[]>>({})
  const [loading,  setLoading]      = useState(true)
  const [error,    setError]        = useState<string | null>(null)
  const [selected, setSelected]     = useState<string | null>(null)
  const [editingId, setEditingId]   = useState<string | null>(null)

  const slugParam = slug ? `&slug=${encodeURIComponent(slug)}` : ''

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(
        `/api/events/bookings?start=${start}&end=${end}${slugParam}`,
        { cache: 'no-store', credentials: 'include' },
      )
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
  }, [slugParam])

  useEffect(() => {
    load(rangeStart, rangeEnd)
    setSelected(null)
    setEditingId(null)
  }, [rangeStart, rangeEnd, load])

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
    await load(rangeStart, rangeEnd)
  }

  async function deleteBooking(id: string) {
    if (!confirm('Delete this booking?')) return
    const url = slug
      ? `/api/events/bookings/${id}?slug=${encodeURIComponent(slug)}`
      : `/api/events/bookings/${id}`
    const r = await fetch(url, { method: 'DELETE', credentials: 'include' })
    if (r.ok) await load(rangeStart, rangeEnd)
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
    if (r.ok) await load(rangeStart, rangeEnd)
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
    await load(rangeStart, rangeEnd)
  }

  const selectedBookings = selected ? (bookings[selected] || []) : []
  const selectedStatus   = dayStatus(selectedBookings)

  return (
    <div className="space-y-5">
      {/* Header */}
      {(title || subtitle) && (
        <div>
          {title    && <h2 className="text-2xl font-bold text-yoi-primary">{title}</h2>}
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      )}

      {/* Navigation + month labels */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setOffset(o => o - 1)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
          aria-label="Previous month"
        >
          ← Prev
        </button>

        <div className="flex-1 text-center">
          <span className="text-sm font-semibold text-gray-700">
            {monthLabel(leftMonth.year, leftMonth.month)}
            {' '}–{' '}
            {monthLabel(rightMonth.year, rightMonth.month)}
          </span>
          {offset !== 0 && (
            <button
              onClick={() => setOffset(0)}
              className="ml-3 text-xs text-yoi-primary hover:underline"
            >
              Back to today
            </button>
          )}
        </div>

        <button
          onClick={() => setOffset(o => o + 1)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
          aria-label="Next month"
        >
          Next →
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <Legend dot="bg-gray-200"    label="Open" />
        <Legend dot="bg-amber-400"   label="Tentative" />
        <Legend dot="bg-emerald-500" label="Confirmed" />
        <Legend dot="bg-red-500"     label="Not Available" />
        {loading && !error && (
          <span className="ml-auto text-gray-400 animate-pulse">Loading…</span>
        )}
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Two-month grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MonthGrid
          year={leftMonth.year}
          month={leftMonth.month}
          today={today}
          bookings={bookings}
          selected={selected}
          onSelect={setSelected}
        />
        <MonthGrid
          year={rightMonth.year}
          month={rightMonth.month}
          today={today}
          bookings={bookings}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      {/* Selected day detail panel */}
      {selected && (
        <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className={`px-5 py-3 flex items-center justify-between border-b ${
            selectedStatus === 'blocked'   ? 'bg-red-50 border-red-200' :
            selectedStatus === 'confirmed' ? 'bg-emerald-50 border-emerald-200' :
            selectedStatus === 'tentative' ? 'bg-amber-50 border-amber-200' :
            'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-800 text-sm">
                {new Date(selected + 'T00:00:00Z').toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
                })}
              </span>
              <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded border ${STATUS_BADGE[selectedStatus]}`}>
                {STATUS_LABEL[selectedStatus]}
              </span>
            </div>
            <button
              onClick={() => { setSelected(null); setEditingId(null) }}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            {/* Existing bookings */}
            {selectedBookings.map(b => (
              <div key={b.id} className="bg-gray-50 rounded-lg p-3">
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
                    <div className="flex flex-col gap-1 items-end flex-shrink-0">
                      <button
                        onClick={() => toggleStatus(b)}
                        className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded border ${
                          b.status === 'NotAvailable'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : b.status === 'Confirmed'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        {b.status === 'NotAvailable' ? 'NOT AVAIL.' : b.status}
                      </button>
                      <button onClick={() => setEditingId(b.id)}
                        className="text-[10px] text-yoi-primary hover:underline">edit</button>
                      <button onClick={() => deleteBooking(b.id)}
                        className="text-[10px] text-red-500 hover:underline">delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add booking form */}
            <BookingForm
              heading="Add booking"
              submitLabel="Save booking"
              onSubmit={(form) => addBooking(selected, form)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── month grid ───────────────────────────────────────────────────────────────

function MonthGrid({
  year, month, today, bookings, selected, onSelect,
}: {
  year: number
  month: number
  today: string
  bookings: Record<string, Booking[]>
  selected: string | null
  onSelect: (date: string | null) => void
}) {
  const grid = useMemo(() => buildGrid(year, month), [year, month])

  return (
    <div>
      {/* Month title */}
      <div className="text-center font-semibold text-gray-700 mb-3">
        {monthLabel(year, month)}
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar rows */}
      <div className="space-y-1">
        {grid.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-1">
            {row.map((date, ci) => {
              if (!date) return <div key={ci} />

              const bks    = bookings[date] || []
              const status = dayStatus(bks)
              const isToday    = date === today
              const isPast     = date < today
              const isSelected = date === selected
              const hasBkgs    = bks.length > 0

              return (
                <button
                  key={date}
                  onClick={() => onSelect(isSelected ? null : date)}
                  className={[
                    'relative flex flex-col items-center justify-start rounded-lg py-1.5 px-0.5 text-center transition-all',
                    'ring-1',
                    CELL_BG[status],
                    CELL_RING[status],
                    isPast && !hasBkgs ? 'opacity-35' : '',
                    isSelected ? 'ring-2 ring-yoi-primary shadow-md' : '',
                    isToday ? 'ring-2 ring-yoi-primary' : '',
                  ].filter(Boolean).join(' ')}
                  aria-label={date}
                  aria-pressed={isSelected}
                >
                  {/* Date number */}
                  <span className={[
                    'text-sm leading-none font-medium',
                    isToday    ? 'text-yoi-primary font-bold' :
                    isPast     ? 'text-gray-400' :
                                 'text-gray-700',
                  ].join(' ')}>
                    {parseInt(date.split('-')[2], 10)}
                  </span>

                  {/* Status dot */}
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full ${DOT_COLOR[status]}`} />

                  {/* Today label */}
                  {isToday && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-yoi-primary" />
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── legend ───────────────────────────────────────────────────────────────────

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

// ─── booking form ─────────────────────────────────────────────────────────────

type NewBookingForm = {
  name: string
  party_size: string
  start_time: string
  phone: string
  status: 'Tentative' | 'Confirmed' | 'NotAvailable'
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
  const [busy, setBusy]   = useState(false)
  const [err,  setErr]    = useState<string | null>(null)
  const isEdit = !!onCancel

  return (
    <form
      className={isEdit ? 'space-y-2' : 'border-t border-gray-100 pt-3 space-y-2 mt-1'}
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
          onChange={(e) => setForm(f => ({ ...f, status: e.target.value as NewBookingForm['status'] }))}
        >
          <option value="Tentative">Tentative</option>
          <option value="Confirmed">Confirmed</option>
          <option value="NotAvailable">Not Available (block this day)</option>
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
          <button type="button" onClick={onCancel} disabled={busy}
            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
