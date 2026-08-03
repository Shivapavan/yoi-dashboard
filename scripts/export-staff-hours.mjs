/**
 * One-off export: pulls raw Lighthouse time-clock shifts for a date range
 * and writes an .xlsx with a per-employee summary + full shift detail.
 * Mirrors the pay-rate/exclusion logic in app/components/tabs/EmpShdt.tsx
 * and the date-window logic in app/api/emp-shifts/route.ts.
 *
 * Usage: node scripts/export-staff-hours.mjs 2026-06-01 2026-07-25
 */
import { readFileSync, writeFileSync } from 'fs'
import * as XLSX from '../node_modules/xlsx/xlsx.mjs'

function loadEnv() {
  const raw = readFileSync('.env.local', 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
loadEnv()

const BASE = 'https://lighthouse-api.harbortouch.com'
const TOKEN = process.env.LIGHTHOUSE_TOKEN
// .env.local's LIGHTHOUSE_LOCATION_ID is blank; scripts/daily-refresh.mjs hardcodes the real
// value below, so fall back to it the same way.
const LOCATION_ID = process.env.LIGHTHOUSE_LOCATION_ID || '43141083'
if (!TOKEN) { console.error('Missing LIGHTHOUSE_TOKEN in .env.local'); process.exit(1) }

const [, , startArg, endArg] = process.argv
const START_DATE = startArg || '2026-06-01'
const END_DATE = endArg || new Date(Date.now() - 4 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

// Same DST rule as lib/lighthouse.ts centralTzOffset
function centralTzOffset(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const marchSecondSunday = (() => { const d2 = new Date(Date.UTC(y, 2, 1)); const firstSun = (7 - d2.getUTCDay()) % 7; return 1 + firstSun + 7 })()
  const novFirstSunday = (() => { const d2 = new Date(Date.UTC(y, 10, 1)); return 1 + ((7 - d2.getUTCDay()) % 7) })()
  const dstStart = new Date(Date.UTC(y, 2, marchSecondSunday))
  const dstEnd = new Date(Date.UTC(y, 10, novFirstSunday))
  return date >= dstStart && date < dstEnd ? '-05:00' : '-06:00'
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

const businessEndDate = addDays(END_DATE, 1)
const startISO = `${START_DATE}T04:00:00${centralTzOffset(START_DATE)}`
const endISO = `${businessEndDate}T03:59:59${centralTzOffset(businessEndDate)}`

const filter = JSON.stringify({
  locationId: { $eq: String(LOCATION_ID) },
  voided: { $eq: false },
  isTracked: { $eq: true },
  $or: [
    { $and: [{ clockedInAt: { $gte: new Date(startISO).toISOString() } }, { clockedInAt: { $lte: new Date(endISO).toISOString() } }] },
    { $and: [{ clockedOutAt: { $gte: new Date(startISO).toISOString() } }, { clockedOutAt: { $lte: new Date(endISO).toISOString() } }] },
  ],
})

const url = `${BASE}/api/v2/echo-pro/time-clock-shifts?filter=${encodeURIComponent(filter)}&limit=1000&offset=0&order=${encodeURIComponent('clockedInAt asc')}`
const res = await fetch(url, { headers: { 'x-access-token': TOKEN, accept: 'application/json' }, cache: 'no-store' })
if (!res.ok) { console.error(`Lighthouse request failed: HTTP ${res.status}`); process.exit(1) }
const data = await res.json()
const rows = Array.isArray(data) ? data : (data.timeClockShifts ?? data.data ?? data.rows ?? data.shifts ?? [])

const EXCLUDED = new Set(['Randy', 'Samantha', 'Sindhu'])
const DEFAULT_HOURLY_RATE = 10
const EMPLOYEE_RATES = { janu: 10.5 }
const rateFor = (employee) => EMPLOYEE_RATES[employee.trim().toLowerCase()] ?? DEFAULT_HOURLY_RATE

const shifts = []
for (const row of rows) {
  const employee = row.employee?.name ?? row.employeeName ?? row.name ?? 'Unknown'
  if (EXCLUDED.has(employee)) continue
  const start = new Date(row.clockedInAt)
  const end = row.clockedOutAt ? new Date(row.clockedOutAt) : new Date()
  if (isNaN(start.getTime())) continue
  const hours = Math.round(Math.max(0, (end.getTime() - start.getTime()) / 3600000) * 100) / 100
  shifts.push({ employee, start, end, hours })
}

shifts.sort((a, b) => a.start - b.start)

const byEmployee = {}
for (const s of shifts) {
  if (!byEmployee[s.employee]) byEmployee[s.employee] = { employee: s.employee, shiftCount: 0, totalHours: 0 }
  byEmployee[s.employee].shiftCount += 1
  byEmployee[s.employee].totalHours += s.hours
}

const summaryRows = Object.values(byEmployee)
  .map((e) => {
    const rate = rateFor(e.employee)
    const totalHours = Math.round(e.totalHours * 100) / 100
    return {
      Employee: e.employee,
      Shifts: e.shiftCount,
      'Total Hours': totalHours,
      'Rate ($/hr)': rate,
      'Pay ($)': Math.round(totalHours * rate * 100) / 100,
    }
  })
  .sort((a, b) => b['Total Hours'] - a['Total Hours'])

const detailRows = shifts.map((s) => ({
  Employee: s.employee,
  Date: s.start.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }),
  'Clock In': s.start.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' }),
  'Clock Out': s.end.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' }),
  Hours: s.hours,
}))

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Shift Detail')

const outPath = `${process.env.HOME}/Downloads/yoi-staff-hours-${START_DATE}-to-${END_DATE}.xlsx`
writeFileSync(outPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

const grandTotalHours = Math.round(summaryRows.reduce((s, e) => s + e['Total Hours'], 0) * 100) / 100
const grandTotalPay = Math.round(summaryRows.reduce((s, e) => s + e['Pay ($)'], 0) * 100) / 100
console.log(`Wrote ${outPath}`)
console.log(`${summaryRows.length} employees, ${shifts.length} shifts, ${grandTotalHours}h total, $${grandTotalPay.toFixed(2)} total pay`)
