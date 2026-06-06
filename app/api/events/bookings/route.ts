import { NextRequest, NextResponse } from 'next/server'
import {
  listBookings, createBooking, getEventsPublicSlug,
} from '@/lib/events'

// The middleware bypasses /api/events/ entirely (the public QR page needs it),
// so each route here implements its own access check: either a valid main-app
// session OR the correct ?slug=… param matching EVENTS_PUBLIC_SLUG.
function isPublicSlugOk(req: NextRequest): boolean {
  const provided = req.nextUrl.searchParams.get('slug')
  const expected = getEventsPublicSlug()
  return !!expected && !!provided && provided === expected
}

function hasSession(req: NextRequest): boolean {
  return !!req.cookies.get('yoi_session')?.value
}

function authorized(req: NextRequest): boolean {
  return hasSession(req) || isPublicSlugOk(req)
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const start = req.nextUrl.searchParams.get('start')
  const end   = req.nextUrl.searchParams.get('end')
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end (YYYY-MM-DD) are required' }, { status: 400 })
  }
  const bookings = await listBookings(start, end)
  return NextResponse.json({ bookings }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body?.date || typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) is required' }, { status: 400 })
  }
  if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const partySize = body.party_size === '' || body.party_size == null
    ? null
    : Math.max(1, Math.min(500, parseInt(String(body.party_size), 10) || 0))
  const status = body.status === 'Confirmed' ? 'Confirmed' : 'Tentative'

  const booking = await createBooking({
    date: body.date,
    name: body.name.trim().slice(0, 120),
    party_size: partySize,
    start_time: body.start_time ? String(body.start_time).slice(0, 20) : null,
    phone: body.phone ? String(body.phone).slice(0, 30) : null,
    status,
    notes: body.notes ? String(body.notes).slice(0, 2000) : null,
  })
  return NextResponse.json({ booking }, { status: 201 })
}
