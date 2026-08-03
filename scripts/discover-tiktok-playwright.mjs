/**
 * Discovers Indian restaurant TikTok accounts in the Dallas area using a real browser.
 * Uses Playwright to search TikTok and extract creator handles.
 * Usage: node scripts/discover-tiktok-playwright.mjs
 */

import { readFileSync } from 'fs'
import { put } from '@vercel/blob'
import { chromium } from 'playwright'

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

const SEARCH_QUERIES = [
  'indian restaurant dallas texas',
  'indian restaurant mckinney texas',
  'indian restaurant frisco texas',
  'indian restaurant plano texas',
  'biryani dallas texas',
  'biryani mckinney',
  'indian food dallas',
  'halal restaurant dallas texas',
  'desi food dallas',
  'south indian food dallas',
]

const HASHTAG_PAGES = [
  'indianfooddallas',
  'indianfoodfrisco',
  'indianfoodmckinney',
  'dallasindianfood',
  'dfwindianfood',
  'dallasbiryani',
  'biryanidallas',
  'texasindianfood',
  'halaldallaas',
  'halaldallas',
  'mckinneyfood',
  'friscofood',
  'planofood',
  'desifoddallas',
  'desifooddallas',
]

const SEED_USERNAMES = [
  'yumofindiamckinney', 'premaskitchen', 'tantraindianbistro',
  'nagskitchen', 'ulavacharu',
]

const LOCATION_KEYWORDS = [
  'dallas', 'frisco', 'mckinney', 'plano', 'allen', 'richardson',
  'irving', 'carrollton', 'lewisville', 'garland', 'texas', 'tx', 'dfw',
  'celina', 'prosper', 'melissa', 'anna',
]

const FOOD_KEYWORDS = [
  'indian', 'biryani', 'curry', 'masala', 'halal', 'desi',
  'restaurant', 'kitchen', 'food', 'chef', 'cook', 'spice',
  'hyderabad', 'punjabi', 'tandoor', 'naan', 'paneer', 'tikka',
]

function isRelevant(username, nickname, bio, hashtags = []) {
  if (username === YOI_USERNAME || SEED_USERNAMES.includes(username)) return true
  const text = `${username} ${nickname} ${bio} ${hashtags.join(' ')}`.toLowerCase()
  const hasFood = FOOD_KEYWORDS.some(k => text.includes(k))
  const hasLocation = LOCATION_KEYWORDS.some(k => text.includes(k))
  return hasFood && hasLocation
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function searchTikTok(page, query) {
  const found = new Set()
  try {
    const encoded = encodeURIComponent(query)
    await page.goto(`https://www.tiktok.com/search?q=${encoded}&type=user`, {
      waitUntil: 'domcontentloaded', timeout: 20000,
    })
    await sleep(3000)

    // Scroll to load more results
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800))
      await sleep(1500)
    }

    // Extract usernames from search results
    const handles = await page.evaluate(() => {
      const results = []
      // User search result cards
      document.querySelectorAll('[data-e2e="search-user-unique-id"]').forEach(el => {
        const text = el.textContent?.trim().replace(/^@/, '')
        if (text) results.push(text)
      })
      // Fallback: any links to @-prefixed profiles
      document.querySelectorAll('a[href*="/@"]').forEach(el => {
        const m = el.href.match(/\/@([^/?]+)/)
        if (m && m[1] && !m[1].includes('.')) results.push(m[1])
      })
      return [...new Set(results)]
    })

    handles.forEach(h => found.add(h))

    // Also try video search results to find creators
    await page.goto(`https://www.tiktok.com/search?q=${encoded}&type=video`, {
      waitUntil: 'domcontentloaded', timeout: 20000,
    })
    await sleep(3000)
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800))
      await sleep(1500)
    }

    const videoCreators = await page.evaluate(() => {
      const results = []
      document.querySelectorAll('a[href*="/@"]').forEach(el => {
        const m = el.href.match(/\/@([^/?]+)/)
        if (m && m[1] && !m[1].includes('.') && !m[1].includes('?')) results.push(m[1])
      })
      return [...new Set(results)]
    })
    videoCreators.forEach(h => found.add(h))

  } catch (e) {
    // timeout or navigation error — continue
  }
  return Array.from(found)
}

async function scrapeProfile(page, username) {
  try {
    await page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: 'domcontentloaded', timeout: 20000,
    })
    await sleep(2500)

    // Try to get data from the rehydration script
    const data = await page.evaluate(() => {
      const el = document.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__')
      if (!el) return null
      try { return JSON.parse(el.textContent) } catch { return null }
    })

    if (!data) return null
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

  console.log('\n🌐 Launching browser (visible — TikTok bot detection bypass)...')
  const browser = await chromium.launch({ headless: false, slowMo: 100 })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  })
  const page = await context.newPage()

  // ── Phase 1a: Hashtag page discovery ──────────────────────────────────────
  console.log(`\n#️⃣  Phase 1a: Scraping ${HASHTAG_PAGES.length} hashtag pages...\n`)
  const discovered = new Set(SEED_USERNAMES)

  for (let i = 0; i < HASHTAG_PAGES.length; i++) {
    const tag = HASHTAG_PAGES[i]
    process.stdout.write(`[${i + 1}/${HASHTAG_PAGES.length}] #${tag}... `)
    try {
      await page.goto(`https://www.tiktok.com/tag/${tag}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await sleep(3000)
      for (let s = 0; s < 4; s++) { await page.evaluate(() => window.scrollBy(0, 600)); await sleep(1000) }
      const handles = await page.evaluate(() => {
        const found = new Set()
        document.querySelectorAll('a[href*="/@"]').forEach(el => {
          const m = el.href.match(/\/@([^/?#]+)/)
          if (m && m[1] && !m[1].includes('.')) found.add(m[1])
        })
        return Array.from(found)
      })
      const before = discovered.size
      handles.forEach(h => discovered.add(h))
      console.log(`+${discovered.size - before} new (total: ${discovered.size})`)
    } catch { console.log('timeout') }
    await sleep(1500)
  }

  // ── Phase 1b: Search discovery ─────────────────────────────────────────────
  console.log(`\n🔍 Phase 1b: Searching TikTok for ${SEARCH_QUERIES.length} queries...\n`)

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const q = SEARCH_QUERIES[i]
    process.stdout.write(`[${i + 1}/${SEARCH_QUERIES.length}] "${q}"... `)
    const handles = await searchTikTok(page, q)
    const before = discovered.size
    handles.forEach(h => discovered.add(h))
    console.log(`+${discovered.size - before} new (total: ${discovered.size})`)
    await sleep(2000)
  }

  const allUsernames = Array.from(discovered)
  console.log(`\n✅ Found ${allUsernames.length} unique accounts to check\n`)

  // ── Phase 2: Scrape + filter profiles ─────────────────────────────────────
  console.log(`🎵 Phase 2: Scraping profiles...\n`)
  const qualified = []

  for (let i = 0; i < allUsernames.length; i++) {
    const username = allUsernames[i]
    process.stdout.write(`[${i + 1}/${allUsernames.length}] @${username}... `)
    const profile = await scrapeProfile(page, username)

    if (!profile) {
      console.log('✗ no data')
    } else {
      const relevant = isRelevant(profile.username, profile.nickname, profile.bio,
        profile.posts.flatMap(p => p.hashtags))
      if (relevant) {
        qualified.push(profile)
        console.log(`✅ ${profile.followers.toLocaleString()} followers · ${profile.videoCount} videos — "${profile.nickname}"`)
      } else {
        console.log(`⏭  skipped — "${profile.nickname}"`)
      }
    }
    await sleep(1500)
  }

  await browser.close()

  console.log(`\n🍽  ${qualified.length} Dallas-area Indian food accounts found:`)
  qualified.forEach(p => console.log(`   • @${p.username} (${p.nickname}) — ${p.followers.toLocaleString()} followers`))

  if (qualified.length === 0) {
    console.error('\n❌ No accounts found. TikTok may have blocked the search session.')
    process.exit(1)
  }

  // ── Phase 3: Upload ────────────────────────────────────────────────────────
  console.log('\n📊 Building intel...')
  const intel = buildIntel(qualified)

  console.log('☁️  Uploading to Vercel Blob...')
  const intelBlob = await put('tiktok-intel.json', JSON.stringify(intel), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: blobToken,
  })

  await put('tiktok-run-state.json', JSON.stringify({
    status: 'done',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    blobUrl: intelBlob.url,
    accountsFound: qualified.length,
  }), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: blobToken,
  })

  console.log(`\n🎉 Done! ${qualified.length} accounts · ${intel.totalPosts} total posts`)
  console.log('   Reload the dashboard TikTok tab to see results.')
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
