import { getDb } from '@/lib/db'

// Populated by scripts/restcall/sync-analytics.mjs (GitHub Actions cron).
// Separate from daily_data (Lighthouse/Shift4) — RestCall covers AI-phone-order
// revenue processed through Stripe Terminal, a channel Lighthouse never sees.
export async function ensureRestcallDataTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS restcall_daily_data (
      date        DATE PRIMARY KEY,
      metrics     JSONB NOT NULL,
      scraped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export async function getRestcallRevenue(date: string): Promise<number> {
  await ensureRestcallDataTable()
  const sql = getDb()
  const rows = await sql`SELECT metrics FROM restcall_daily_data WHERE date = ${date}`
  if (rows.length === 0) return 0
  const revenue = (rows[0].metrics as any)?.summary?.revenue
  return typeof revenue === 'number' ? revenue : 0
}
