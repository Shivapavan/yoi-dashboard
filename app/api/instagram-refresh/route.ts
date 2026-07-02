import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { put } from '@vercel/blob'

const APIFY_ACTOR = 'apify~instagram-scraper'
const IG_ACCOUNTS = [
  '_bharatbhavan_', 'athidhi.aalayam', 'spicerackfrisco', 'marina_indian',
  'ulavacharu_frisco', 'themangoyard', 'rayalaseemaruchulu_usa_frisco',
  'spicyvihaarfrisco', 'desichowrastha', 'nh7dhaba', 'yumofindia_mckinney',
  'tantraindianbistro', 'bhoomifoodtruck', 'dhamakamckinney', 'babai_bandi',
  'hyderabadwala23', 'hyderabadhouseprosper', 'golconda_xpress_food_truck',
  'desi.district', 'dumngrill_melissa',
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
  'dhamakamckinney': 'Dhamaka McKinney',
  'babai_bandi': 'Babai Bandi',
  'hyderabadwala23': 'Hyderabad Wala',
  'hyderabadhouseprosper': 'Hyderabad House Prosper',
  'golconda_xpress_food_truck': 'Golconda Xpress',
  'desi.district': 'Desi District',
  'dumngrill_melissa': 'Dum N Grill',
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

// POST — start a fresh Apify scrape
export async function POST() {
  const token = process.env.APIFY_TOKEN
  if (!token) return NextResponse.json({ error: 'APIFY_TOKEN not configured' }, { status: 500 })

  // Check if a run is already in progress
  const existing = await kv.get<{ runId: string; status: string; startedAt: string }>('ig:run')
  if (existing?.status === 'running') {
    return NextResponse.json({ status: 'already_running', runId: existing.runId, startedAt: existing.startedAt })
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const res = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directUrls: IG_ACCOUNTS.map(a => `https://www.instagram.com/${a}/`),
        resultsType: 'posts',
        resultsLimit: 30,
        scrapePostsUntilDate: thirtyDaysAgo,
      }),
    }
  )
  if (!res.ok) return NextResponse.json({ error: 'Failed to start Apify run' }, { status: 502 })

  const data = await res.json()
  const runId: string = data.data?.id
  if (!runId) return NextResponse.json({ error: 'No run ID returned' }, { status: 502 })

  await kv.set('ig:run', { runId, status: 'running', startedAt: new Date().toISOString() })
  return NextResponse.json({ status: 'started', runId })
}

// GET — check run status; fetch & store data when complete
export async function GET(_req: NextRequest) {
  const token = process.env.APIFY_TOKEN
  if (!token) return NextResponse.json({ error: 'APIFY_TOKEN not configured' }, { status: 500 })

  const run = await kv.get<{ runId: string; status: string; startedAt: string }>('ig:run')
  if (!run) return NextResponse.json({ status: 'idle' })
  if (run.status === 'done') return NextResponse.json({ status: 'done' })

  // Check Apify run status
  const statusRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${run.runId}?token=${token}`
  )
  if (!statusRes.ok) return NextResponse.json({ status: 'unknown' })

  const statusData = await statusRes.json()
  const apifyStatus: string = statusData.data?.status ?? 'UNKNOWN'
  const datasetId: string = statusData.data?.defaultDatasetId ?? ''

  if (apifyStatus === 'RUNNING' || apifyStatus === 'READY') {
    const secs = Math.round(statusData.data?.stats?.runTimeSecs ?? 0)
    return NextResponse.json({ status: 'running', runId: run.runId, elapsedSecs: secs })
  }

  if (apifyStatus !== 'SUCCEEDED') {
    await kv.set('ig:run', { ...run, status: 'failed' })
    return NextResponse.json({ status: 'failed' })
  }

  // Fetch dataset items
  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=2000`
  )
  if (!itemsRes.ok) return NextResponse.json({ status: 'error_fetching' })
  const posts: Record<string, unknown>[] = await itemsRes.json()

  // Process data
  const intel = processData(posts)

  // Save to Vercel Blob
  const blob = await put('instagram-intel.json', JSON.stringify(intel), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })

  await kv.set('ig:run', { ...run, status: 'done' })
  await kv.set('ig:blob-url', blob.url)

  return NextResponse.json({ status: 'done', lastUpdated: intel.lastUpdated })
}

function processData(posts: Record<string, unknown>[]) {
  const target = new Set(IG_ACCOUNTS)
  const targetPosts = posts.filter(p => target.has(p.ownerUsername as string))

  const byAccount = new Map<string, Record<string, unknown>[]>()
  for (const p of targetPosts) {
    const acc = p.ownerUsername as string
    if (!byAccount.has(acc)) byAccount.set(acc, [])
    byAccount.get(acc)!.push(p)
  }

  const accounts = Array.from(byAccount.entries()).map(([acc, ps]) => {
    const views = ps.map(p => (p.videoViewCount as number) || 0)
    const likes = ps.map(p => (p.likesCount as number) || 0)
    const topViews = Math.max(...views, 0)
    const avgViews = Math.round(views.reduce((a, b) => a + b, 0) / (views.length || 1))
    const avgLikes = Math.round((likes.reduce((a, b) => a + b, 0) / (likes.length || 1)) * 10) / 10
    const videos = ps.filter(p => p.type === 'Video').length
    const best = ps.reduce((a, b) =>
      ((b.videoViewCount as number) || 0) > ((a.videoViewCount as number) || 0) ? b : a
    )
    return {
      account: acc,
      name: DISPLAY_NAMES[acc] ?? acc,
      posts: ps.length,
      videos,
      topViews,
      avgViews,
      avgLikes,
      isYoi: acc === 'yumofindia_mckinney',
      bestPostUrl: (best.url as string) ?? '',
      bestCaption: ((best.caption as string) ?? '').slice(0, 100).replace(/\n/g, ' '),
    }
  }).sort((a, b) => b.topViews - a.topViews)

  const videoPosts = targetPosts
    .filter(p => (p.videoViewCount as number) > 0)
    .sort((a, b) => ((b.videoViewCount as number) || 0) - ((a.videoViewCount as number) || 0))
    .slice(0, 10)
    .map(p => ({
      views: (p.videoViewCount as number) || 0,
      url: (p.url as string) ?? '',
      account: (p.ownerUsername as string) ?? '',
      name: DISPLAY_NAMES[(p.ownerUsername as string) ?? ''] ?? (p.ownerUsername as string),
      caption: ((p.caption as string) ?? '').slice(0, 140).replace(/\n/g, ' '),
      date: ((p.timestamp as string) ?? '').slice(0, 10),
      likes: (p.likesCount as number) || 0,
    }))

  const tagCounts = new Map<string, number>()
  for (const p of targetPosts) {
    for (const tag of ((p.hashtags as string[]) ?? [])) {
      const t = tag.toLowerCase().replace(/^#/, '').trim()
      if (t.length > 2 && !/^\d+[,.]?\d*$/.test(t)) {
        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
      }
    }
  }
  const hashtags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }))

  const topics = Object.entries(TOPICS).map(([topic, keywords]) => {
    const count = targetPosts.filter(p => {
      const c = ((p.caption as string) ?? '').toLowerCase()
      return keywords.some(kw => c.includes(kw))
    }).length
    return { topic, count }
  }).filter(t => t.count > 0).sort((a, b) => b.count - a.count)

  return {
    lastUpdated: new Date().toISOString(),
    totalPosts: targetPosts.length,
    accounts,
    topPosts: videoPosts,
    hashtags,
    topics,
  }
}
