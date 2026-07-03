/**
 * Scrapes competitor following lists from your local Mac (home IP — not blocked by Instagram).
 * Usage: node scripts/scrape-following-local.mjs
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

const APP_ID = '936619743392459'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const COMPETITOR_ACCOUNTS = [
  'yumofindia_mckinney', 'jataraindiankitchen', '_nagskitchen_', 'premaskitchen',
  'aaha_kitchen_celina', 'saibhavancarrollton', 'hyderabadhouseprosper',
  'golconda_xpress_food_truck', 'babai_bandi', 'bharat_bhavan_allen',
  'desi_district_frisco', 'desistreet_frisco',
]

function igHeaders(sessionId) {
  return {
    'x-ig-app-id': APP_ID,
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': `sessionid=${sessionId}`,
    'Referer': 'https://www.instagram.com/',
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function getUserId(username, sessionId) {
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      { headers: igHeaders(sessionId) }
    )
    if (!res.ok) return null
    const json = await res.json()
    const user = json?.data?.user
    if (!user?.id) return null
    return { userId: user.id, displayName: user.full_name ?? username }
  } catch { return null }
}

async function scrapeFollowing(username, sessionId, maxPages = 10) {
  const info = await getUserId(username, sessionId)
  if (!info) return null

  const allUsers = []
  let cursor = undefined

  for (let page = 0; page < maxPages; page++) {
    try {
      const params = new URLSearchParams({ count: '50' })
      if (cursor) params.set('max_id', cursor)
      const res = await fetch(
        `https://i.instagram.com/api/v1/friendships/${info.userId}/following/?${params}`,
        { headers: igHeaders(sessionId) }
      )
      if (!res.ok) break
      const json = await res.json()
      const users = json.users ?? []
      for (const u of users) {
        allUsers.push({
          username: u.username ?? '',
          fullName: u.full_name ?? '',
          isVerified: u.is_verified ?? false,
          isPrivate: u.is_private ?? false,
          profilePicUrl: u.profile_pic_url ?? '',
          latestReelAt: u.latest_reel_media ?? null,
        })
      }
      if (!json.next_max_id || users.length === 0) break
      cursor = json.next_max_id
      await sleep(1500)
    } catch { break }
  }

  return { username, displayName: info.displayName, totalFetched: allUsers.length, accounts: allUsers, scrapedAt: new Date().toISOString() }
}

function findCommonFollows(results, minSharedBy = 2) {
  const byUsername = new Map()
  for (const result of results) {
    for (const acc of result.accounts) {
      if (!acc.username) continue
      const existing = byUsername.get(acc.username)
      if (existing) existing.sharedBy.push(result.username)
      else byUsername.set(acc.username, { account: acc, sharedBy: [result.username] })
    }
  }
  return Array.from(byUsername.values())
    .filter(e => e.sharedBy.length >= minSharedBy)
    .map(e => ({ ...e, score: e.sharedBy.length * (e.account.isVerified ? 2 : 1) }))
    .sort((a, b) => b.score - a.score)
}

async function main() {
  loadEnv()
  const sessionId = process.env.IG_SESSION_ID
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!sessionId) { console.error('❌ IG_SESSION_ID not in .env.local'); process.exit(1) }
  if (!blobToken) { console.error('❌ BLOB_READ_WRITE_TOKEN not in .env.local'); process.exit(1) }

  console.log(`\n🕵️  Scraping following lists for ${COMPETITOR_ACCOUNTS.length} accounts...\n`)

  const results = []
  for (let i = 0; i < COMPETITOR_ACCOUNTS.length; i++) {
    const username = COMPETITOR_ACCOUNTS[i]
    process.stdout.write(`[${i + 1}/${COMPETITOR_ACCOUNTS.length}] ${username}... `)
    const result = await scrapeFollowing(username, sessionId, 10)
    if (result) {
      results.push(result)
      console.log(`✓ ${result.totalFetched} accounts followed`)
      await put(`instagram-following-${username}.json`, JSON.stringify(result), {
        access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: blobToken,
      })
    } else {
      console.log('✗ skipped')
    }
    if (i < COMPETITOR_ACCOUNTS.length - 1) await sleep(3000)
  }

  if (results.length === 0) { console.error('\n❌ No results — session may be expired.'); process.exit(1) }

  const commonFollows = findCommonFollows(results, 2)
  const summary = {
    lastUpdated: new Date().toISOString(),
    accountsScraped: results.length,
    accounts: results.map(r => ({
      username: r.username, displayName: r.displayName,
      totalFollowing: r.totalFetched,
      verifiedFollows: r.accounts.filter(a => a.isVerified).length,
      scrapedAt: r.scrapedAt,
    })),
    commonFollows: commonFollows.slice(0, 100),
    totalUniqueFollows: new Set(results.flatMap(r => r.accounts.map(a => a.username))).size,
  }

  console.log(`\n✅ Done! ${results.length} accounts · ${summary.totalUniqueFollows.toLocaleString()} unique follows · ${commonFollows.length} shared`)
  console.log('☁️  Uploading summary...')

  const summaryBlob = await put('instagram-following-summary.json', JSON.stringify(summary), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: blobToken,
  })

  await put('instagram-following-state.json', JSON.stringify({
    status: 'done', startedAt: new Date().toISOString(),
    processed: results.length, total: COMPETITOR_ACCOUNTS.length,
    blobUrl: summaryBlob.url,
  }), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: blobToken,
  })

  console.log(`🎉 Following analysis uploaded. Reload the dashboard to see results.`)
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
