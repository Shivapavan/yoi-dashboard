/**
 * Discovers Indian restaurant TikTok accounts in DFW by crawling hashtags,
 * then scrapes each profile and uploads to Vercel Blob.
 * Usage: node scripts/discover-tiktok-local.mjs
 */

import { readFileSync } from 'fs'
import { put } from '@vercel/blob'

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    console.error('Could not read .env.local — run from the project root.')
    process.exit(1)
  }
}

const YOI_USERNAME = 'yumofindiamckinney'

// Hashtags to crawl for discovery
const DISCOVERY_HASHTAGS = [
  'indianfooddallas',
  'indianfoodfrisco',
  'indianfoodmckinney',
  'indianfoodplano',
  'dallasindianfood',
  'dallasindianrestaurant',
  'dfwindianfood',
  'dallasbiryani',
  'biryanidallaas',
  'biryanidallas',
  'texasindianfood',
  'mckinneyfood',
  'friscofood',
  'planofood',
  'dallasfoodies',
  'halaldallas',
  'halalfrisco',
  'indianstreetfood',
  'southindianfood',
]

// Known handles to always include (even if not in hashtag results)
const SEED_USERNAMES = [
  'yumofindiamckinney',
  'premaskitchen',
  'tantraindianbistro',
  'nagskitchen',
  'ulavacharu',
  'jataraindiankitchen',
  'babaibandi',
  'saibhavancarrollton',
  'desichowrastha',
  'bhoomifoodtruck',
  'spicerackfrisco',
  'dumngrill',
  'themangoyard',
  'nh7dhaba',
  'golcondaxpress',
]

// Keywords that suggest an account is an Indian restaurant/food account
const FOOD_KEYWORDS = [
  'indian', 'biryani', 'curry', 'masala', 'halal', 'desi', 'south asian',
  'restaurant', 'kitchen', 'food', 'eat', 'chef', 'cook', 'spice',
  'hyderabad', 'punjabi', 'mughlai', 'tandoor', 'naan', 'roti',
  'paneer', 'tikka', 'korma', 'dal', 'rice', 'dum',
]

// DFW location keywords
const LOCATION_KEYWORDS = [
  'dallas', 'frisco', 'mckinney', 'plano', 'allen', 'richardson',
  'irving', 'carrollton', 'lewisville', 'garland', 'texas', 'tx', 'dfw',
  'celina', 'prosper', 'melissa', 'anna', 'forney', 'rockwall',
]

const TT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.tiktok.com/',
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function extractData(html) {
  const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

// Scrape a hashtag page and return creator usernames found in it
async function scrapeHashtag(tag) {
  try {
    const res = await fetch(`https://www.tiktok.com/tag/${tag}`, { headers: TT_HEADERS })
    if (!res.ok) return []
    const html = await res.text()
    const data = extractData(html)
    if (!data) return []

    const scope = data.__DEFAULT_SCOPE__ ?? {}
    // Try hashtag detail item list
    const itemList = scope['webapp.hashtag-detail']?.itemList
      ?? scope['webapp.video-list']?.itemList
      ?? []

    return itemList.map(item => item.author?.uniqueId).filter(Boolean)
  } catch { return [] }
}

// Scrape a user profile page
async function scrapeProfile(username) {
  try {
    const res = await fetch(`https://www.tiktok.com/@${username}`, { headers: TT_HEADERS })
    if (!res.ok) return null
    const html = await res.text()
    const data = extractData(html)
    if (!data) return null

    const detail = data.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo
    if (!detail) return null

    const user = detail.user ?? {}
    const stats = detail.stats ?? {}
    const videoList = data.__DEFAULT_SCOPE__?.['webapp.video-list']?.itemList ?? []

    const posts = videoList.map(item => ({
      id: item.id ?? '',
      username,
      description: item.desc ?? '',
      hashtags: (item.textExtra ?? []).map(t => t.hashtagName ?? '').filter(Boolean),
      likes: item.stats?.diggCount ?? 0,
      comments: item.stats?.commentCount ?? 0,
      shares: item.stats?.shareCount ?? 0,
      views: item.stats?.playCount ?? 0,
      timestamp: new Date((item.createTime ?? 0) * 1000).toISOString(),
      url: `https://www.tiktok.com/@${username}/video/${item.id}`,
    }))

    return {
      username,
      nickname: user.nickname ?? username,
      bio: user.signature ?? '',
      followers: stats.followerCount ?? 0,
      following: stats.followingCount ?? 0,
      totalLikes: stats.heartCount ?? 0,
      videoCount: stats.videoCount ?? 0,
      posts,
      isYoi: username === YOI_USERNAME,
      scrapedAt: new Date().toISOString(),
    }
  } catch { return null }
}

// Score whether a profile looks like a DFW Indian food account
function isDfwIndianFood(profile) {
  if (!profile) return false
  if (profile.username === YOI_USERNAME) return true
  const text = `${profile.username} ${profile.nickname} ${profile.bio}`.toLowerCase()
  const hasFood = FOOD_KEYWORDS.some(k => text.includes(k))
  const hasLocation = LOCATION_KEYWORDS.some(k => text.includes(k))
  // Also check post hashtags for DFW signals
  const postText = profile.posts.flatMap(p => p.hashtags).join(' ').toLowerCase()
  const postHasLocation = LOCATION_KEYWORDS.some(k => postText.includes(k))
  const postHasFood = FOOD_KEYWORDS.some(k => postText.includes(k))
  return (hasFood || postHasFood) && (hasLocation || postHasLocation)
}

function buildIntel(profiles) {
  const allPosts = profiles.flatMap(p =>
    p.posts.map(post => ({ ...post, name: p.nickname || p.username, isYoi: p.isYoi }))
  )

  const accounts = profiles.map(p => {
    const views = p.posts.map(v => v.views)
    const topViews = Math.max(...views, 0)
    const avgViews = Math.round(views.reduce((a, b) => a + b, 0) / (views.length || 1))
    return {
      username: p.username,
      name: p.nickname || p.username,
      nickname: p.nickname,
      bio: p.bio,
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
    .sort((a, b) => b.views - a.views)
    .slice(0, 30)

  const tagCounts = new Map()
  for (const p of allPosts) {
    for (const tag of p.hashtags) {
      if (tag.length > 2) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const hashtags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 30)
    .map(([tag, count]) => ({ tag, count }))

  return {
    lastUpdated: new Date().toISOString(),
    totalPosts: allPosts.length,
    accounts,
    topPosts,
    hashtags,
  }
}

async function main() {
  loadEnv()
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) { console.error('❌ BLOB_READ_WRITE_TOKEN not in .env.local'); process.exit(1) }

  // ── Phase 1: Discover usernames from hashtags ──────────────────────────────
  console.log(`\n🔍 Phase 1: Crawling ${DISCOVERY_HASHTAGS.length} hashtags to discover accounts...\n`)
  const discovered = new Set(SEED_USERNAMES)

  for (let i = 0; i < DISCOVERY_HASHTAGS.length; i++) {
    const tag = DISCOVERY_HASHTAGS[i]
    process.stdout.write(`[${i + 1}/${DISCOVERY_HASHTAGS.length}] #${tag}... `)
    const usernames = await scrapeHashtag(tag)
    usernames.forEach(u => discovered.add(u))
    console.log(`${usernames.length} creators found (total unique: ${discovered.size})`)
    await sleep(2000)
  }

  const allUsernames = Array.from(discovered)
  console.log(`\n✅ Discovery complete — ${allUsernames.length} unique accounts to check\n`)

  // ── Phase 2: Scrape each profile ──────────────────────────────────────────
  console.log(`🎵 Phase 2: Scraping ${allUsernames.length} profiles...\n`)
  const allProfiles = []
  const qualified = []

  for (let i = 0; i < allUsernames.length; i++) {
    const username = allUsernames[i]
    process.stdout.write(`[${i + 1}/${allUsernames.length}] @${username}... `)
    const profile = await scrapeProfile(username)

    if (!profile) {
      console.log('✗ no data')
    } else if (isDfwIndianFood(profile) || SEED_USERNAMES.includes(username)) {
      allProfiles.push(profile)
      qualified.push(username)
      console.log(`✅ DFW Indian food — ${profile.videoCount} videos · ${profile.followers.toLocaleString()} followers`)
    } else {
      console.log(`⏭  skipped (${profile.nickname || username} — not DFW Indian food)`)
    }

    if (i < allUsernames.length - 1) await sleep(1800)
  }

  console.log(`\n🍽  Qualified accounts: ${allProfiles.length}`)
  qualified.forEach(u => console.log(`   • @${u}`))

  if (allProfiles.length === 0) {
    console.error('\n❌ No Indian restaurant profiles found. Hashtag pages may not contain embedded video data on this request.')
    process.exit(1)
  }

  // ── Phase 3: Build intel + upload ─────────────────────────────────────────
  console.log('\n📊 Building intel...')
  const intel = buildIntel(allProfiles)

  console.log('☁️  Uploading to Vercel Blob...')
  const intelBlob = await put('tiktok-intel.json', JSON.stringify(intel), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: blobToken,
  })

  await put('tiktok-run-state.json', JSON.stringify({
    status: 'done',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    blobUrl: intelBlob.url,
    accountsFound: allProfiles.length,
  }), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: blobToken,
  })

  console.log(`\n🎉 Done! ${allProfiles.length} DFW Indian food accounts · ${intel.totalPosts} posts`)
  console.log('   Reload the dashboard TikTok tab to see results.')
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
