import { NextRequest } from 'next/server'
import { listBookings, getEventsPublicSlug, type EventBooking } from '@/lib/events'

export const dynamic = 'force-dynamic'

function pad(n: number): string { return n < 10 ? `0${n}` : `${n}` }

function icsTimestamp(d: Date): string {
  // YYYYMMDDTHHMMSSZ in UTC
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function dateToYYYYMMDD(yyyymmdd: string): string {
  // 2026-07-04 → 20260704
  return yyyymmdd.replaceAll('-', '')
}

function addOneDay(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

// RFC 5545 line folding + escaping for TEXT values
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}
function fold(line: string): string {
  if (line.length <= 75) return line
  const out: string[] = []
  let i = 0
  while (i < line.length) {
    const chunk = line.slice(i, i + (i === 0 ? 75 : 74))
    out.push((i === 0 ? '' : ' ') + chunk)
    i += chunk.length
  }
  return out.join('\r\n')
}

function summaryFor(b: EventBooking): string {
  const parts: string[] = []
  if (b.status === 'NotAvailable') {
    parts.push('Yum of India — Not Available (Party Space)')
  } else if (b.status === 'Confirmed') {
    parts.push(`Confirmed: ${b.name}`)
    if (b.party_size != null) parts.push(`${b.party_size} ppl`)
  } else {
    parts.push(`Tentative: ${b.name}`)
    if (b.party_size != null) parts.push(`${b.party_size} ppl`)
  }
  return parts.join(' · ')
}

function descriptionFor(b: EventBooking): string {
  const lines: string[] = []
  if (b.start_time) lines.push(`Time: ${b.start_time}`)
  if (b.phone)      lines.push(`Phone: ${b.phone}`)
  if (b.notes)      lines.push(`Notes: ${b.notes}`)
  lines.push(`Status: ${b.status}`)
  return lines.join('\n')
}

export async function GET(req: NextRequest) {
  // The iCal URL is the credential, same model as the public booking page.
  // No session cookie required — Google Calendar will fetch this unauthenticated.
  const provided = req.nextUrl.searchParams.get('slug')
  const expected = getEventsPublicSlug()
  if (!expected || !provided || provided !== expected) {
    return new Response('Not found', { status: 404 })
  }

  // Today through end of next year (12+ months ahead is sane for a subscription)
  const today = new Date()
  const todayStr = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`
  const endYear = today.getUTCFullYear() + 1
  const endStr  = `${endYear}-12-31`

  const bookings = await listBookings(todayStr, endStr, { excludeChatBot: true })
  const stamp = icsTimestamp(new Date())

  const events: string[] = []
  for (const b of bookings) {
    const start = dateToYYYYMMDD(b.date)
    const end   = dateToYYYYMMDD(addOneDay(b.date))
    const eventLines = [
      'BEGIN:VEVENT',
      `UID:${b.id}@yoi-dashboard`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      fold(`SUMMARY:${escapeText(summaryFor(b))}`),
      fold(`DESCRIPTION:${escapeText(descriptionFor(b))}`),
      `STATUS:${b.status === 'Confirmed' ? 'CONFIRMED' : b.status === 'NotAvailable' ? 'CONFIRMED' : 'TENTATIVE'}`,
      `TRANSP:${b.status === 'NotAvailable' ? 'OPAQUE' : 'TRANSPARENT'}`,
      'END:VEVENT',
    ]
    events.push(eventLines.join('\r\n'))
  }

  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Yum of India//Party Space Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold('X-WR-CALNAME:Yum of India — Party Space'),
    fold('X-WR-CALDESC:Party-space bookings (tentative / confirmed) and blocked days for the Yum of India McKinney private events space.'),
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n')

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'public, max-age=900', // 15-min cache; Google Calendar polls hourly+ anyway
      // Allow Google Calendar's user-agent to download as ics
      'content-disposition': 'inline; filename="yoi-party-space.ics"',
    },
  })
}
