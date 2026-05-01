import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE2OTQ3MiwiZW1haWwiOiJ5dW1vZmluZGlhbWNraW5uZXlAZ21haWwuY29tIiwidXNlclNpbmNlIjoxNzUzMjQyODEwLCJpc3MiOiJsaWdodGhvdXNlIiwiZXhwIjoxNzc3NzI4MjQ5LCJqdGkiOiIwZThjMTFjNS02MjIyLTQ2ZDQtOWIwMC05ZDZjMDY1ZjkxZjIifQ.g854N110X7mT2YuAbuwcMu4MdoBcYq-0Vbwf8cXDMb4'
const MERCHANT_ID = '0022712560'
const HEADERS = { 'x-access-token': TOKEN, 'accept': 'application/json' }

async function fetchCardBreakdown(dateStr) {
  // Calendar day CDT: midnight CDT (05:00 UTC) to 11:59 PM CDT (next day 04:59 UTC)
  const start = dateStr + 'T05:00:00.000Z'
  const next = new Date(dateStr); next.setDate(next.getDate() + 1)
  const end = next.toISOString().split('T')[0] + 'T04:59:59.999Z'

  const url = `https://lighthouse-api.harbortouch.com/api/v1/dashboard/processing/batch-detail?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&merchantId=${MERCHANT_ID}`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) return null
  const data = await res.json()
  const batches = data.batches || []

  if (batches.length === 0) return null

  return {
    visa:     +batches.reduce((s, b) => s + (b.AmtVisa || 0), 0).toFixed(2),
    mastercard: +batches.reduce((s, b) => s + (b.AmtMasterCard || 0), 0).toFixed(2),
    amex:     +batches.reduce((s, b) => s + (b.AmtAmex || 0), 0).toFixed(2),
    discover: +batches.reduce((s, b) => s + (b.AmtDiscover || 0), 0).toFixed(2),
    debit:    +batches.reduce((s, b) => s + (b.AmtDebit || 0), 0).toFixed(2),
    ebt:      +batches.reduce((s, b) => s + (b.AmtEBT || 0), 0).toFixed(2),
    returns:  +batches.reduce((s, b) => s + (b.AmtReturns || 0), 0).toFixed(2),
    total:    +batches.reduce((s, b) => s + (b.TotalAmt || 0), 0).toFixed(2),
  }
}

async function main() {
  const dataPath = join(__dirname, '../data/dashboard.json')
  const data = JSON.parse(readFileSync(dataPath, 'utf8'))

  // Only fetch days that have sales data
  const daysWithSales = data.history.filter(h => h.grossSales > 0)
  console.log(`Fetching card breakdown for ${daysWithSales.length} days with sales...`)

  const BATCH = 10
  let updated = 0

  for (let i = 0; i < daysWithSales.length; i += BATCH) {
    const batch = daysWithSales.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async day => {
      const breakdown = await fetchCardBreakdown(day.date)
      return { date: day.date, breakdown }
    }))

    for (const { date, breakdown } of results) {
      if (!breakdown) continue
      const idx = data.history.findIndex(h => h.date === date)
      if (idx >= 0) {
        data.history[idx].cardBreakdown = breakdown
        updated++
      }
    }

    const done = Math.min(i + BATCH, daysWithSales.length)
    process.stdout.write(`\r  ${done}/${daysWithSales.length} days processed...`)
  }

  console.log(`\nUpdated card breakdown for ${updated} days.`)

  // Sample output
  const samples = data.history.filter(h => h.cardBreakdown).slice(-3)
  samples.forEach(d => console.log(`  ${d.date}: Visa=${d.cardBreakdown.visa} MC=${d.cardBreakdown.mastercard} Amex=${d.cardBreakdown.amex} Disc=${d.cardBreakdown.discover}`))

  writeFileSync(dataPath, JSON.stringify(data, null, 2))
  console.log('Saved dashboard.json')
}

main().catch(console.error)
