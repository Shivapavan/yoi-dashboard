import { NextResponse } from 'next/server'
import { put, list } from '@vercel/blob'
import { scrapeTikTokProfiles, type TikTokProfile, type TikTokPost } from '@/lib/scraper/tiktok'

const RUN_STATE_BLOB = 'tiktok-run-state.json'

interface RunState {
  status: 'idle' | 'running' | 'done' | 'failed'
  startedAt: string
  blobUrl?: string
  error?: string
}

const DISPLAY_NAMES: Record<string, string> = {
  yumofindiamckinney: 'Yum of India',
  jataraindiankitchen: 'Jatara Indian Kitchen',
  nagskitchen: 'Nags Kitchen',
  premaskitchen: "Prema's Kitchen",
  aahakitchen: 'Aaha Kitchen',
  saibhavancarrollton: 'Sai Bhavan',
  hyderabadhouseprosper: 'Hyderabad House',
  desistrict: 'Desi District',
  golcondaxpress: 'Golconda Xpress',
}

const YOI_USERNAME = 'yumofindiamckinney'
const USERNAMES = Object.keys(DISPLAY_NAMES)

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
  try {
    const profiles = await scrapeTikTokProfiles(USERNAMES)
    profiles.forEach(p => { p.isYoi = p.username === YOI_USERNAME })
    const intel = buildIntel(profiles)
    const blob = await put('tiktok-intel.json', JSON.stringify(intel), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true })
    await writeState({ status: 'done', startedAt: new Date().toISOString(), blobUrl: blob.url })
  } catch (e) {
    await writeState({ status: 'failed', startedAt: new Date().toISOString(), error: String(e) })
  }
}

function buildIntel(profiles: TikTokProfile[]) {
  const allPosts = profiles.flatMap(p =>
    p.posts.map(post => ({ ...post, name: DISPLAY_NAMES[p.username] ?? p.username, isYoi: p.isYoi }))
  )

  const accounts = profiles.map(p => {
    const views = p.posts.map((v: TikTokPost) => v.views)
    const topViews = Math.max(...views, 0)
    const avgViews = Math.round(views.reduce((a: number, b: number) => a + b, 0) / (views.length || 1))
    return {
      username: p.username,
      name: DISPLAY_NAMES[p.username] ?? p.username,
      nickname: p.nickname,
      followers: p.followers,
      totalLikes: p.totalLikes,
      videoCount: p.videoCount,
      topViews,
      avgViews,
      engagementRate: p.followers > 0 ? Math.round((avgViews / p.followers) * 1000) / 10 : 0,
      isYoi: p.isYoi,
      scrapedAt: p.scrapedAt,
    }
  }).sort((a, b) => b.topViews - a.topViews)

  const topPosts = [...allPosts]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20)

  const tagCounts = new Map<string, number>()
  for (const p of allPosts) for (const tag of p.hashtags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  const hashtags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count }))

  return {
    lastUpdated: new Date().toISOString(),
    totalPosts: allPosts.length,
    accounts,
    topPosts,
    hashtags,
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
