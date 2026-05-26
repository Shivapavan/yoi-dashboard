import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { fetchPlaceReviews } from '@/lib/google-places'
import { getValidGmailClient, sendEmail } from '@/lib/gmail'
import { sendSms } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { scrapeAndStoreDay } from '@/lib/daily-data'
import { requireCronAuth } from '@/lib/cron-auth'

// Email recipients — used for review alerts because US A2P 10DLC blocks
// unregistered long-code SMS to consumer phones (error 30034).
const REVIEW_ALERT_EMAILS  = ['shivapavankumar@gmail.com', 'rpolanki02@gmail.com']
const BILLING_ALERT_EMAILS = ['shivapavankumar@gmail.com']

// SMS fallback — sent as a second channel in case email is delayed.
const REVIEW_ALERT_PHONES  = ['+19032709884', '+18482195090', '+14049180968']
const BILLING_ALERT_PHONES = ['+19032709884', '+18482195090']

export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const result: any = { ok: true, reviews: {}, billing: {} }
  const sql = getDb()

  // ── Schema (idempotent) ───────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS seen_reviews (
      id           VARCHAR(255) PRIMARY KEY,
      rating       INTEGER NOT NULL,
      author       VARCHAR(255),
      text         TEXT,
      publish_time TIMESTAMPTZ,
      seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      alerted      BOOLEAN NOT NULL DEFAULT false
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS seen_billing_emails (
      message_id VARCHAR(255) PRIMARY KEY,
      subject    TEXT,
      seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  // ── Reviews check ─────────────────────────────────────────────────────────
  // Logic: alert on any review with `alerted=false` AND rating <= 3.
  // The /api/reviews endpoint inserts rows with alerted=false (just storing them);
  // this cron is the only place that flips alerted=true. That separation makes sure
  // user viewing the Reviews tab no longer suppresses cron alerts.
  try {
    const summary = await fetchPlaceReviews()
    if (summary && summary.reviews.length > 0) {
      // First-time bootstrap: if no review has EVER been alerted, silently mark
      // all current reviews as alerted (don't spam SMS for existing history).
      const everAlertedRow = await sql`SELECT COUNT(*) FILTER (WHERE alerted = true) AS c FROM seen_reviews`
      const isBootstrap = Number(everAlertedRow[0]?.c ?? 0) === 0
      let alertsSent = 0
      let inspected = 0

      for (const r of summary.reviews) {
        inspected++
        // Insert if new (preserve alerted state on conflict — don't overwrite)
        await sql`
          INSERT INTO seen_reviews (id, rating, author, text, publish_time, alerted)
          VALUES (${r.id}, ${r.rating}, ${r.author}, ${r.text}, ${r.publishTime || null}, ${isBootstrap})
          ON CONFLICT (id) DO NOTHING
        `
        // Check current alerted state for this review
        const stateRow = await sql`SELECT alerted FROM seen_reviews WHERE id = ${r.id}`
        const alreadyAlerted = !!stateRow[0]?.alerted

        if (alreadyAlerted) continue

        // Send EMAIL for unalerted ≤3-star reviews (skip during bootstrap)
        if (!isBootstrap && r.rating <= 3) {
          const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)
          const subject = `⚠️ New ${r.rating}-star review on Yum of India — ${r.author}`
          const body = [
            `A new ${r.rating}-star review just came in on Google.`,
            ``,
            `Reviewer: ${r.author}`,
            `Rating: ${stars} (${r.rating}/5)`,
            `Posted: ${r.relativeTime || r.publishTime || '(unknown)'}`,
            ``,
            `Review:`,
            `"${r.text || '(no text)'}"`,
            ``,
            `View on Google Maps: https://www.google.com/maps/place/Yum+Of+India+McKinney`,
            ``,
            `— Yum of India Dashboard`,
          ].join('\n')

          // Try email first (reliable). Also try SMS as backup.
          await sendEmail(REVIEW_ALERT_EMAILS, subject, body)
          await Promise.all(REVIEW_ALERT_PHONES.map(p => sendSms(p, `⚠️ New ${r.rating}★ review from ${r.author} — check email for details.`)))
          alertsSent++
        }
        // Mark as alerted regardless of rating, so we don't re-process this review
        await sql`UPDATE seen_reviews SET alerted = true WHERE id = ${r.id}`
      }
      result.reviews = { bootstrap: isBootstrap, checked: inspected, alertsSent }
    } else {
      result.reviews = { error: 'no reviews returned' }
    }
  } catch (e: any) { result.reviews = { error: e.message } }

  // ── Google Cloud billing alert check ──────────────────────────────────────
  try {
    const auth = await getValidGmailClient()
    if (auth) {
      const gmail = google.gmail({ version: 'v1', auth })
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: '(from:billing-noreply@google.com OR from:googlecloud-noreply@google.com OR subject:"budget alert" OR (subject:"Google Cloud" subject:billing)) newer_than:2d',
        maxResults: 10,
      })
      const messages = listRes.data.messages || []
      let billingAlerts = 0

      for (const msg of messages) {
        if (!msg.id) continue
        const seenRows = await sql`SELECT message_id FROM seen_billing_emails WHERE message_id = ${msg.id} LIMIT 1`
        if (seenRows.length > 0) continue

        const fullMsg = await gmail.users.messages.get({
          userId: 'me', id: msg.id, format: 'metadata',
          metadataHeaders: ['Subject', 'From'],
        })
        const headers = fullMsg.data.payload?.headers || []
        const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)'
        const from    = headers.find(h => h.name === 'From')?.value || ''

        await sql`INSERT INTO seen_billing_emails (message_id, subject) VALUES (${msg.id}, ${subject}) ON CONFLICT (message_id) DO NOTHING`

        // Only alert on actual billing/charge notifications
        const isBilling = /billing|budget|charge|invoice|payment|amount/i.test(subject)
          && /google|cloud/i.test(from + ' ' + subject)
        if (!isBilling) continue

        const emailBody = `Google Cloud sent a billing-related email:\n\nSubject: ${subject}\n\nCheck console.cloud.google.com/billing to review charges.\n\n— Yum of India Dashboard`
        await sendEmail(BILLING_ALERT_EMAILS, `⚠️ Google Cloud billing alert: ${subject.slice(0, 100)}`, emailBody)
        await Promise.all(BILLING_ALERT_PHONES.map(p => sendSms(p, `⚠️ Google Cloud billing alert — check email.`)))
        billingAlerts++
      }
      result.billing = { scanned: messages.length, alerts: billingAlerts }
    } else {
      result.billing = { error: 'Gmail not connected' }
    }
  } catch (e: any) { result.billing = { error: e.message } }

  // ── Lighthouse token expiry warning ───────────────────────────────────────
  // Decode LIGHTHOUSE_TOKEN.exp and alert if it expires within the next 6 hours.
  try {
    const token = process.env.LIGHTHOUSE_TOKEN
    if (!token) {
      result.token = { error: 'LIGHTHOUSE_TOKEN not set' }
    } else {
      const payloadB64 = token.split('.')[1]
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
      const exp = Number(payload.exp || 0)
      const now = Math.floor(Date.now() / 1000)
      const secondsLeft = exp - now
      const hoursLeft = Math.max(0, Math.round(secondsLeft / 360) / 10)

      result.token = { expSecondsLeft: secondsLeft, hoursLeft }

      const WARN_WINDOW_SEC = 6 * 3600
      if (secondsLeft > 0 && secondsLeft <= WARN_WINDOW_SEC) {
        const expWhen = new Date(exp * 1000).toLocaleString('en-US', {
          timeZone: 'America/Chicago',
          weekday: 'short', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }) + ' CDT'

        const subject = `⏰ Lighthouse token expires in ${hoursLeft}h — rotate soon`
        const body = [
          `The Lighthouse session token will expire at ${expWhen} (~${hoursLeft} hours from now).`,
          ``,
          `To rotate:`,
          `  1. Sign in at https://lh.shift4.com → copy the fresh JWT from network tab`,
          `  2. Send the JWT to Claude and say "update token"`,
          ``,
          `If the token expires before you rotate, the End-of-Day / Sales / Items data on the`,
          `dashboard will show empty until you swap a new one in.`,
          ``,
          `— Yum of India Dashboard`,
        ].join('\n')

        const emailOk = await sendEmail(['shivapavankumar@gmail.com'], subject, body)
        const smsOk   = await sendSms('+19032709884', `⏰ Lighthouse token expires in ~${hoursLeft}h — rotate soon. Check email.`)
        result.token.emailSent = emailOk
        result.token.smsSent   = smsOk
        result.token.alerted   = emailOk || smsOk
      } else if (secondsLeft <= 0) {
        // Already expired — still send one alert in case the morning email was missed
        const subject = `🚨 Lighthouse token EXPIRED — dashboard data will be empty until rotated`
        const body = `The Lighthouse session token has already expired. Sign in to lh.shift4.com and send Claude a fresh JWT to restore data.`
        const emailOk = await sendEmail(['shivapavankumar@gmail.com'], subject, body)
        const smsOk   = await sendSms('+19032709884', `🚨 Lighthouse token EXPIRED — rotate now.`)
        result.token.emailSent = emailOk
        result.token.smsSent   = smsOk
        result.token.alerted   = emailOk || smsOk
        result.token.expired   = true
      }
    }
  } catch (e: any) { result.token = { error: e.message } }

  // ── Snapshot TODAY's running totals into daily_data ───────────────────────
  // Lighthouse's activity-summary only authorizes "current" business-day queries
  // (past-date queries return 401 even with a valid token), so we snapshot the
  // in-progress day. Cron will fire multiple times across the day if you run a
  // higher tier; on Hobby it fires once. The last snapshot before 4 AM CDT (when
  // the business day ends) becomes the permanent record.
  try {
    const nowShifted = new Date(Date.now() - 4 * 60 * 60 * 1000)
    const today = nowShifted.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const m = await scrapeAndStoreDay(today)
    result.scrape = m
      ? { date: today, ok: true, gross: m.grossSales, net: m.netSales, note: 'snapshot of in-progress business day' }
      : { date: today, ok: false, reason: 'no data from Lighthouse' }
  } catch (e: any) { result.scrape = { error: e.message } }

  return NextResponse.json(result)
}
