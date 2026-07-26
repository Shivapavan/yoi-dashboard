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
