import { NextResponse } from 'next/server'
import { put, list } from '@vercel/blob'
import { searchMultipleQueries } from '@/lib/scraper/google-search'

const RUN_STATE_BLOB = 'google-search-run-state.json'

interface RunState {
  status: 'idle' | 'running' | 'done' | 'failed'
  startedAt: string
  blobUrl?: string
  error?: string
}

const SEARCH_QUERIES = [
  'Indian restaurant McKinney TX',
  'best Indian food McKinney TX',
  'Yum of India McKinney',
  'South Indian restaurant McKinney',
  'Indian restaurant Frisco TX',
  'Indian restaurant Allen TX',
  'Indian food near McKinney',
  'biryani McKinney TX',
]

async function readState(): Promise<RunState | null> {
  const { blobs } = await list({ prefix: RUN_STATE_BLOB })
  if (!blobs.length) return null
  const res = await fetch(blobs[0].url, { cache: 'no-store' })
  return res.ok ? (res.json() as Promise<RunState>) : null
}

async function writeState(state: RunState) {
  await put(RUN_STATE_BLOB, JSON.stringify(state), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true })
}

async function doScrape() {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX
  if (!apiKey || !cx) {
    await writeState({ status: 'failed', startedAt: new Date().toISOString(), error: 'Missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_CX' })
    return
  }
  try {
    const results = await searchMultipleQueries(SEARCH_QUERIES, apiKey, cx)
    const intel = {
      lastUpdated: new Date().toISOString(),
      queries: results,
      yoiVisibility: results.filter(r => r.yoiPosition !== null).length,
      totalQueries: results.length,
      avgYoiPosition: results.filter(r => r.yoiPosition !== null).reduce((s, r) => s + (r.yoiPosition ?? 0), 0) / (results.filter(r => r.yoiPosition !== null).length || 1),
    }
    const blob = await put('google-search-intel.json', JSON.stringify(intel), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true })
    await writeState({ status: 'done', startedAt: new Date().toISOString(), blobUrl: blob.url })
  } catch (e) {
    await writeState({ status: 'failed', startedAt: new Date().toISOString(), error: String(e) })
  }
}

export async function POST() {
  const state = await readState()
  if (state?.status === 'running') return NextResponse.json({ status: 'already_running' })
  await writeState({ status: 'running', startedAt: new Date().toISOString() })
  doScrape().catch(() => {})
  return NextResponse.json({ status: 'started' })
}

export async function GET() {
  const state = await readState()
  if (!state) return NextResponse.json({ status: 'idle' })
  const elapsedSecs = (Date.now() - new Date(state.startedAt).getTime()) / 1000
  return NextResponse.json({ ...state, elapsedSecs: Math.round(elapsedSecs) })
}
