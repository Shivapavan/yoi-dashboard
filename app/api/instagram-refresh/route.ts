import { NextRequest, NextResponse } from 'next/server'
import { put, list } from '@vercel/blob'
import { scrapeAccounts } from '@/lib/scraper/instagram'

const IG_ACCOUNTS = [
  '_bharatbhavan_', 'athidhi.aalayam', 'spicerackfrisco', 'marina_indian',
  'ulavacharu_frisco', 'themangoyard', 'rayalaseemaruchulu_usa_frisco',
  'spicyvihaarfrisco', 'desichowrastha', 'nh7dhaba', 'yumofindia_mckinney',
  'tantraindianbistro', 'bhoomifoodtruck', 'babai_bandi',
  'hyderabadwala23', 'hyderabadhouseprosper', 'golconda_xpress_food_truck',
  'desi.district', 'dumngrill_melissa', 'jataraindiankitchen',
  '_nagskitchen_', 'premaskitchen', 'aaha_kitchen_celina', 'saibhavancarrollton',
]

const DISPLAY_NAMES: Record<string, string> = {
  '_bharatbhavan_': 'Bharat Bhavan',
  'athidhi.aalayam': 'Athidhi Aalayam',
  'spicerackfrisco': 'Spice Rack',
  'marina_indian': 'Marina Indian',
  'ulavacharu_frisco': 'Ulavacharu',
  'themangoyard': 'The Mango Yard',
  'rayalaseemaruchulu_usa_frisco': 'Rayalaseema Ruchulu',
  'spicyvihaarfrisco': 'Spicy Vihaar',
  'desichowrastha': 'Desi Chowrastha',
  'nh7dhaba': 'NH7 Dhaba',
  'yumofindia_mckinney': 'Yum of India',
  'tantraindianbistro': 'Tantra Indian Bistro',
  'bhoomifoodtruck': 'Bhoomi Food Truck',
  'babai_bandi': 'Babai Bandi',
  'hyderabadwala23': 'Hyderabad Wala',
  'hyderabadhouseprosper': 'Hyderabad House Prosper',
  'golconda_xpress_food_truck': 'Golconda Xpress',
  'desi.district': 'Desi District',
  'dumngrill_melissa': 'Dum N Grill',
  'jataraindiankitchen': 'Jatara Indian Kitchen',
  '_nagskitchen_': 'Nags Kitchen',
  'premaskitchen': "Prema's Kitchen",
  'aaha_kitchen_celina': 'Aaha Kitchen',
  'saibhavancarrollton': 'Sai Bhavan',
}

const TOPICS: Record<string, string[]> = {
  'Grand Opening': ['grand opening', 'now open', 'opening soon', 'opening offer'],
  'Biryani': ['biryani', 'dum biryani'],
  'Food Prep / Live Kitchen': ['live kitchen', 'fresh', 'made from scratch', 'tawa', 'sizzle'],
  'Owner / Founder Story': ['founder', 'owner', 'behind the scenes', 'our story'],
  'Special Occasions': ["mother's day", 'eid', 'ramadan', 'diwali', 'ugadi'],
  'Dosa / Tiffin': ['dosa', 'tiffin', 'idli', 'vada'],
  'Catering / Events': ['catering', 'bulk order', 'party order', 'event'],
  'Chaat / Street Food': ['chaat', 'pani puri', 'bhel', 'street food'],
  'Thali / Banana Leaf': ['thali', 'banana leaf', 'unlimited'],
  'Franchise / Business': ['franchise', 'food truck', 'business'],
}

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

// POST — start a self-hosted scrape (no Apify)
export async function POST(req: NextRequest) {
  const sessionId = process.env.IG_SESSION_ID
  if (!sessionId) {
    return NextResponse.json({ error: 'IG_SESSION_ID not configured' }, { status: 500 })
  }

  const existing = await getRunState()
  if (existing?.status === 'running') {
    return NextResponse.json({ status: 'already_running', startedAt: existing.startedAt })
  }

  const startedAt = new Date().toISOString()
  await setRunState({ status: 'running', startedAt })

  // Background scrape — runs after response is sent
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
      await setRunState({ status: 'done', startedAt, finishedAt: new Date().toISOString(), elapsedSecs: secs, blobUrl: blob.url })
    } catch (e) {
      await setRunState({ status: 'failed', startedAt, error: String(e) })
    }
  }

  // Use waitUntil if available (Vercel Edge / newer Node runtime)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (req as any)[Symbol.for('vercel-request-context')]
  if (ctx?.waitUntil) {
    ctx.waitUntil(doScrape())
  } else {
    doScrape().catch(() => {})
  }

  return NextResponse.json({ status: 'started' })
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

  // running — compute elapsed time
  const elapsedSecs = Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000)
  return NextResponse.json({ status: 'running', elapsedSecs })
}

// ─── Data processing ──────────────────────────────────────────────────────────

import type { IgProfile, IgPost } from '@/lib/scraper/types'

function buildIntel(profiles: IgProfile[]) {
  const accounts = profiles.map(p => {
    const views = p.posts.map(post => post.views)
    const likes = p.posts.map(post => post.likes)
    const topViews = Math.max(...views, 0)
    const avgViews = Math.round(views.reduce((a, b) => a + b, 0) / (views.length || 1))
    const avgLikes = Math.round((likes.reduce((a, b) => a + b, 0) / (likes.length || 1)) * 10) / 10
    const videos = p.posts.filter(post => post.type === 'video').length
    const best = p.posts.reduce<IgPost | null>((a, b) => (!a || b.views > a.views) ? b : a, null)

    return {
      account: p.username,
      name: DISPLAY_NAMES[p.username] ?? p.username,
      followers: p.followers,
      posts: p.posts.length,
      videos,
      topViews,
      avgViews,
      avgLikes,
      isYoi: p.username === 'yumofindia_mckinney',
      bestPostUrl: best?.url ?? '',
      bestCaption: (best?.caption ?? '').slice(0, 100).replace(/\n/g, ' '),
    }
  }).sort((a, b) => b.topViews - a.topViews)

  const allPosts = profiles.flatMap(p => p.posts)

  const topPosts = allPosts
    .filter(p => p.type === 'video' || p.type === 'carousel')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20)
    .map(p => ({
      views: p.views,
      url: p.url,
      account: p.username,
      name: DISPLAY_NAMES[p.username] ?? p.username,
      caption: p.caption.slice(0, 200).replace(/\n/g, ' '),
      date: p.timestamp.slice(0, 10),
      likes: p.likes,
    }))

  const tagCounts = new Map<string, number>()
  for (const p of allPosts) {
    for (const tag of p.hashtags) {
      if (tag.length > 2 && !/^\d+$/.test(tag)) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }
  }
  const hashtags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }))

  const topics = Object.entries(TOPICS).map(([topic, keywords]) => {
    const count = allPosts.filter(p => {
      const c = p.caption.toLowerCase()
      return keywords.some(kw => c.includes(kw))
    }).length
    return { topic, count }
  }).filter(t => t.count > 0).sort((a, b) => b.count - a.count)

  return {
    lastUpdated: new Date().toISOString(),
    totalPosts: allPosts.length,
    accounts,
    topPosts,
    hashtags,
    topics,
  }
}
