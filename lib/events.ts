import { getDb } from '@/lib/db'

export type BookingStatus = 'Tentative' | 'Confirmed' | 'NotAvailable' | 'Open'

export const VALID_STATUSES: BookingStatus[] = ['Tentative', 'Confirmed', 'NotAvailable']

export interface EventBooking {
  id: string
  date: string        // YYYY-MM-DD
  name: string
  party_size: number | null
  start_time: string | null
  phone: string | null
  status: BookingStatus
  notes: string | null
  handled_by: string | null
  created_at: string
  updated_at: string
}

let _ensured = false
export async function ensureEventBookingsTable() {
  if (_ensured) return
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS event_bookings (
      id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      date       DATE         NOT NULL,
      name       TEXT         NOT NULL,
      party_size INTEGER,
      start_time TEXT,
      phone      TEXT,
      status     TEXT         NOT NULL DEFAULT 'Tentative',
      notes      TEXT,
      handled_by TEXT,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS event_bookings_date_idx ON event_bookings(date)`
  // Add handled_by to existing tables that predate this column
  await sql`ALTER TABLE event_bookings ADD COLUMN IF NOT EXISTS handled_by TEXT`
  _ensured = true
}

export async function listBookings(startDate: string, endDate: string): Promise<EventBooking[]> {
  await ensureEventBookingsTable()
  const sql = getDb()
  const rows = await sql`
    SELECT id, to_char(date, 'YYYY-MM-DD') AS date,
           name, party_size, start_time, phone, status, notes, handled_by,
           created_at, updated_at
    FROM event_bookings
    WHERE date >= ${startDate}::date AND date <= ${endDate}::date
    ORDER BY date ASC, COALESCE(start_time, '99:99') ASC, created_at ASC
  `
  return rows as EventBooking[]
}

export async function createBooking(b: Partial<EventBooking>): Promise<EventBooking> {
  await ensureEventBookingsTable()
  const sql = getDb()
  const status = VALID_STATUSES.includes(b.status as BookingStatus) ? b.status : 'Tentative'
  const rows = await sql`
    INSERT INTO event_bookings (date, name, party_size, start_time, phone, status, notes, handled_by)
    VALUES (${b.date}, ${b.name}, ${b.party_size ?? null}, ${b.start_time ?? null},
            ${b.phone ?? null}, ${status}, ${b.notes ?? null}, ${b.handled_by ?? null})
    RETURNING id, to_char(date, 'YYYY-MM-DD') AS date,
              name, party_size, start_time, phone, status, notes, handled_by,
              created_at, updated_at
  `
  return rows[0] as EventBooking
}

export async function updateBooking(id: string, b: Partial<EventBooking>): Promise<EventBooking | null> {
  await ensureEventBookingsTable()
  const sql = getDb()
  const status = VALID_STATUSES.includes(b.status as BookingStatus) ? b.status : null
  const rows = await sql`
    UPDATE event_bookings SET
      date       = COALESCE(${b.date}::date,    date),
      name       = COALESCE(${b.name ?? null},  name),
      party_size = COALESCE(${b.party_size ?? null}, party_size),
      start_time = COALESCE(${b.start_time ?? null}, start_time),
      phone      = COALESCE(${b.phone ?? null}, phone),
      status     = COALESCE(${status},          status),
      notes      = COALESCE(${b.notes ?? null}, notes),
      handled_by = COALESCE(${b.handled_by ?? null}, handled_by),
      updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING id, to_char(date, 'YYYY-MM-DD') AS date,
              name, party_size, start_time, phone, status, notes, handled_by,
              created_at, updated_at
  `
  return (rows[0] as EventBooking) || null
}

export async function deleteBooking(id: string): Promise<boolean> {
  await ensureEventBookingsTable()
  const sql = getDb()
  const rows = await sql`DELETE FROM event_bookings WHERE id = ${id}::uuid RETURNING id`
  return rows.length > 0
}

// Slug-based public access. The slug lives in env var EVENTS_PUBLIC_SLUG and is
// the only thing protecting the public /events/[slug] route — the URL itself is
// the credential (security by obscurity, by design).
export function getEventsPublicSlug(): string | null {
  const s = process.env.EVENTS_PUBLIC_SLUG?.trim()
  return s ? s : null
}
