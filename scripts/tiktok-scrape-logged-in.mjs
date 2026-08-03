/**
 * TikTok scraper that uses a persistent browser profile.
 * First run: opens TikTok, you log in manually, session is saved.
 * Subsequent runs: reuses saved session — no login needed.
 *
 * Usage: node scripts/tiktok-scrape-logged-in.mjs
 */

import { readFileSync, mkdirSync } from 'fs'
import { put } from '@vercel/blob'
import { chromium } from 'playwright'
import * as readline from 'readline'

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

async function pressEnterToContinue(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(prompt, () => { rl.close(); resolve() })
  })
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

const YOI_USERNAME = 'yumofindiamckinney'
const PROFILE_DIR = '/tmp/tiktok-playwright-profile'

// The 95 accounts found by the discovery run
const ACCOUNTS_TO_SCRAPE = [
  'premaskitchen', 'tantraindianbistro', 'nagskitchen', 'ulavacharu',
  'thefoodiewithabootie', 'kellysimplyeats', 'dfweatashalal', 'allthingsfoodtastic',
  'jensnomz', 'myculinaryadventures', 'poptartsinhiding', 'explorer__sb',
  'mjindallas', 'jayykayybee', 'cookingwithrashee', 'dallasbuzz',
  'dubbsgrubs', 'wandererinspired', 'm0nsterati', 'satexasfoodies',
  'kanwalinamerica', 'kathakitchen', 'toomuchsaki', 'dfwfoodblogger',
  'qwackyeats', 'wherebebe', 'forkinwithya', 'theaamireffect',
  'halalfoodandevents', 'dallas_halal_hunts', 'pappuchaat3', 'kwk_kitchen',
  'linamdugg', 'txfamousnygyro', 'thealishachronicles', 'hyderabadichaigrill',
  'foodiefaisu', 'arooshvlogs21', 'hangryviolet', 'officialhalalpalate',
  'karachi_fusion', 'dallashalalreviews', 'bitesofbengal', '_fariharahman_',
  'jimmysrestaurantcatering', 'halal_foodistan', 'dumbiryanii', 'shreejumagaju',
  'thehoustonfoodie', 'thehungrylonghorn', 'afoodieinaustin', 'electricgravyatx',
  'houstonhotspots', 'nirmanzofficial', 'tastyanu', 'katie_mylady',
  'mallubrosthattukada', 'dtxadventures', 'youhadmeathalal', 'tacokingtx',
  'albaghdadyrestaurant', 'halal___foodgram', 'nextgenpropertiesus',
  'dallasfoodlist', 'dallasdesifoodies', 'babahanuyghurcafe', 'worldfoodwarehouse',
  'saucebrospizza', 'hijabi_explorer', 'desfrmdetroit', 'deetxexperience',
  'meatjuicebbq', 'litehousegrilldfw', 'eatangies', 'shefliesfromdallas',
  'thaicharm2023', 'amyjovel', 'autumnsaiore', 'toothaistreeteat',
  'dallasfoodiefix', 'noodleone888', 'kweaves_', 'nicotreats',
  'munchieswithyoo', 'yofavpescatarian', 'casadelbro', 'yolondallas',
  'hungryasskid', 'sammyjosephinez', 'charisshreill', 'rubys_foodies',
  'brittanyroseblog', 'dallas_discovered', 'hamidabbas_texasking', 'dallasfoodies',
  YOI_USERNAME,
]

async function scrapeProfile(page, username) {
  try {
    await page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: 'domcontentloaded', timeout: 25000,
    })
    await sleep(2500)

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

  const topPosts = [...allPosts].sort((a, b) => b.views - a.views).slice(0, 50)

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

  mkdirSync(PROFILE_DIR, { recursive: true })

  console.log('\n🌐 Launching browser with persistent profile...')
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    slowMo: 80,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  })
  const page = await context.newPage()

  // Check if logged in
  console.log('\n🔍 Checking TikTok login status...')
  await page.goto('https://www.tiktok.com', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(3000)

  const isLoggedIn = await page.evaluate(() => {
    return document.cookie.includes('sessionid') ||
      !!document.querySelector('[data-e2e="nav-avatar"]') ||
      !!document.querySelector('[data-e2e="profile-icon"]') ||
      document.body.innerText.includes('Profile')
  })

  if (!isLoggedIn) {
    console.log('\n⚠️  Not logged in to TikTok.')
    console.log('   → The browser is now open.')
    console.log('   → Log in to your TikTok account in the browser window.')
    console.log('   → Then come back here and press Enter to continue.\n')
    await pressEnterToContinue('Press Enter once you are logged in to TikTok... ')
    console.log('\n✅ Continuing with your session...')
  } else {
    console.log('✅ Already logged in!')
  }

  // Scrape all accounts
  console.log(`\n🎵 Scraping ${ACCOUNTS_TO_SCRAPE.length} accounts with logged-in session...\n`)
  const profiles = []
  let postsFound = 0

  for (let i = 0; i < ACCOUNTS_TO_SCRAPE.length; i++) {
    const username = ACCOUNTS_TO_SCRAPE[i]
    process.stdout.write(`[${i + 1}/${ACCOUNTS_TO_SCRAPE.length}] @${username}... `)
    const profile = await scrapeProfile(page, username)

    if (!profile) {
      console.log('✗ no data')
    } else {
      profiles.push(profile)
      postsFound += profile.posts.length
      const postInfo = profile.posts.length > 0 ? `${profile.posts.length} posts` : '0 posts'
      console.log(`✅ ${profile.followers.toLocaleString()} followers · ${postInfo} — "${profile.nickname}"`)
    }
    await sleep(1200)
  }

  await context.close()

  if (profiles.length === 0) { console.error('\n❌ No profiles found.'); process.exit(1) }

  console.log(`\n📊 Building intel from ${profiles.length} profiles, ${postsFound} posts...`)
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
    accountsFound: profiles.length,
  }), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: blobToken,
  })

  console.log(`\n🎉 Done! ${profiles.length} accounts · ${intel.totalPosts} posts`)
  console.log('   Reload the TikTok tab in the dashboard to see results.')
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
