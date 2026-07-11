import { NextRequest, NextResponse } from 'next/server'
import { createBooking } from '@/lib/events'

async function sendSmsTextbelt(to: string, body: string): Promise<void> {
  const key = process.env.TEXTBELT_API_KEY
  if (!key) { console.error('[SMS] TEXTBELT_API_KEY not set'); return }
  const digits = to.replace(/\D/g, '')
  const phone = digits.length === 10 ? `+1${digits}` : `+${digits}`
  const params = new URLSearchParams({ phone, message: body, key })
  const res = await fetch('https://textbelt.com/text', { method: 'POST', body: params })
  const data = await res.json() as { success: boolean; error?: string; quotaRemaining?: number }
  if (!data.success) console.error('[SMS] Textbelt error:', data.error)
  else console.log('[SMS] Sent. Quota remaining:', data.quotaRemaining)
}

const rateLimits = new Map<string, number[]>()
const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX = 5

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (rateLimits.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  hits.push(now)
  rateLimits.set(ip, hits)
  return hits.length > RATE_MAX
}

const ALLOWED_ORIGINS = [
  'https://yumofindiamckinney.com',
  'https://www.yumofindiamckinney.com',
]

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost')
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req)
  const ip = getIp(req)

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many reservations from this device. Please call us at (469) 310-4969.' },
      { status: 429, headers }
    )
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
  const date = typeof body.date === 'string' ? body.date : ''
  const time = typeof body.time === 'string' ? body.time.trim().slice(0, 20) : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : ''
  const party_size = parseInt(String(body.party_size ?? ''), 10)
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : null

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400, headers })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400, headers })
  if (!time) return NextResponse.json({ error: 'Time is required' }, { status: 400, headers })
  if (!phone) return NextResponse.json({ error: 'Phone is required' }, { status: 400, headers })
  if (isNaN(party_size) || party_size < 1 || party_size > 50) {
    return NextResponse.json({ error: 'party_size must be 1–50' }, { status: 400, headers })
  }

  const chicagoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  if (date < chicagoToday) {
    return NextResponse.json({ error: 'Reservation date must be today or in the future' }, { status: 400, headers })
  }

  try {
    const booking = await createBooking({
      date,
      name,
      party_size,
      start_time: time,
      phone,
      notes: notes || null,
      status: 'Tentative',
      handled_by: 'chat-bot',
    })

    // Send SMS confirmation to customer (fire-and-forget — don't block the response)
    const dateFormatted = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })
    const smsBody = [
      `Hi ${name}! Your table at Yum of India is reserved 🎉`,
      `📅 ${dateFormatted}`,
      `🕐 ${time}  👥 Party of ${party_size}`,
      notes ? `📝 ${notes}` : '',
      `We'll call to confirm. Questions? (469) 310-4969`,
      `1480 S Independence Pkwy, Suite 280, McKinney TX`,
    ].filter(Boolean).join('\n')
    sendSmsTextbelt(phone, smsBody).catch((e: unknown) => {
      console.error('[SMS confirmation failed]', e instanceof Error ? e.message : e)
    })

    return NextResponse.json({ success: true, bookingId: booking.id }, { headers })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/public/reservations]', msg)
    return NextResponse.json(
      { error: 'Failed to save reservation. Please call us at (469) 310-4969.' },
      { status: 500, headers }
    )
  }
}
