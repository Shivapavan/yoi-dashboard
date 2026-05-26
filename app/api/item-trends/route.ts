import { NextRequest, NextResponse } from 'next/server'
import { fetchItemsForRange } from '@/lib/lighthouse'

interface Period { key: string; label: string; start: string; end: string }

function generateMonthPeriods(fromMonth: string, today: string): Period[] {
  const periods: Period[] = []
  const [fy, fm] = fromMonth.split('-').map(Number)
  const todayDate = new Date(today + 'T12:00:00')
  let y = fy, m = fm
  while (true) {
    const lastDay = new Date(y, m, 0).getDate()
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    // Cap end at today
    const periodEnd = end > today ? today : end
    if (new Date(start + 'T12:00:00') > todayDate) break
    const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    periods.push({ key: `${y}-${String(m).padStart(2, '0')}`, label, start, end: periodEnd })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return periods
}

function generateWeekPeriods(fromMonth: string, today: string): Period[] {
  // Weeks from Monday → Sunday, starting from the Monday of fromMonth's first week
  const periods: Period[] = []
  const start = new Date(fromMonth + '-01T12:00:00')
  // Walk back to Monday
  const day = start.getDay()
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day))
  const todayDate = new Date(today + 'T12:00:00')
  while (start <= todayDate) {
    const weekEnd = new Date(start); weekEnd.setDate(weekEnd.getDate() + 6)
    const sIso = start.toISOString().slice(0, 10)
    const eIso = weekEnd.toISOString().slice(0, 10) > today ? today : weekEnd.toISOString().slice(0, 10)
    periods.push({
      key: sIso,
      label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      start: sIso, end: eIso,
    })
    start.setDate(start.getDate() + 7)
  }
  return periods
}

export async function GET(req: NextRequest) {
  const groupBy   = (req.nextUrl.searchParams.get('groupBy') || 'month') as 'month' | 'week'
  const fromMonth = req.nextUrl.searchParams.get('from') || '2025-08'

  const today = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  const periods = groupBy === 'week'
    ? generateWeekPeriods(fromMonth, today)
    : generateMonthPeriods(fromMonth, today)

  // Fetch all periods in parallel (with concurrency limit to avoid hammering Lighthouse)
  const results: Array<{ period: Period; items: {name: string; qty: number; revenue: number}[] }> = []
  const concurrency = 4
  for (let i = 0; i < periods.length; i += concurrency) {
    const batch = periods.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(async (period) => {
      const items = await fetchItemsForRange(period.start, period.end)
      return { period, items: items || [] }
    }))
    results.push(...batchResults)
  }

  // Aggregate
  const itemMap: Record<string, {
    name: string
    byPeriod: Record<string, { qty: number; revenue: number }>
    totalQty: number
    totalRevenue: number
  }> = {}

  for (const { period, items } of results) {
    for (const it of items) {
      if (!itemMap[it.name]) {
        itemMap[it.name] = { name: it.name, byPeriod: {}, totalQty: 0, totalRevenue: 0 }
      }
      // Combine if same period (shouldn't happen but defensive)
      const existing = itemMap[it.name].byPeriod[period.key]
      itemMap[it.name].byPeriod[period.key] = existing
        ? { qty: existing.qty + it.qty, revenue: +(existing.revenue + it.revenue).toFixed(2) }
        : { qty: it.qty, revenue: it.revenue }
      itemMap[it.name].totalQty += it.qty
      itemMap[it.name].totalRevenue += it.revenue
    }
  }

  const items = Object.values(itemMap).sort((a, b) => b.totalRevenue - a.totalRevenue)
  return NextResponse.json({
    periods: periods.map(p => ({ key: p.key, label: p.label })),
    items,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
