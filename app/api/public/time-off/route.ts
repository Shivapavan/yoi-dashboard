import { NextRequest, NextResponse } from 'next/server'
import { findStaffByToken, saveTimeOffRequest } from '@/lib/schedule'
import { sendEmail } from '@/lib/gmail'
import { sendSms } from '@/lib/auth'

const ALERT_EMAIL = 'yumofindiamckinney@gmail.com'
const ALERT_PHONES = ['+19032709884', '+18482195090', '+14049180968']

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

    const smsText = `⏰ Time-off request: ${person.name} needs ${displayDate} off.${reason?.trim() ? ` Reason: ${reason.trim()}` : ''}`

    // Send email + SMS in parallel; both are best-effort (never fail the request)
    const [emailOk, ...smsResults] = await Promise.allSettled([
      sendEmail([ALERT_EMAIL], `⏰ Time-off request: ${person.name} – ${displayDate}`, emailBody),
      ...ALERT_PHONES.map(phone => sendSms(phone, smsText)),
    ])

    const emailSent = emailOk.status === 'fulfilled' && emailOk.value === true
    const smsSent   = smsResults.some(r => r.status === 'fulfilled' && r.value === true)

    const smsLog = smsResults.map((r, i) =>
      r.status === 'fulfilled' ? `${ALERT_PHONES[i]}:${r.value}` : `${ALERT_PHONES[i]}:ERR(${r.reason})`
    ).join(' ')

    if (!emailSent && !smsSent) {
      console.error('[time-off] Both email and SMS failed for', person.name, date, '| sms:', smsLog)
    } else {
      console.log(`[time-off] ${person.name} ${date} — email:${emailSent} sms:${smsSent} | ${smsLog}`)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[time-off POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
