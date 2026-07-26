# RestCall Analytics Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull RestCall's (dash.restcall.ai) AI-phone-order analytics into Postgres on a schedule, so it's available for the dashboard to display later.

**Architecture:** RestCall's dashboard has no public API (Clerk auth + Convex WebSocket sync, no REST/GraphQL surface) but its Analytics page can export an `.xlsx` snapshot of the current business day. A one-time interactive script logs in by hand (RestCall requires an emailed OTP, which cannot be scripted) and saves a reusable Playwright browser session. A scheduled GitHub Actions job reuses that saved session headlessly, clicks Export, parses the resulting spreadsheet, and upserts it into a new `restcall_daily_data` Postgres table — mirroring the existing `daily_data` table pattern in `lib/daily-data.ts`, but kept separate since RestCall only covers AI-phone-order revenue, not the restaurant's total sales (Lighthouse/Shift4 remains the source of truth for that).

**Tech Stack:** Playwright (already a dependency), `xlsx` (already a dependency), `@neondatabase/serverless` (already a dependency), Node's built-in `node:test` test runner (no new dependency), GitHub Actions cron.

**Out of scope for this plan:** displaying RestCall data anywhere in the dashboard UI. This plan only gets the data reliably into Postgres. A follow-up plan will cover the frontend once we know how the owner wants to see it.

## Global Constraints

- No new npm dependencies — `playwright`, `xlsx`, and `@neondatabase/serverless` are already in `package.json`.
- Standalone scripts in this repo are plain `.mjs` (not TypeScript, no `@/` path aliases) and read `DATABASE_URL` via `neon()` directly rather than importing `lib/db.ts` — follow `scripts/init-db.mjs` and `scripts/daily-refresh.mjs`'s existing convention exactly.
- `xlsx` is imported as `import * as XLSX from '../../node_modules/xlsx/xlsx.mjs'` (matches `scripts/daily-refresh.mjs:4`), not the package name — plain Node ESM import of the `xlsx` package name doesn't resolve cleanly in this repo's script setup.
- Business day = 4 AM America/Chicago, per `.claude/rules/data.md` — reuse that exact rule for the `date` key stored.
- Never commit `scripts/restcall/.session-state.json` (live session cookies) or any RestCall credential.
- The RestCall login requires an emailed OTP — there is no way to fully automate first login. The scheduled job must reuse a saved session rather than logging in fresh each run.

---

### Task 1: xlsx parser (`scripts/restcall/parse-analytics.mjs`)

**Files:**
- Create: `scripts/restcall/parse-analytics.mjs`
- Test: `scripts/restcall/parse-analytics.test.mjs`

**Interfaces:**
- Produces: `parseRestcallWorkbook(buffer: Buffer) -> RestcallMetrics` where `RestcallMetrics` is:
  ```
  {
    summary: { selectedRange, revenue, orders, averageTicket, cancellationRate, countedSales, allOrderOutcomes },
    comparison: { [metricName: string]: { current, previous, change } },
    financials: { revenue, grossItemSales, discounts, cashDiscounts, rewardRedemptions, netItemSales, taxes, tips, serviceCharges, deliveryFees, coveredOrders, breakdownCoverage },
    channels: [{ dimension, value, orders, revenue, orderShare, revenueShare }],
    outcomes: [{ status, orders, share }],
    dailyRevenue: [{ businessDate, revenue, orders, averageTicket }],
    hourlyVolume: [{ hour, orders, revenue, share }],
    categories: [{ category, qtySold, revenue, revenueShare }],
    topSellers: [{ rank, item, qtySold, revenue, avgRevenuePerUnit }],
    aiSummary: { customerCalls, spamCalls, callsWithIssues, issueRate, majorOrCritical, aiConversations, directTextOrders, attributedRevenue, conversionRate, deliveryFailures, actionRequired, staffHandoffs, postCallRecoveries, medianResponseSeconds, breakdowns: { [tableName: string]: [{ label, count }] } }
  }
  ```
  Task 3 imports this function directly.

This is the shape of the real export, confirmed by inspecting an actual downloaded file (`restcall-analytics-yum-of-india-2026-07-25-to-2026-07-25.xlsx`, sheets: Summary, Comparison, Financials, Channels, Outcomes, Daily Revenue, Hourly Volume, Categories, Top Sellers, AI Summary).

- [ ] **Step 1: Write the failing test**

Create `scripts/restcall/parse-analytics.test.mjs`:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from '../../node_modules/xlsx/xlsx.mjs'
import { parseRestcallWorkbook } from './parse-analytics.mjs'

function buildSampleWorkbook() {
  const wb = XLSX.utils.book_new()

  const summary = [
    ['Yum of India Analytics'],
    ['Today | Jul 25, 2026, 9:00 AM CDT to Jul 25, 2026, 4:58 PM CDT'],
    ['Generated Jul 25, 2026, 4:58 PM CDT | America/Chicago'],
    [],
    ['Metric', 'Value'],
    ['Selected range', 'Today'],
    ['Revenue', 57.16],
    ['Orders', 3],
    ['Average ticket', 19.05333333333333],
    ['Cancellation rate', 0],
    ['Counted sales', 3],
    ['All order outcomes', 3],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary')

  const comparison = [
    ['Metric', 'Current period', 'Previous period', 'Change'],
    ['Revenue', 57.16, 318.02, -0.8202628765486448],
    ['Orders', 3, 12, -0.75],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(comparison), 'Comparison')

  const financials = [
    ['Metric', 'Value', 'Definition'],
    ['Revenue', 57.16, 'Exact total across counted orders'],
    ['Gross item sales', 52.81, 'Explicit money-breakdown orders only'],
    ['Taxes', 4.35, 'Known tax buckets'],
    ['Covered orders', 3, '3 counted orders'],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(financials), 'Financials')

  const channels = [
    ['Dimension', 'Value', 'Orders', 'Revenue', 'Order share', 'Revenue share'],
    ['Source', 'Walk-in iPad', 3, 57.16, 1, 1],
    ['Fulfillment', 'Dine-in', 2, 55.01, 0.6666666666666666, 0.9623862841147657],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(channels), 'Channels')

  const outcomes = [
    ['Status', 'Orders', 'Share of outcomes'],
    ['Received', 0, 0],
    ['Ready', 1, 0.3333333333333333],
    ['Picked up', 2, 0.6666666666666666],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(outcomes), 'Outcomes')

  const dailyRevenue = [
    ['Business date', 'Revenue', 'Orders', 'Average ticket'],
    [new Date(2026, 6, 25), 57.16, 3, 19.05333333333333],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dailyRevenue), 'Daily Revenue')

  const hourlyVolume = [
    ['Restaurant-local hour', 'Orders', 'Revenue', 'Share of orders'],
    ['10 AM', 1, 2.15, 0.3333333333333333],
    ['3 PM', 1, 37.7, 0.3333333333333333],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hourlyVolume), 'Hourly Volume')

  const categories = [
    ['Category', 'Quantity sold', 'Item revenue', 'Revenue share'],
    ['Tandoor & Kebab', 1, 16.99, 0.3217193713311872],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(categories), 'Categories')

  const topSellers = [
    ['Rank', 'Menu item', 'Quantity sold', 'Revenue', 'Average revenue per unit'],
    [1, 'Masala Chai Large', 3, 5.97, 1.99],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(topSellers), 'Top Sellers')

  const aiSummary = [
    ['Call intelligence', 'Value'],
    ['Customer calls', 0],
    ['Spam / robocalls', 0],
    ['Calls with issues', 0],
    ['Issue rate', 0],
    ['Major or critical', 0],
    [],
    ['Call outcomes', 'Count'],
    [],
    ['Call issue categories', 'Count'],
    [],
    ['Message intelligence', 'Value'],
    ['AI conversations', 0],
    ['Direct text orders', 0],
    ['Attributed revenue', 0],
    ['Conversion rate', 0],
    ['Median response (seconds)', 'Not available'],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aiSummary), 'AI Summary')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

test('parses summary metrics', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.equal(result.summary.revenue, 57.16)
  assert.equal(result.summary.orders, 3)
  assert.equal(result.summary.selectedRange, 'Today')
})

test('parses financials', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.equal(result.financials.grossItemSales, 52.81)
  assert.equal(result.financials.coveredOrders, 3)
})

test('parses channels as an array of rows', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.equal(result.channels.length, 2)
  assert.deepEqual(result.channels[0], { dimension: 'Source', value: 'Walk-in iPad', orders: 3, revenue: 57.16, orderShare: 1, revenueShare: 1 })
})

test('parses top sellers', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.deepEqual(result.topSellers[0], { rank: 1, item: 'Masala Chai Large', qtySold: 3, revenue: 5.97, avgRevenuePerUnit: 1.99 })
})

test('parses AI summary scalars across stacked sections, ignoring empty count tables', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.equal(result.aiSummary.customerCalls, 0)
  assert.equal(result.aiSummary.aiConversations, 0)
  assert.equal(result.aiSummary.medianResponseSeconds, 'Not available')
  assert.deepEqual(result.aiSummary.breakdowns['Call outcomes'], [])
})

test('parses comparison deltas keyed by metric', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.equal(result.comparison['Revenue'].previous, 318.02)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/restcall/parse-analytics.test.mjs`
Expected: FAIL — `parse-analytics.mjs` doesn't exist yet (`Cannot find module`).

- [ ] **Step 3: Write the implementation**

Create `scripts/restcall/parse-analytics.mjs`:

```javascript
import * as XLSX from '../../node_modules/xlsx/xlsx.mjs'

function sheetAoa(wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null })
}

// Handles sheets built from one or more stacked "label | Value" / "label | Count"
// blocks (Summary, Financials, AI Summary). A row whose second column is the
// literal string "Value" or "Count" starts a new block; blank rows are just
// separators, not block boundaries — RestCall stacks several blocks per sheet.
function parseStackedKeyValueSheet(aoa) {
  const scalars = {}
  const countTables = {}
  let mode = null
  let currentCountTable = null

  for (const row of aoa) {
    const col0 = row?.[0] != null ? String(row[0]).trim() : ''
    const col1 = row?.[1]
    if (!col0) continue

    if (col1 === 'Value') { mode = 'value'; continue }
    if (col1 === 'Count') {
      mode = 'count'
      currentCountTable = col0
      countTables[currentCountTable] = []
      continue
    }
    if (mode === 'value') scalars[col0] = col1
    else if (mode === 'count' && currentCountTable) countTables[currentCountTable].push({ label: col0, count: col1 })
  }

  return { scalars, countTables }
}

function parseTabularSheet(aoa, columns) {
  return aoa.slice(1)
    .filter(row => row && row[0] != null)
    .map(row => Object.fromEntries(columns.map((key, i) => [key, row[i] ?? null])))
}

export function parseRestcallWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })

  const { scalars: summary } = parseStackedKeyValueSheet(sheetAoa(wb, 'Summary'))
  const { scalars: financials } = parseStackedKeyValueSheet(sheetAoa(wb, 'Financials'))
  const { scalars: aiScalars, countTables: aiBreakdowns } = parseStackedKeyValueSheet(sheetAoa(wb, 'AI Summary'))

  const comparisonRows = parseTabularSheet(sheetAoa(wb, 'Comparison'), ['metric', 'current', 'previous', 'change'])
  const comparison = Object.fromEntries(comparisonRows.map(r => [r.metric, { current: r.current, previous: r.previous, change: r.change }]))

  const channels = parseTabularSheet(sheetAoa(wb, 'Channels'), ['dimension', 'value', 'orders', 'revenue', 'orderShare', 'revenueShare'])
  const outcomes = parseTabularSheet(sheetAoa(wb, 'Outcomes'), ['status', 'orders', 'share'])
  const dailyRevenue = parseTabularSheet(sheetAoa(wb, 'Daily Revenue'), ['businessDate', 'revenue', 'orders', 'averageTicket'])
    .map(r => ({ ...r, businessDate: r.businessDate instanceof Date ? r.businessDate.toISOString().slice(0, 10) : r.businessDate }))
  const hourlyVolume = parseTabularSheet(sheetAoa(wb, 'Hourly Volume'), ['hour', 'orders', 'revenue', 'share'])
  const categories = parseTabularSheet(sheetAoa(wb, 'Categories'), ['category', 'qtySold', 'revenue', 'revenueShare'])
  const topSellers = parseTabularSheet(sheetAoa(wb, 'Top Sellers'), ['rank', 'item', 'qtySold', 'revenue', 'avgRevenuePerUnit'])

  return {
    summary: {
      selectedRange: summary['Selected range'] ?? null,
      revenue: summary['Revenue'] ?? 0,
      orders: summary['Orders'] ?? 0,
      averageTicket: summary['Average ticket'] ?? 0,
      cancellationRate: summary['Cancellation rate'] ?? 0,
      countedSales: summary['Counted sales'] ?? 0,
      allOrderOutcomes: summary['All order outcomes'] ?? 0,
    },
    comparison,
    financials: {
      revenue: financials['Revenue'] ?? 0,
      grossItemSales: financials['Gross item sales'] ?? 0,
      discounts: financials['Discounts'] ?? 0,
      cashDiscounts: financials['Cash discounts'] ?? 0,
      rewardRedemptions: financials['Reward redemptions'] ?? 0,
      netItemSales: financials['Net item sales'] ?? 0,
      taxes: financials['Taxes'] ?? 0,
      tips: financials['Tips'] ?? 0,
      serviceCharges: financials['Service charges'] ?? 0,
      deliveryFees: financials['Delivery fees'] ?? 0,
      coveredOrders: financials['Covered orders'] ?? 0,
      breakdownCoverage: financials['Breakdown coverage'] ?? 0,
    },
    channels,
    outcomes,
    dailyRevenue,
    hourlyVolume,
    categories,
    topSellers,
    aiSummary: {
      customerCalls: aiScalars['Customer calls'] ?? 0,
      spamCalls: aiScalars['Spam / robocalls'] ?? 0,
      callsWithIssues: aiScalars['Calls with issues'] ?? 0,
      issueRate: aiScalars['Issue rate'] ?? 0,
      majorOrCritical: aiScalars['Major or critical'] ?? 0,
      aiConversations: aiScalars['AI conversations'] ?? 0,
      directTextOrders: aiScalars['Direct text orders'] ?? 0,
      attributedRevenue: aiScalars['Attributed revenue'] ?? 0,
      conversionRate: aiScalars['Conversion rate'] ?? 0,
      deliveryFailures: aiScalars['Delivery failures'] ?? 0,
      actionRequired: aiScalars['Action required'] ?? 0,
      staffHandoffs: aiScalars['Staff handoffs'] ?? 0,
      postCallRecoveries: aiScalars['Post-call recoveries'] ?? 0,
      medianResponseSeconds: aiScalars['Median response (seconds)'] ?? null,
      breakdowns: aiBreakdowns,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/restcall/parse-analytics.test.mjs`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/restcall/parse-analytics.mjs scripts/restcall/parse-analytics.test.mjs
git commit -m "feat: add RestCall analytics xlsx parser"
```

---

### Task 2: Interactive session bootstrap script (`scripts/restcall/bootstrap-session.mjs`)

**Files:**
- Create: `scripts/restcall/bootstrap-session.mjs`
- Modify: `.gitignore` (add the session state file)

**Interfaces:**
- Produces: a local file `scripts/restcall/.session-state.json` (Playwright `storageState` JSON — cookies + localStorage) that Task 3's script reads.

RestCall's login is email + password + an OTP emailed to the owner — there is no way to script this part. This script opens a real, visible browser window, waits for a human to complete login, then captures the resulting session.

- [ ] **Step 1: Add the session file to `.gitignore`**

Modify `/Users/shiva/claude_projects/YOI-Dashboard/.gitignore`, add a line:

```
scripts/restcall/.session-state.json
```

- [ ] **Step 2: Write the script**

Create `scripts/restcall/bootstrap-session.mjs`:

```javascript
/**
 * Run locally once, and again whenever the saved session expires, to log
 * into RestCall by hand and capture a reusable browser session for the
 * scheduled sync job. RestCall's login requires an emailed OTP, so this
 * step can't be scripted — you complete it in a real, visible browser window.
 *
 * Usage: node scripts/restcall/bootstrap-session.mjs
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SESSION_PATH = join(__dirname, '.session-state.json')

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()
const page = await context.newPage()

await page.goto('https://dash.restcall.ai/dashboard/analytics')

console.log('\nA browser window is open. Log in by hand (email + password + the OTP')
console.log('emailed to you). This script will detect the dashboard and save your')
console.log('session automatically once you land on it.\n')

await page.waitForURL('**/dashboard/analytics', { timeout: 5 * 60 * 1000 })
// Give the page a moment to finish its authenticated requests before snapshotting storage.
await page.waitForTimeout(2000)

await context.storageState({ path: SESSION_PATH })
await browser.close()

console.log(`Session saved to ${SESSION_PATH}`)
console.log('\nTo use it in GitHub Actions, base64-encode it and set it as the')
console.log('RESTCALL_SESSION_STATE repo secret:\n')
console.log(`  base64 -i ${SESSION_PATH} | pbcopy`)
console.log('  (then paste into: repo Settings -> Secrets and variables -> Actions -> New secret)\n')
```

- [ ] **Step 3: Run it and verify the session file**

Run: `node scripts/restcall/bootstrap-session.mjs`

A Chrome window opens to the RestCall analytics page. Log in with email/password, then enter the OTP emailed to you. Once the dashboard loads, the script prints "Session saved to ..." and exits on its own.

Verify the file is real and non-empty:

```bash
node -e "const s = JSON.parse(require('fs').readFileSync('scripts/restcall/.session-state.json')); console.log('cookies:', s.cookies.length, 'origins:', s.origins.length)"
```

Expected: both counts are greater than 0.

- [ ] **Step 4: Confirm it's git-ignored**

Run: `git status --short scripts/restcall/`
Expected: `.session-state.json` does NOT appear (only `bootstrap-session.mjs` shows as untracked, if not yet committed).

- [ ] **Step 5: Commit**

```bash
git add scripts/restcall/bootstrap-session.mjs .gitignore
git commit -m "feat: add RestCall session bootstrap script"
```

---

### Task 3: Scheduled sync script (`scripts/restcall/sync-analytics.mjs`)

**Files:**
- Create: `scripts/restcall/sync-analytics.mjs`
- Modify: `.env.example` (document `DATABASE_URL`, which was missing despite being required by `lib/db.ts`)

**Interfaces:**
- Consumes: `parseRestcallWorkbook(buffer)` from Task 1 (`./parse-analytics.mjs`); the session file from Task 2 (`scripts/restcall/.session-state.json`, or `RESTCALL_SESSION_STATE` env var in CI).
- Produces: rows in a new `restcall_daily_data` Postgres table (`date DATE PRIMARY KEY, metrics JSONB, scraped_at TIMESTAMPTZ, updated_at TIMESTAMPTZ`) — Task 4 (the GitHub Actions workflow) invokes this script directly, and any future frontend work reads from this table.

- [ ] **Step 1: Add `DATABASE_URL` to `.env.example`**

Modify `/Users/shiva/claude_projects/YOI-Dashboard/.env.example`, add near the top:

```
DATABASE_URL=your_neon_postgres_connection_string_here
```

- [ ] **Step 2: Write the script**

Create `scripts/restcall/sync-analytics.mjs`:

```javascript
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
```

- [ ] **Step 3: Run it locally in headed/debug mode first**

Make sure Task 2 has already produced `scripts/restcall/.session-state.json`, and `DATABASE_URL` is set in `.env.local`.

Run: `node scripts/restcall/sync-analytics.mjs --headed`

This opens a visible browser, navigates to the analytics page using your saved session, and pauses (Playwright Inspector) right before clicking Export. Use the Inspector's element picker to confirm `getByRole('button', { name: /export/i })` actually matches RestCall's export button.

- **If it matches:** click "Resume" in the Inspector toolbar and let the script finish.
- **If it doesn't match:** note the real accessible name/role shown by the picker, update the `exportButton` locator line in `sync-analytics.mjs` to match (e.g. `page.getByText('Download report')` or a specific `data-testid`), then re-run this step.

- [ ] **Step 4: Verify the run end-to-end**

Expected console output: `Stored RestCall analytics for YYYY-MM-DD: revenue=..., orders=...` with real numbers.

Then confirm the row landed in Postgres (matches this repo's existing `.env.local`-reading convention — no `dotenv` dependency needed):

```bash
node --input-type=module -e "
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
const env = readFileSync('.env.local', 'utf8');
const match = env.match(/^DATABASE_URL=\"?([^\"\n]+)\"?/m);
const sql = neon(match[1]);
const rows = await sql\`SELECT date, metrics->'summary' as summary, updated_at FROM restcall_daily_data ORDER BY date DESC LIMIT 1\`;
console.log(rows);
"
```

Expected: one row, with `summary` matching what the console printed in Step 3/4's live run.

- [ ] **Step 5: Run again headless (non-debug) to confirm the unattended path works**

Run: `node scripts/restcall/sync-analytics.mjs`
Expected: same success output, no browser window shown, exits code 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/restcall/sync-analytics.mjs .env.example
git commit -m "feat: add RestCall analytics sync script"
```

---

### Task 4: Scheduled GitHub Actions workflow

**Files:**
- Create: `.github/workflows/restcall-sync.yml`

**Interfaces:**
- Consumes: `scripts/restcall/sync-analytics.mjs` (Task 3), repo secrets `RESTCALL_SESSION_STATE` and `DATABASE_URL`.

- [ ] **Step 1: Add the GitHub repo secrets**

In the GitHub UI: repo → Settings → Secrets and variables → Actions → New repository secret.

- `RESTCALL_SESSION_STATE`: `base64 -i scripts/restcall/.session-state.json` output from Task 2, Step 3.
- `DATABASE_URL`: same Neon connection string already used for Vercel/`​.env.local`.

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/restcall-sync.yml`:

```yaml
name: RestCall Analytics Sync

on:
  schedule:
    # Every 2 hours, roughly covering restaurant operating hours in America/Chicago (UTC-5 during CDT).
    - cron: '5 13,15,17,19,21,23,1,3 * * *'
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: node scripts/restcall/sync-analytics.mjs
        env:
          RESTCALL_SESSION_STATE: ${{ secrets.RESTCALL_SESSION_STATE }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

- [ ] **Step 3: Trigger it manually and verify**

Push the workflow file, then in GitHub: Actions tab → "RestCall Analytics Sync" → "Run workflow" (uses `workflow_dispatch`).

Expected: the run succeeds (green check), and its log ends with the same `Stored RestCall analytics for ...` line seen locally in Task 3.

- [ ] **Step 4: Re-check Postgres**

Re-run the query from Task 3 Step 4 and confirm `updated_at` is now very recent (from the GitHub Actions run, not your local one).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/restcall-sync.yml
git commit -m "feat: schedule RestCall analytics sync via GitHub Actions"
```

---

## Known limitation to flag to the owner after this ships

The saved session (`RESTCALL_SESSION_STATE`) will eventually expire — Clerk session lifetime for this app hasn't been observed yet, so there's no known rotation cadence. When the scheduled job starts failing (check the GitHub Actions tab, or watch for `restcall_daily_data.updated_at` going stale), the fix is: re-run Task 2's bootstrap script locally, then update the `RESTCALL_SESSION_STATE` GitHub secret with the new value. This is the same rhythm as the existing Lighthouse token rotation the owner already does.
