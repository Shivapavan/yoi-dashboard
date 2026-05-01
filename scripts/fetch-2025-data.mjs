import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjE2OTQ3MiwiZW1haWwiOiJ5dW1vZmluZGlhbWNraW5uZXlAZ21haWwuY29tIiwidXNlclNpbmNlIjoxNzUzMjQyODEwLCJpc3MiOiJsaWdodGhvdXNlIiwiZXhwIjoxNzc3NjEwODQyLCJqdGkiOiI2ZGQyMmE0YS0yNzhlLTQwYWUtYjIzOS1mZmZjMjBiNTMzMzEifQ.k-uSMba9XppQalKmuUurz8xLZVm3x10UfENsfBzo8t4'
const BASE = 'https://lighthouse-api.harbortouch.com/api/v1/dashboard/financial-overview'
const HEADERS = { 'x-access-token': TOKEN, 'accept': 'application/json' }

const METRICS = [
  'gross-sales', 'net-sales', 'taxes', 'discounts',
  'voids', 'cash-payments', 'credit-card-payments', 'open-tickets'
]

function businessDayWindow(dateStr) {
  // Business day: 4 AM CDT (= 9 AM UTC) to next day 3:59 AM CDT (= 8:59 AM UTC)
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d, 9, 0, 0, 0))
  const end = new Date(Date.UTC(y, m - 1, d + 1, 8, 59, 59, 999))
  return { start: start.toISOString(), end: end.toISOString() }
}

async function fetchMetric(metric, start, end) {
  const url = `${BASE}/${metric}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) return 0
  const data = await res.json()
  const key = metric
  const arr = data[key] || data[Object.keys(data)[0]] || []
  return arr.reduce((sum, loc) => sum + (loc.total || 0), 0)
}

async function fetchDay(dateStr) {
  const { start, end } = businessDayWindow(dateStr)
  const values = await Promise.all(METRICS.map(m => fetchMetric(m, start, end)))
  const [grossSales, netSales, taxes, discounts, voids, cashPayments, creditCard, openTickets] = values
  return { date: dateStr, grossSales, netSales, taxes, discounts, voids, cashPayments, creditCard, doordash: 0, stOnline: 0, uberEats: 0, openTickets }
}

function getAllDays2025() {
  const days = []
  const d = new Date('2025-01-01')
  const end = new Date('2025-12-31')
  while (d <= end) {
    days.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return days
}

async function main() {
  const days = getAllDays2025()
  console.log(`Fetching ${days.length} days of 2025 data...`)

  const results = []
  // Process in batches of 10 to avoid rate limits
  const BATCH = 10
  for (let i = 0; i < days.length; i += BATCH) {
    const batch = days.slice(i, i + BATCH)
    const batchResults = await Promise.all(batch.map(fetchDay))
    results.push(...batchResults)
    const done = Math.min(i + BATCH, days.length)
    process.stdout.write(`\r  ${done}/${days.length} days fetched...`)
  }
  console.log('\nDone fetching.')

  // Load existing dashboard.json and prepend 2025 data
  const dataPath = join(__dirname, '../data/dashboard.json')
  const existing = JSON.parse(readFileSync(dataPath, 'utf8'))

  // Filter out any existing 2025 entries, then prepend new ones
  const existing2026 = existing.history.filter(h => !h.date.startsWith('2025'))
  const newHistory = [...results, ...existing2026].sort((a, b) => a.date.localeCompare(b.date))

  existing.history = newHistory

  // Update earliest date reference
  const withData = results.filter(r => r.grossSales > 0)
  console.log(`Days with sales in 2025: ${withData.length}`)
  console.log(`Sample days:`)
  withData.slice(0, 5).forEach(d => console.log(`  ${d.date}: $${d.grossSales}`))

  writeFileSync(dataPath, JSON.stringify(existing, null, 2))
  console.log(`\nSaved ${results.length} days to dashboard.json`)
}

main().catch(console.error)
