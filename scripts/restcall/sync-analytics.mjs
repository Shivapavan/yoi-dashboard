/**
 * Scheduled job: logs into RestCall using a saved session (from
 * bootstrap-session.mjs), exports today's analytics as .xlsx, parses it,
 * and stores it in Postgres.
 *
 * Local usage:  node scripts/restcall/sync-analytics.mjs
 * CI usage:     RESTCALL_SESSION_STATE=<base64> DATABASE_URL=<url> node scripts/restcall/sync-analytics.mjs
 * Debug (headed browser, pauses before the export click so you can confirm
 * or fix the button selector):  node scripts/restcall/sync-analytics.mjs --headed
 */
import { chromium } from 'playwright'
import { neon } from '@neondatabase/serverless'
import { readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
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

function resolveStorageStatePath() {
  if (process.env.RESTCALL_SESSION_STATE) {
    const dir = mkdtempSync(join(tmpdir(), 'restcall-session-'))
    const path = join(dir, 'state.json')
    writeFileSync(path, Buffer.from(process.env.RESTCALL_SESSION_STATE, 'base64').toString('utf8'))
    return path
  }
  return join(__dirname, '.session-state.json')
}

// Business day starts 4 AM Central — same rule as the Lighthouse pipeline (.claude/rules/data.md).
function businessDateCentral() {
  const now = new Date(Date.now() - 4 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

async function run() {
  const headed = process.argv.includes('--headed')
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) throw new Error('DATABASE_URL is not set')

  const browser = await chromium.launch({ headless: !headed })
  const context = await browser.newContext({ storageState: resolveStorageStatePath(), acceptDownloads: true })
  const page = await context.newPage()

  await page.goto('https://dash.restcall.ai/dashboard/analytics', { waitUntil: 'networkidle' })

  if (headed) await page.pause() // Playwright Inspector: confirm/fix the selector below before it clicks.

  const exportButton = page.getByRole('button', { name: /export/i }).first()
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise

  const filePath = await download.path()
  if (!filePath) throw new Error('Download did not produce a file path')
  const buffer = readFileSync(filePath)

  await browser.close()

  const metrics = parseRestcallWorkbook(buffer)
  const date = businessDateCentral()

  const sql = neon(dbUrl)
  await sql`
    CREATE TABLE IF NOT EXISTS restcall_daily_data (
      date        DATE PRIMARY KEY,
      metrics     JSONB NOT NULL,
      scraped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    INSERT INTO restcall_daily_data (date, metrics, scraped_at, updated_at)
    VALUES (${date}, ${JSON.stringify(metrics)}, NOW(), NOW())
    ON CONFLICT (date) DO UPDATE
      SET metrics = EXCLUDED.metrics, updated_at = NOW()
  `

  console.log(`Stored RestCall analytics for ${date}: revenue=${metrics.summary.revenue}, orders=${metrics.summary.orders}`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
