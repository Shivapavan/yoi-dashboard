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

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 2000

// RestCall's Clerk-based login shows a sign-in overlay without ever changing
// the URL away from /dashboard/analytics, so waiting for a URL change never
// detects a real login — it resolves instantly, before you've logged in at
// all. Instead, poll for the actual Clerk session cookie (__session / a
// __session_<instance> variant), which only appears after a real login.
async function waitForAuthenticatedSession(context, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const cookies = await context.cookies()
    if (cookies.some((c) => c.name.startsWith('__session'))) return
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(
    `Timed out after ${Math.round(timeoutMs / 60000)} minutes waiting for login ` +
    `(no __session cookie appeared). Log in fully — email, password, and the emailed OTP — then re-run this script.`
  )
}

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()
const page = await context.newPage()

await page.goto('https://dash.restcall.ai/dashboard/analytics')

console.log('\nA browser window is open. Log in by hand (email + password + the OTP')
console.log('emailed to you). This script polls for the real Clerk session cookie —')
console.log('it will only save once you have actually finished logging in.\n')

try {
  await waitForAuthenticatedSession(context, LOGIN_TIMEOUT_MS)
} catch (err) {
  await browser.close()
  console.error(`\n${err.message}\n`)
  process.exit(1)
}

// Give the page a moment to finish its authenticated requests before snapshotting storage.
await page.waitForTimeout(2000)

await context.storageState({ path: SESSION_PATH })
await browser.close()

console.log(`Session saved to ${SESSION_PATH}`)
console.log('\nTo use it in GitHub Actions, base64-encode it and set it as the')
console.log('RESTCALL_SESSION_STATE repo secret:\n')
console.log(`  base64 -i ${SESSION_PATH} | pbcopy`)
console.log('  (then paste into: repo Settings -> Secrets and variables -> Actions -> New secret)\n')
