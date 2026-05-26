import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fetchLiveItems, fetchActivitySummaryData, centralTzOffset } from '@/lib/lighthouse'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ||
    new Date(Date.now() - 4 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const data = JSON.parse(readFileSync(join(process.cwd(), 'data/dashboard.json'), 'utf8'))

  const sorted = [...data.itemsByDay].sort((a: any, b: any) => b.date.localeCompare(a.date))
  const recommendedDate = sorted[0]?.date || date
  const serverToday = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const isToday = date === serverToday

  let items: any[] | null = null

  // Fetch order type summary from activity-summary (Dine In vs To Go totals)
  let orderTypes: { type: string; amount: number }[] = []
  try {
    const [y0, m0, d0] = date.split('-').map(Number)
    const nextStr0 = new Date(Date.UTC(y0, m0 - 1, d0 + 1)).toISOString().split('T')[0]
    const actData = await fetchActivitySummaryData(
      `${date}T04:00:00${centralTzOffset(date)}`,
      `${nextStr0}T03:59:59${centralTzOffset(nextStr0)}`
    ) as any
    // grossByRevenue contains order type rows in some Lighthouse configs
    // Try parsing "Gross Sales by Order Type" directly from the raw response
    orderTypes = actData?.orderTypes ?? []
  } catch { /* ignore */ }

  if (isToday) {
    const liveItems = await fetchLiveItems(date)
    if (liveItems && liveItems.length > 0) {
      items = liveItems.map((it: any) => ({ name: it.name, count: it.qty, revenue: it.revenue }))
    }
  }

  // Fall back to stored data
  if (!items) {
    const day = data.itemsByDay.find((d: any) => d.date === date)
    if (day) {
      items = day.items.map((it: any) => ({ name: it.name, count: it.qty, revenue: it.revenue }))
    }
  }

  // If still no items and date is recent (last 7 days), try live API as fallback
  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  if (!items && date >= recentCutoff) {
    const liveItems = await fetchLiveItems(date)
    if (liveItems && liveItems.length > 0) {
      items = liveItems.map((it: any) => ({ name: it.name, count: it.qty, revenue: it.revenue }))
      return NextResponse.json({ date, items, recommendedDate, live: true, orderTypes })
    }
  }

  return NextResponse.json({ date, items: items || [], recommendedDate, live: isToday, orderTypes })
}
