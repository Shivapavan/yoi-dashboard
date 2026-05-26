import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSessionFromCookie } from '@/lib/auth'
import { scrapeAndStoreDay } from '@/lib/daily-data'

// Admin-only manual trigger: fetch a single business day from Lighthouse and
// upsert into daily_data. Use to backfill gaps when the nightly cron missed a day.
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sql = getDb()
  const rows = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  if (!rows[0]?.is_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })
  }

  try {
    const m = await scrapeAndStoreDay(date)
    if (!m) return NextResponse.json({ ok: false, reason: 'no data from Lighthouse (not yet finalized?)' })
    return NextResponse.json({ ok: true, date, gross: m.grossSales, net: m.netSales, taxes: m.taxes })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
