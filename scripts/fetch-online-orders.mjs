/**
 * Backfill script: downloads all historical online delivery orders from the deployed API
 * (which has access to the encrypted Lighthouse credentials) and saves to data/online-orders.json
 *
 * Usage:
 *   node scripts/fetch-online-orders.mjs
 *
 * No local credentials needed — calls the deployed Vercel endpoint.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_BASE  = 'https://yoi-dashboard.vercel.app/api/admin/export-online-orders'
const TODAY     = new Date(Date.now() - 4 * 60 * 60 * 1000)
  .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

async function main() {
  const outPath = join(__dirname, '../data/online-orders.json')
  const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { orders: {} }
  const ordersByDate = existing.orders ?? {}

  const seenGuids = new Set(Object.values(ordersByDate).flat().map(o => o.guid))

  let offset  = 0
  let saved   = 0
  let fetched = 0

  console.log('Fetching historical online delivery orders from deployed API...')
  console.log('(newest first, 100 per page)\n')

  while (true) {
    const res = await fetch(`${API_BASE}?offset=${offset}`)
    if (!res.ok) throw new Error(`API error ${res.status} at offset ${offset}`)
    const { tickets, rawCount, hasMore } = await res.json()

    fetched += rawCount ?? 0

    for (const t of tickets) {
      const bd = t.businessDay
      if (!bd || bd >= TODAY) continue   // skip today — served live
      if (seenGuids.has(t.guid)) continue
      seenGuids.add(t.guid)
      if (!ordersByDate[bd]) ordersByDate[bd] = []
      ordersByDate[bd].push(t)
      saved++
    }

    const oldestDate = tickets.length ? tickets[tickets.length - 1].businessDay : '—'
    process.stdout.write(`\r  page ${Math.floor(offset / 100) + 1}  raw=${fetched}  saved=${saved}  oldest=${oldestDate}   `)

    if (!hasMore) break
    offset += 100
    await new Promise(r => setTimeout(r, 200))
  }

  // Sort each day newest-first
  for (const date of Object.keys(ordersByDate)) {
    ordersByDate[date].sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return tb - ta
    })
  }

  const daysWithOrders = Object.keys(ordersByDate).filter(d => ordersByDate[d].length > 0).length
  writeFileSync(outPath, JSON.stringify({
    updatedAt: new Date().toISOString(),
    orders: ordersByDate,
  }, null, 2))

  console.log(`\n\nDone!`)
  console.log(`  Saved ${saved} delivery orders across ${daysWithOrders} days`)
  console.log(`  → data/online-orders.json`)
  console.log(`\nNext steps:`)
  console.log(`  git add data/online-orders.json`)
  console.log(`  git commit -m "backfill online orders Aug 2025 – ${TODAY}"`)
  console.log(`  vercel --prod`)
}

main().catch(e => { console.error('\nError:', e.message); process.exit(1) })
