import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { scrapeAndStoreDay, getDailyData, ensureDailyDataTable } from '@/lib/daily-data'
import { getDb } from '@/lib/db'

// Backfill missing days in the daily_data table.
// GET /api/cron/backfill?start=2026-05-01&end=2026-06-28&force=false
//
// Protected by CRON_SECRET (same as other cron routes).
// Safe to run multiple times — skips dates already in DB unless ?force=true.
// Runs synchronously day-by-day; Vercel functions have a 60s limit on hobby,
// 300s on pro — cap the window to avoid timeouts.

export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const url = new URL(req.url)
  const startParam = url.searchParams.get('start')
  const endParam   = url.searchParams.get('end')
  const force      = url.searchParams.get('force') === 'true'

  if (!startParam || !endParam) {
    return NextResponse.json({ error: 'Missing required ?start=YYYY-MM-DD&end=YYYY-MM-DD params' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startParam) || !/^\d{4}-\d{2}-\d{2}$/.test(endParam)) {
    return NextResponse.json({ error: 'Dates must be in YYYY-MM-DD format' }, { status: 400 })
  }

  await ensureDailyDataTable()
  const sql = getDb()

  // Build list of calendar dates in range (inclusive)
  const dates: string[] = []
  const cur = new Date(startParam + 'T12:00:00Z')
  const end = new Date(endParam   + 'T12:00:00Z')
  // Don't backfill today or the future — live data belongs to the cron
  const todayUTC = new Date().toISOString().split('T')[0]
  while (cur <= end) {
    const d = cur.toISOString().split('T')[0]
    if (d < todayUTC) dates.push(d)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  if (dates.length === 0) {
    return NextResponse.json({ ok: true, message: 'No past dates in range to backfill' })
  }

  // Unless forced, find which dates are already stored
  let missing: string[]
  if (force) {
    missing = dates
  } else {
    const rows = await sql`
      SELECT date::text FROM daily_data WHERE date = ANY(${dates}::date[])
    ` as { date: string }[]
    const stored = new Set(rows.map(r => r.date.slice(0, 10)))
    missing = dates.filter(d => !stored.has(d))
  }

  const results: { date: string; ok: boolean; gross?: number; net?: number; reason?: string }[] = []

  for (const date of missing) {
    try {
      const metrics = await scrapeAndStoreDay(date)
      if (metrics) {
        results.push({ date, ok: true, gross: metrics.grossSales, net: metrics.netSales })
      } else {
        results.push({ date, ok: false, reason: 'Lighthouse returned no data (closed/holiday or API gap)' })
      }
    } catch (e: any) {
      results.push({ date, ok: false, reason: e.message })
    }
  }

  const filled  = results.filter(r => r.ok).length
  const failed  = results.filter(r => !r.ok).length
  const skipped = dates.length - missing.length

  return NextResponse.json({
    ok: true,
    range: { start: startParam, end: endParam },
    summary: { total: dates.length, skipped, attempted: missing.length, filled, failed },
    results,
  })
}
