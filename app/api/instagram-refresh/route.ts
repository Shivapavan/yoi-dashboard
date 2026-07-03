import { NextRequest, NextResponse, after } from 'next/server'
import { put, list } from '@vercel/blob'
import { scrapeAccounts } from '@/lib/scraper/instagram'
import { IG_ACCOUNTS, buildIntel } from '@/lib/scraper/instagram-intel'

export const maxDuration = 300

interface IgRunState {
  status: 'running' | 'done' | 'failed'
  startedAt: string
  finishedAt?: string
  elapsedSecs?: number
  blobUrl?: string
  error?: string
}

const RUN_STATE_BLOB = 'instagram-run-state.json'

async function getRunState(): Promise<IgRunState | null> {
  try {
    const { blobs } = await list({ prefix: RUN_STATE_BLOB })
    if (!blobs.length) return null
    const res = await fetch(blobs[0].url, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json() as IgRunState
  } catch {
    return null
  }
}

async function setRunState(state: IgRunState): Promise<void> {
  await put(RUN_STATE_BLOB, JSON.stringify(state), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
}

// POST — start a self-hosted scrape
export async function POST(req: NextRequest) {
  void req
  try {
    const sessionId = process.env.IG_SESSION_ID
    if (!sessionId) {
      return NextResponse.json({ error: 'IG_SESSION_ID not configured' }, { status: 500 })
    }

    const existing = await getRunState()
    if (existing?.status === 'running') {
      const staleSecs = Math.round((Date.now() - new Date(existing.startedAt).getTime()) / 1000)
      if (staleSecs < 5400) {
        return NextResponse.json({ status: 'already_running', startedAt: existing.startedAt })
      }
    }

    const startedAt = new Date().toISOString()
    try { await setRunState({ status: 'running', startedAt }) } catch { /* non-fatal */ }

    const doScrape = async () => {
      try {
        const profiles = await scrapeAccounts(IG_ACCOUNTS, sessionId, 30)
        const intel = buildIntel(profiles)

        const blob = await put('instagram-intel.json', JSON.stringify(intel), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
        })

        const secs = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
        try { await setRunState({ status: 'done', startedAt, finishedAt: new Date().toISOString(), elapsedSecs: secs, blobUrl: blob.url }) } catch { /* ignore */ }
      } catch (e) {
        try { await setRunState({ status: 'failed', startedAt, error: String(e) }) } catch { /* ignore */ }
      }
    }

    try { after(doScrape) } catch { doScrape().catch(() => {}) }

    return NextResponse.json({ status: 'started' })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// GET — check scrape status
export async function GET() {
  const run = await getRunState()
  if (!run) return NextResponse.json({ status: 'idle' })

  if (run.status === 'done') {
    return NextResponse.json({ status: 'done', elapsedSecs: run.elapsedSecs })
  }

  if (run.status === 'failed') {
    return NextResponse.json({ status: 'failed', error: run.error })
  }

  // auto-expire stale running state after 90 min
  const elapsedSecs = Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000)
  if (elapsedSecs > 5400) {
    try { await setRunState({ status: 'failed', startedAt: run.startedAt, error: 'Timed out' }) } catch { /* ignore */ }
    return NextResponse.json({ status: 'failed', error: 'Timed out' })
  }
  return NextResponse.json({ status: 'running', elapsedSecs })
}
