import { NextRequest, NextResponse } from 'next/server'
import { findStaffByToken, saveTimeOffRequest } from '@/lib/schedule'
import { sendEmail } from '@/lib/gmail'

const ALERT_TO = 'yumofindiamckinney@gmail.com'

export async function POST(req: NextRequest) {
  try {
    const { token, date, reason } = await req.json() as { token: string; date: string; reason?: string }

    if (!token || !date) {
      return NextResponse.json({ error: 'token and date are required' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    }

    const person = await findStaffByToken(token)
    if (!person) return NextResponse.json({ error: 'Unknown employee' }, { status: 404 })

    await saveTimeOffRequest({
      employeeToken: token,
      employeeName: person.name,
      requestDate: date,
      reason: reason?.trim() || null,
    })

    const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })

    const emailBody = [
      `Time-off request from ${person.name}`,
      '',
      `Date requested: ${displayDate}`,
      reason?.trim() ? `Reason: ${reason.trim()}` : 'Reason: (not provided)',
      '',
      `Submitted: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CDT`,
    ].join('\n')

    await sendEmail(
      [ALERT_TO],
      `⏰ Time-off request: ${person.name} – ${displayDate}`,
      emailBody,
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[time-off POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
