import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE2OTQ3MiwiZW1haWwiOiJ5dW1vZmluZGlhbWNraW5uZXlAZ21haWwuY29tIiwidXNlclNpbmNlIjoxNzUzMjQyODEwLCJpc3MiOiJsaWdodGhvdXNlIiwiZXhwIjoxNzc3NzI4MjQ5LCJqdGkiOiIwZThjMTFjNS02MjIyLTQ2ZDQtOWIwMC05ZDZjMDY1ZjkxZjIifQ.g854N110X7mT2YuAbuwcMu4MdoBcYq-0Vbwf8cXDMb4'

async function fetchItemsForDay(dateStr) {
  // Business day: 4AM CDT (= 9AM UTC) to next day 3:59AM CDT (= 8:59AM UTC)
  const start = dateStr + 'T09:00:00-00:00'
  const next = new Date(dateStr); next.setDate(next.getDate() + 1)
  const end = next.toISOString().split('T')[0] + 'T08:59:00-00:00'

  const url = `https://lighthouse-api.harbortouch.com/api/v1/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&locations%5B%5D=43141083&token=${TOKEN}`

  const res = await fetch(url)
  if (!res.ok) return null

  const buffer = await res.arrayBuffer()
  const XLSX = require('/tmp/xlsparse/node_modules/xlsx')
  const wb = XLSX.read(Buffer.from(buffer))
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

  // Row 0 is header: ["Item","Revenue Class","Department","Default Price","Qty","Total Cost","% of Total","Discounts","Avg. Sale Price","Gross Sales",...]
  const items = []
  for (const row of rows.slice(1)) {
    if (!row[0] || typeof row[0] !== 'string') continue
    const name = row[0].trim()
    const qty = Number(row[4]) || 0
    const grossSales = Number(row[9]) || 0
    if (qty > 0 && grossSales > 0) {
      items.push({ name, qty, revenue: +grossSales.toFixed(2) })
    }
  }

  // Sort by revenue desc
  items.sort((a, b) => b.revenue - a.revenue)
  return items.length ? items : null
}

async function main() {
  const dataPath = join(__dirname, '../data/dashboard.json')
  const data = JSON.parse(readFileSync(dataPath, 'utf8'))

  const existing = new Set(data.itemsByDay.map(d => d.date))
  const missing = data.history
    .filter(h => h.grossSales > 0 && !existing.has(h.date))
    .map(h => h.date)

  console.log(`Fetching items for ${missing.length} missing dates...`)

  const BATCH = 8
  const newEntries = []

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(async date => {
        const items = await fetchItemsForDay(date)
        return { date, items }
      })
    )

    for (const { date, items } of results) {
      if (items && items.length > 0) {
        newEntries.push({ date, items })
      }
    }

    const done = Math.min(i + BATCH, missing.length)
    process.stdout.write(`\r  ${done}/${missing.length} fetched (${newEntries.length} with data)...`)
  }

  console.log('\nDone fetching.')

  // Merge with existing and sort by date
  const merged = [...data.itemsByDay, ...newEntries]
  merged.sort((a, b) => a.date.localeCompare(b.date))
  data.itemsByDay = merged

  writeFileSync(dataPath, JSON.stringify(data, null, 2))
  console.log(`Saved. Total itemsByDay entries: ${merged.length}`)

  // Show sample
  const sample = newEntries.slice(-2)
  sample.forEach(d => {
    console.log(`\n${d.date} top 3:`)
    d.items.slice(0,3).forEach((it,i) => console.log(`  ${i+1}. ${it.name} — qty:${it.qty} $${it.revenue}`))
  })
}

main().catch(console.error)
