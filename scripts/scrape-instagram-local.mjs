/**
 * Run this locally (your home IP) to scrape Instagram and push to Vercel Blob.
 * Usage:  node scripts/scrape-instagram-local.mjs
 *
 * Reads IG_SESSION_ID and BLOB_READ_WRITE_TOKEN from .env.local
 */

import { readFileSync } from 'fs'
import { put } from '@vercel/blob'

// ── load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    console.error('Could not read .env.local — make sure you run this from the project root.')
    process.exit(1)
  }
}

// ── config ───────────────────────────────────────────────────────────────────
const APP_ID = '936619743392459'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const POST_LIMIT = 30

const IG_ACCOUNTS = [
  '_bharatbhavan_', 'athidhi.aalayam', 'spicerackfrisco', 'marina_indian',
  'ulavacharu_frisco', 'themangoyard', 'rayalaseemaruchulu_usa_frisco',
  'spicyvihaarfrisco', 'desichowrastha', 'nh7dhaba', 'yumofindia_mckinney',
  'tantraindianbistro', 'bhoomifoodtruck', 'babai_bandi',
  'hyderabadwala23', 'hyderabadhouseprosper', 'golconda_xpress_food_truck',
  'desi.district', 'dumngrill_melissa', 'dumngrill_frisco', 'jataraindiankitchen',
  '_nagskitchen_', 'premaskitchen', 'aaha_kitchen_celina', 'saibhavancarrollton',
  'salemrrbiryani', 'marketives',
]

const DISPLAY_NAMES = {
  '_bharatbhavan_': 'Bharat Bhavan', 'athidhi.aalayam': 'Athidhi Aalayam',
  'spicerackfrisco': 'Spice Rack', 'marina_indian': 'Marina Indian',
  'ulavacharu_frisco': 'Ulavacharu', 'themangoyard': 'The Mango Yard',
  'rayalaseemaruchulu_usa_frisco': 'Rayalaseema Ruchulu', 'spicyvihaarfrisco': 'Spicy Vihaar',
  'desichowrastha': 'Desi Chowrastha', 'nh7dhaba': 'NH7 Dhaba',
  'yumofindia_mckinney': 'Yum of India', 'tantraindianbistro': 'Tantra Indian Bistro',
  'bhoomifoodtruck': 'Bhoomi Food Truck', 'babai_bandi': 'Babai Bandi',
  'hyderabadwala23': 'Hyderabad Wala', 'hyderabadhouseprosper': 'Hyderabad House Prosper',
  'golconda_xpress_food_truck': 'Golconda Xpress', 'desi.district': 'Desi District',
  'dumngrill_melissa': 'Dum N Grill (Melissa)', 'dumngrill_frisco': 'Dum N Grill (Frisco)',
  'jataraindiankitchen': 'Jatara Indian Kitchen',
  '_nagskitchen_': 'Nags Kitchen', 'premaskitchen': "Prema's Kitchen",
  'aaha_kitchen_celina': 'Aaha Kitchen', 'saibhavancarrollton': 'Sai Bhavan',
  'salemrrbiryani': 'Salem RR Biryani', 'marketives': 'Marketives',
}

const TOPICS = {
  'Grand Opening': ['grand opening', 'now open', 'opening soon'],
  'Biryani': ['biryani', 'dum biryani'],
  'Food Prep / Live Kitchen': ['live kitchen', 'fresh', 'made from scratch'],
  'Special Occasions': ["mother's day", 'eid', 'ramadan', 'diwali', 'ugadi'],
  'Dosa / Tiffin': ['dosa', 'tiffin', 'idli', 'vada'],
  'Catering / Events': ['catering', 'bulk order', 'party order', 'event'],
  'Chaat / Street Food': ['chaat', 'pani puri', 'bhel', 'street food'],
  'Thali / Banana Leaf': ['thali', 'banana leaf', 'unlimited'],
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Instagram API helpers ─────────────────────────────────────────────────────
function igHeaders(sessionId) {
  return {
    'x-ig-app-id': APP_ID,
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': `sessionid=${sessionId}`,
    'Referer': 'https://www.instagram.com/',
    'Origin': 'https://www.instagram.com',
    'Sec-Fetch-Site': 'same-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function getProfile(username, sessionId) {
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      { headers: igHeaders(sessionId) }
    )
    if (!res.ok) { console.log(`  ⚠ ${username}: HTTP ${res.status}`); return null }
    const json = await res.json()
    const user = json?.data?.user
    if (!user) { console.log(`  ⚠ ${username}: no user data`); return null }
    return {
      userId: user.id,
      username,
      fullName: user.full_name ?? '',
      followers: user.edge_followed_by?.count ?? 0,
      following: user.edge_follow?.count ?? 0,
      postsCount: user.edge_owner_to_timeline_media?.count ?? 0,
      bio: user.biography ?? '',
    }
  } catch (e) {
    console.log(`  ⚠ ${username}: ${e.message}`)
    return null
  }
}

async function getPosts(userId, username, sessionId) {
  const posts = []
  let nextCursor = null

  while (posts.length < POST_LIMIT) {
    const countToFetch = Math.min(12, POST_LIMIT - posts.length)
    const params = new URLSearchParams({ count: String(countToFetch) })
    if (nextCursor) params.set('max_id', nextCursor)

    try {
      const res = await fetch(
        `https://i.instagram.com/api/v1/feed/user/${userId}/?${params}`,
        { headers: igHeaders(sessionId) }
      )
      if (!res.ok) break
      const json = await res.json()
      const items = json.items ?? []

      for (const item of items) {
        const isVideo = item.media_type === 2
        const isCarousel = item.media_type === 8
        const caption = item.caption?.text ?? ''
        const hashtags = [...caption.matchAll(/#(\w+)/g)].map(m => m[1].toLowerCase())
        const thumbCandidates = item.image_versions2?.candidates ?? []
        const thumbnailUrl = thumbCandidates[thumbCandidates.length - 1]?.url ?? ''
        posts.push({
          id: item.pk ?? item.id ?? '',
          username,
          type: isCarousel ? 'carousel' : isVideo ? 'video' : 'image',
          url: `https://www.instagram.com/p/${item.code}/`,
          caption,
          hashtags,
          likes: item.like_count ?? 0,
          views: item.view_count ?? item.play_count ?? 0,
          plays: item.play_count ?? 0,
          comments: item.comment_count ?? 0,
          timestamp: new Date((item.taken_at ?? 0) * 1000).toISOString(),
          thumbnailUrl,
        })
      }

      if (!json.more_available || items.length === 0) break
      nextCursor = json.next_max_id ?? null
      if (!nextCursor) break
      await sleep(800)
    } catch { break }
  }
  return posts
}

async function scrapeAccount(username, sessionId) {
  const profileData = await getProfile(username, sessionId)
  if (!profileData) return null
  await sleep(500)
  const posts = await getPosts(profileData.userId, username, sessionId)
  return { ...profileData, posts, scrapedAt: new Date().toISOString() }
}

// ── buildIntel (mirrors instagram-intel.ts) ───────────────────────────────────
function buildIntel(profiles) {
  const yoi = profiles.find(p => p.username === 'yumofindia_mckinney')
  const competitors = profiles.filter(p => p.username !== 'yumofindia_mckinney')
  const allPosts = profiles.flatMap(p => p.posts)
  const competitorPosts = competitors.flatMap(p => p.posts)

  const accounts = profiles.map(p => {
    const views = p.posts.map(post => post.views)
    const likes = p.posts.map(post => post.likes)
    const topViews = Math.max(...views, 0)
    const avgViews = Math.round(views.reduce((a, b) => a + b, 0) / (views.length || 1))
    const avgLikes = Math.round((likes.reduce((a, b) => a + b, 0) / (likes.length || 1)) * 10) / 10
    const videos = p.posts.filter(post => post.type === 'video').length
    const best = p.posts.reduce((a, b) => (!a || b.views > a.views) ? b : a, null)
    const engagementRate = p.followers > 0 ? Math.round((avgViews / p.followers) * 1000) / 10 : 0
    return {
      account: p.username,
      name: DISPLAY_NAMES[p.username] ?? p.username,
      followers: p.followers,
      posts: p.posts.length,
      videos,
      topViews,
      avgViews,
      avgLikes,
      engagementRate,
      isYoi: p.username === 'yumofindia_mckinney',
      isMarketives: p.username === 'marketives',
      bestPostUrl: best?.url ?? '',
      bestCaption: (best?.caption ?? '').slice(0, 100).replace(/\n/g, ' '),
    }
  }).sort((a, b) => b.topViews - a.topViews)

  const topPosts = allPosts
    .filter(p => p.type === 'video' || p.type === 'carousel')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20)
    .map(p => ({
      views: p.views, url: p.url, account: p.username,
      name: DISPLAY_NAMES[p.username] ?? p.username,
      caption: p.caption.slice(0, 200).replace(/\n/g, ' '),
      date: p.timestamp.slice(0, 10), likes: p.likes,
    }))

  const tagCounts = new Map()
  for (const p of allPosts) {
    for (const tag of p.hashtags) {
      if (tag.length > 2 && !/^\d+$/.test(tag)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const hashtags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count }))

  const topics = Object.entries(TOPICS).map(([topic, keywords]) => {
    const count = allPosts.filter(p => keywords.some(kw => p.caption.toLowerCase().includes(kw))).length
    return { topic, count }
  }).filter(t => t.count > 0).sort((a, b) => b.count - a.count)

  const sortedByViews = [...competitorPosts].filter(p => p.views > 0).sort((a, b) => b.views - a.views)
  const topTier = sortedByViews.slice(0, Math.max(1, Math.ceil(sortedByViews.length * 0.2)))
  const dayCounts = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 }
  const hourCounts = {}
  for (const p of topTier) {
    const d = new Date(p.timestamp)
    dayCounts[DAY_NAMES[d.getUTCDay()]]++
    hourCounts[d.getUTCHours()] = (hourCounts[d.getUTCHours()] ?? 0) + 1
  }
  const bestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Thursday'
  const bestHour = Number(Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? 18)
  const bestHourLabel = bestHour === 0 ? '12 AM' : bestHour < 12 ? `${bestHour} AM` : bestHour === 12 ? '12 PM' : `${bestHour - 12} PM`

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const yoiRecent = (yoi?.posts ?? []).filter(p => new Date(p.timestamp).getTime() > cutoff).length
  const competitorRecents = competitors.map(p => p.posts.filter(post => new Date(post.timestamp).getTime() > cutoff).length)
  const avgCompetitorRecent = Math.round((competitorRecents.reduce((a, b) => a + b, 0) / (competitorRecents.length || 1)) * 10) / 10

  const postsByDay = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 }
  const yoiByDay = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 }
  for (const p of competitorPosts) postsByDay[DAY_NAMES[new Date(p.timestamp).getUTCDay()]]++
  for (const p of yoi?.posts ?? []) yoiByDay[DAY_NAMES[new Date(p.timestamp).getUTCDay()]]++

  const topCaptionLengths = topTier.slice(0, 20).map(p => p.caption.length).filter(n => n > 0)
  const sweetSpotLength = Math.round(topCaptionLengths.reduce((a, b) => a + b, 0) / (topCaptionLengths.length || 1))
  const yoiAvgCaptionLength = Math.round((yoi?.posts ?? []).map(p => p.caption.length).reduce((a, b) => a + b, 0) / ((yoi?.posts.length) || 1))
  const winningFirstLines = topTier.slice(0, 8).map(p => p.caption.split(/\n/)[0].trim().slice(0, 70)).filter(Boolean)
  const engagementRanking = accounts.filter(a => a.followers > 100 && a.engagementRate > 0).sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 10)

  const suggestions = []
  suggestions.push({ icon: '⏰', title: `Post on ${bestDay}s around ${bestHourLabel} UTC`, detail: `Top competitor reels cluster on ${bestDay}s.` })
  if (avgCompetitorRecent > yoiRecent) {
    const gap = Math.round(avgCompetitorRecent - yoiRecent)
    suggestions.push({ icon: '📅', title: `Post ${gap} more reels this month`, detail: `YOI posted ${yoiRecent} in 30 days; competitors averaged ${avgCompetitorRecent}.` })
  }

  return {
    lastUpdated: new Date().toISOString(),
    totalPosts: allPosts.length,
    accounts, topPosts, hashtags, topics,
    insights: { bestDay, bestHour, bestHourLabel, dayCounts, postsByDay, yoiByDay, engagementRanking, yoiPostsRecent: yoiRecent, avgCompetitorPostsRecent: avgCompetitorRecent, sweetSpotCaptionLength: sweetSpotLength, yoiAvgCaptionLength, winningFirstLines },
    suggestions,
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  loadEnv()

  const sessionId = process.env.IG_SESSION_ID
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN

  if (!sessionId) { console.error('❌ IG_SESSION_ID not found in .env.local'); process.exit(1) }
  if (!blobToken) { console.error('❌ BLOB_READ_WRITE_TOKEN not found in .env.local'); process.exit(1) }

  console.log(`\n🚀 Scraping ${IG_ACCOUNTS.length} Instagram accounts from local machine...\n`)

  const profiles = []
  for (let i = 0; i < IG_ACCOUNTS.length; i++) {
    const username = IG_ACCOUNTS[i]
    process.stdout.write(`[${i + 1}/${IG_ACCOUNTS.length}] ${username}... `)
    const profile = await scrapeAccount(username, sessionId)
    if (profile) {
      profiles.push(profile)
      console.log(`✓ ${profile.posts.length} posts, ${profile.followers.toLocaleString()} followers`)
    } else {
      console.log('✗ skipped')
    }
    if (i < IG_ACCOUNTS.length - 1) await sleep(2500 + Math.random() * 1500)
  }

  if (profiles.length === 0) {
    console.error('\n❌ No profiles scraped — session ID may be expired. Refresh IG_SESSION_ID in Vercel.')
    process.exit(1)
  }

  console.log(`\n✅ Scraped ${profiles.length}/${IG_ACCOUNTS.length} accounts. Building intel...`)
  const intel = buildIntel(profiles)
  console.log(`📊 ${intel.totalPosts} posts analysed across ${intel.accounts.length} accounts`)

  console.log('☁️  Uploading to Vercel Blob...')
  const intelBlob = await put('instagram-intel.json', JSON.stringify(intel), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: blobToken,
  })

  // Mark run state as done, including blobUrl so the dashboard API route finds the data
  await put('instagram-run-state.json', JSON.stringify({
    status: 'done',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedSecs: 0,
    blobUrl: intelBlob.url,
  }), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: blobToken,
  })

  console.log(`\n🎉 Done! Dashboard will show fresh data on next reload.`)
  console.log(`   Accounts: ${intel.accounts.length} | Posts: ${intel.totalPosts} | Updated: ${intel.lastUpdated}`)
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
