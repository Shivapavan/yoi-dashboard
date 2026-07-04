/**
 * Scrapes TikTok competitor profiles from your local Mac (home IP).
 * TikTok's public profile pages embed data in a script tag — no auth needed.
 * Usage: node scripts/scrape-tiktok-local.mjs
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

const DISPLAY_NAMES = {
  // Yum of India
  'yumofindiamckinney': 'Yum of India',

  // McKinney / Frisco / Plano / Dallas — Indian restaurants
  'jataraindiankitchen': 'Jatara Indian Kitchen',
  'nagskitchen': "Nag's Kitchen",
  'premaskitchen': "Prema's Kitchen",
  'aahakitchencelina': 'Aaha Kitchen',
  'saibhavancarrollton': 'Sai Bhavan',
  'hyderabadhouseprosper': 'Hyderabad House',
  'desistrict': 'Desi District',
  'golcondaxpress': 'Golconda Xpress',
  'tantraindianbistro': 'Tantra Indian Bistro',
  'babaibandi': 'Babai Bandi',
  'desichowrastha': 'Desi Chowrastha',
  'bhoomifoodtruck': 'Bhoomi Food Truck',
  'themangoyard': 'The Mango Yard',
  'nh7dhaba': 'NH7 Dhaba',
  'spicerackfrisco': 'Spice Rack Frisco',
  'dumngrill': 'Dum N Grill',
  'salemrrbiryani': 'Salem RR Biryani',
  'marinaindiancuisine': 'Marina Indian',
  'spicyvihaarfrisco': 'Spicy Vihaar',
  'ulavacharu': 'Ulavacharu',
}

const YOI_USERNAME = 'yumofindiamckinney'

const TT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.tiktok.com/',
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function scrapeProfile(username) {
  try {
    const res = await fetch(`https://www.tiktok.com/@${username}`, { headers: TT_HEADERS })
    if (!res.ok) return null
    const html = await res.text()

    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/)
    if (!match) return null

    const data = JSON.parse(match[1])
    const detail = data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo
    if (!detail) return null

    const user = detail.user ?? {}
    const stats = detail.stats ?? {}
    const videoList = data?.__DEFAULT_SCOPE__?.['webapp.video-list']?.itemList ?? []

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

function buildIntel(profiles) {
  const allPosts = profiles.flatMap(p =>
    p.posts.map(post => ({ ...post, name: DISPLAY_NAMES[p.username] ?? p.username, isYoi: p.isYoi }))
  )

  const accounts = profiles.map(p => {
    const views = p.posts.map(v => v.views)
    const topViews = Math.max(...views, 0)
    const avgViews = Math.round(views.reduce((a, b) => a + b, 0) / (views.length || 1))
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
    .slice(0, 30)

  const tagCounts = new Map()
  for (const p of allPosts) {
    for (const tag of p.hashtags) {
      if (tag.length > 2) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const hashtags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 20)
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

  const usernames = Object.keys(DISPLAY_NAMES)
  console.log(`\n🎵 Scraping ${usernames.length} TikTok accounts from local machine...\n`)

  const profiles = []
  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i]
    process.stdout.write(`[${i + 1}/${usernames.length}] @${username}... `)
    const profile = await scrapeProfile(username)
    if (profile) {
      profiles.push(profile)
      console.log(`✓ ${profile.videoCount} videos · ${profile.followers.toLocaleString()} followers`)
    } else {
      console.log('✗ not found / no data')
    }
    if (i < usernames.length - 1) await sleep(2500)
  }

  if (profiles.length === 0) { console.error('\n❌ No profiles scraped.'); process.exit(1) }

  console.log(`\n📊 Building intel from ${profiles.length} accounts...`)
  const intel = buildIntel(profiles)

  console.log('☁️  Uploading to Vercel Blob...')
  const intelBlob = await put('tiktok-intel.json', JSON.stringify(intel), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: blobToken,
  })

  await put('tiktok-run-state.json', JSON.stringify({
    status: 'done',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    blobUrl: intelBlob.url,
  }), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: blobToken,
  })

  console.log(`\n🎉 Done! ${profiles.length}/${usernames.length} accounts · ${intel.totalPosts} posts`)
  console.log(`   Reload the dashboard TikTok tab to see results.`)
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
