/**
 * One-off / occasional utility: backfills scripts/restcall/sync-analytics.mjs's
 * missing historical days by walking RestCall's Custom Range picker one day at
 * a time (From = To = that day), exporting, parsing, and upserting into
 * restcall_daily_data — same table/shape the scheduled sync writes to.
 *
 * Reuses the local session from bootstrap-session.mjs (does not work in CI —
 * this is a local, run-when-needed tool, not part of the scheduled job).
 *
 * Usage: node scripts/restcall/backfill.mjs 2026-06-27 2026-07-25
 */
import { chromium } from 'playwright'
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseRestcallWorkbook } from './parse-analytics.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, '../../.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {}
}
loadEnv()

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

async function exportDay(page, date) {
  // Reload fresh each time: after a custom range is applied once, the range
  // button's label changes (loses the word "Since"), so a text-based selector
  // that worked on the first day breaks on the second. Reloading resets it to
  // the default "TODAY | Since 9:00 AM" state, keeping the selector reliable.
  await page.goto('https://dash.restcall.ai/dashboard/analytics', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  const laterButton = page.getByRole('button', { name: /^later$/i })
  if (await laterButton.isVisible({ timeout: 2000 }).catch(() => false)) await laterButton.click()

  await page.locator('button:has-text("Since")').first().click()
  await page.waitForTimeout(400)
  const dateInputs = page.locator('input[type="date"]')
  await dateInputs.nth(0).fill(date)
  await page.keyboard.press('Tab')
  await dateInputs.nth(1).fill(date)
  await page.keyboard.press('Tab')
  await page.getByRole('button', { name: /apply range/i }).click()
  await page.waitForTimeout(1200)

  await page.getByRole('button', { name: /export/i }).first().click()
  await page.waitForTimeout(400)
  const excelOption = page.getByText('Excel workbook', { exact: false }).first()
  await excelOption.waitFor({ state: 'visible', timeout: 10000 })
  const downloadPromise = page.waitForEvent('download')
  await excelOption.click()
  const download = await downloadPromise
  const filePath = await download.path()
  if (!filePath) throw new Error(`Download did not produce a file path for ${date}`)
  return readFileSync(filePath)
}

async function run() {
  const [, , fromArg, toArg] = process.argv
  if (!fromArg || !toArg) {
    console.error('Usage: node scripts/restcall/backfill.mjs <from-date> <to-date>  (YYYY-MM-DD, inclusive)')
    process.exit(1)
  }
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) throw new Error('DATABASE_URL is not set')
  const sql = neon(dbUrl)
  await sql`
    CREATE TABLE IF NOT EXISTS restcall_daily_data (
      date        DATE PRIMARY KEY,
      metrics     JSONB NOT NULL,
      scraped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  const dates = []
  for (let d = fromArg; d <= toArg; d = addDays(d, 1)) dates.push(d)
  console.log(`Backfilling ${dates.length} day(s): ${fromArg} .. ${toArg}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    storageState: join(__dirname, '.session-state.json'),
    acceptDownloads: true,
  })
  const page = await context.newPage()

  for (const date of dates) {
    try {
      const buffer = await exportDay(page, date)
      const metrics = parseRestcallWorkbook(buffer)
      await sql`
        INSERT INTO restcall_daily_data (date, metrics, scraped_at, updated_at)
        VALUES (${date}, ${JSON.stringify(metrics)}, NOW(), NOW())
        ON CONFLICT (date) DO UPDATE
          SET metrics = EXCLUDED.metrics, updated_at = NOW()
      `
      console.log(`  ${date}: revenue=${metrics.summary.revenue}, orders=${metrics.summary.orders}`)
    } catch (err) {
      console.error(`  ${date}: FAILED — ${err.message}`)
    }
  }

  await browser.close()
  console.log('Backfill complete.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
