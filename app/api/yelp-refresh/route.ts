import { NextResponse } from 'next/server'
import { put, list } from '@vercel/blob'
import { scrapeYelpProfiles, type YelpBusiness } from '@/lib/scraper/yelp'

const RUN_STATE_BLOB = 'yelp-run-state.json'

interface RunState {
  status: 'idle' | 'running' | 'done' | 'failed'
  startedAt: string
  blobUrl?: string
  error?: string
}

const BUSINESSES = [
  { name: 'Yum of India', location: 'McKinney TX', isYoi: true },
  { name: 'Jatara Indian Kitchen', location: 'McKinney TX' },
  { name: 'Nags Kitchen', location: 'Frisco TX' },
  { name: "Prema's Kitchen", location: 'Allen TX' },
  { name: 'Aaha Kitchen', location: 'Celina TX' },
  { name: 'Hyderabad House', location: 'Prosper TX' },
  { name: 'Desi District', location: 'Frisco TX' },
  { name: 'Golconda Xpress', location: 'McKinney TX' },
  { name: 'Spice Rack', location: 'Frisco TX' },
  { name: 'Bharat Bhavan', location: 'Allen TX' },
  { name: 'Rayalaseema Ruchulu', location: 'Frisco TX' },
]

async function readState(): Promise<RunState | null> {
  const { blobs } = await list({ prefix: RUN_STATE_BLOB })
  if (!blobs.length) return null
  const res = await fetch(blobs[0].url, { cache: 'no-store' })
  return res.ok ? (res.json() as Promise<RunState>) : null
}

async function writeState(state: RunState) {
  await put(RUN_STATE_BLOB, JSON.stringify(state), { access: 'public', contentType: 'application/json', addRandomSuffix: false })
}

async function doScrape() {
  const apiKey = process.env.YELP_API_KEY
  if (!apiKey) { await writeState({ status: 'failed', startedAt: new Date().toISOString(), error: 'Missing YELP_API_KEY' }); return }

  try {
    const profiles = await scrapeYelpProfiles(BUSINESSES, apiKey)
    const intel = buildIntel(profiles)
    const blob = await put('yelp-intel.json', JSON.stringify(intel), { access: 'public', contentType: 'application/json', addRandomSuffix: false })
    await writeState({ status: 'done', startedAt: new Date().toISOString(), blobUrl: blob.url })
  } catch (e) {
    await writeState({ status: 'failed', startedAt: new Date().toISOString(), error: String(e) })
  }
}

function buildIntel(profiles: YelpBusiness[]) {
  const sorted = [...profiles].sort((a, b) => b.rating - a.rating)
  const allReviews = profiles.flatMap(p => p.reviews.map(r => ({ ...r, businessName: p.name, isYoi: p.isYoi })))
  allReviews.sort((a, b) => new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime())
  return {
    lastUpdated: new Date().toISOString(),
    totalBusinesses: profiles.length,
    businesses: sorted,
    yoi: profiles.find(p => p.isYoi) ?? null,
    avgRating: Math.round((profiles.reduce((s, p) => s + p.rating, 0) / (profiles.length || 1)) * 10) / 10,
    recentReviews: allReviews.slice(0, 20),
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
