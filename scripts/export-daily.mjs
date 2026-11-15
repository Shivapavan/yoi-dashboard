/**
 * Dumps daily_data (Lighthouse) and restcall_daily_data rows for a date range
 * as JSON to stdout. Used by the "Export Daily Data" workflow, which encrypts
 * the output before it reaches the (public) Actions log.
 *
 * Usage: node scripts/export-daily.mjs 2026-08-01 2026-10-31
 */
import { neon } from '@neondatabase/serverless'

const [from, to] = process.argv.slice(2)
if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) {
  console.error('Usage: node scripts/export-daily.mjs <from> <to>  (YYYY-MM-DD, inclusive)')
  process.exit(1)
}
const sql = neon(process.env.DATABASE_URL)
const lighthouse = await sql`
  SELECT date::text AS date, metrics, scraped_at, updated_at FROM daily_data
  WHERE date BETWEEN ${from} AND ${to} ORDER BY date`
const restcall = await sql`
  SELECT date::text AS date, metrics, scraped_at, updated_at FROM restcall_daily_data
  WHERE date BETWEEN ${from} AND ${to} ORDER BY date`
process.stdout.write(JSON.stringify({ from, to, lighthouse, restcall }))
