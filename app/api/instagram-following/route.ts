import { NextResponse } from 'next/server'
import { put, list } from '@vercel/blob'
import { scrapeFollowing, findCommonFollows } from '@/lib/scraper/instagram-following'

export const maxDuration = 300

// Blob key pattern: instagram-following-{username}.json
// Summary blob: instagram-following-summary.json

const SUMMARY_BLOB = 'instagram-following-summary.json'

// The competitor accounts we track on Instagram
const COMPETITOR_ACCOUNTS = [
  'yumofindia_mckinney',
  'jataraindiankitchen',
  '_nagskitchen_',
  'premaskitchen',
  'aaha_kitchen_celina',
  'saibhavancarrollton',
  'hyderabadhouse_prosper',
  'golconda_xpress_food_truck',
  'babai_bandi',
  'bharat_bhavan_allen',
  'desi_district_frisco',
  'desistreet_frisco',
]

interface RunState {
  status: 'idle' | 'running' | 'done' | 'failed'
  startedAt: string
  currentAccount?: string
  processed?: number
  total?: number
  blobUrl?: string
  error?: string
}

const STATE_BLOB = 'instagram-following-state.json'

async function readState(): Promise<RunState | null> {
  const { blobs } = await list({ prefix: STATE_BLOB })
  if (!blobs.length) return null
  const res = await fetch(blobs[0].url, { cache: 'no-store' })
  return res.ok ? (res.json() as Promise<RunState>) : null
}

async function writeState(state: RunState) {
  await put(STATE_BLOB, JSON.stringify(state), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true })
}

async function doScrape(usernames: string[]) {
  const sessionId = process.env.IG_SESSION_ID
  if (!sessionId) {
    await writeState({ status: 'failed', startedAt: new Date().toISOString(), error: 'Missing IG_SESSION_ID' })
    return
  }

  try {
    const results = []

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i]
      await writeState({ status: 'running', startedAt: new Date().toISOString(), currentAccount: username, processed: i, total: usernames.length })

      const result = await scrapeFollowing(username, sessionId, 10)
      if (result) results.push(result)

      // Store individual result
      await put(
        `instagram-following-${username}.json`,
        JSON.stringify(result),
        { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true }
      )

      await new Promise(r => setTimeout(r, 3000))
    }

    // Build summary with common follows analysis
    const commonFollows = findCommonFollows(results, 2)
    const summary = {
      lastUpdated: new Date().toISOString(),
      accountsScraped: results.length,
      accounts: results.map(r => ({
        username: r.username,
        displayName: r.displayName,
        totalFollowing: r.totalFetched,
        verifiedFollows: r.accounts.filter(a => a.isVerified).length,
        scrapedAt: r.scrapedAt,
      })),
      commonFollows: commonFollows.slice(0, 100),
      totalUniqueFollows: new Set(results.flatMap(r => r.accounts.map(a => a.username))).size,
    }

    const blob = await put(SUMMARY_BLOB, JSON.stringify(summary), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true })
    await writeState({ status: 'done', startedAt: new Date().toISOString(), blobUrl: blob.url, processed: results.length, total: usernames.length })
  } catch (e) {
    await writeState({ status: 'failed', startedAt: new Date().toISOString(), error: String(e) })
  }
}

// POST: start a scrape
// Body: { usernames?: string[] } — defaults to COMPETITOR_ACCOUNTS
export async function POST(req: Request) {
  const state = await readState()
  if (state?.status === 'running') {
    const staleSecs = Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000)
    if (staleSecs < 900) return NextResponse.json({ status: 'already_running' })
    // Stale — fall through and allow restart
  }

  const body = await req.json().catch(() => ({})) as { usernames?: string[] }
  const targets = body.usernames ?? COMPETITOR_ACCOUNTS

  await writeState({ status: 'running', startedAt: new Date().toISOString(), processed: 0, total: targets.length })
  doScrape(targets).catch(() => {})
  return NextResponse.json({ status: 'started', total: targets.length })
}

// GET: status check OR read a specific account's data
// ?username=xxx → returns that account's following list from blob
// (no params) → returns run state + summary if done
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')

  if (username) {
    const { blobs } = await list({ prefix: `instagram-following-${username}.json` })
    if (!blobs.length) return NextResponse.json({ error: 'No data for this account' }, { status: 404 })
    const res = await fetch(blobs[0].url, { cache: 'no-store' })
    return res.ok ? NextResponse.json(await res.json()) : NextResponse.json({ error: 'Failed to read' }, { status: 500 })
  }

  const state = await readState()
  if (!state) return NextResponse.json({ status: 'idle' })

  const elapsedSecs = Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000)

  // Auto-expire runs stuck > 15 min
  if (state.status === 'running' && elapsedSecs > 900) {
    await writeState({ status: 'failed', startedAt: state.startedAt, error: 'Timed out — Instagram rate limited or session expired. Try again later.' })
    return NextResponse.json({ status: 'failed', error: 'Timed out — Instagram rate limited or session expired. Try again later.' })
  }

  if (state.status === 'done' && state.blobUrl) {
    const summaryRes = await fetch(state.blobUrl, { cache: 'no-store' })
    const summary = summaryRes.ok ? await summaryRes.json() : null
    return NextResponse.json({ ...state, elapsedSecs, summary })
  }

  return NextResponse.json({ ...state, elapsedSecs })
}
