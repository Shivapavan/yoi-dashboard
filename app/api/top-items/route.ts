import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fetchLiveItems } from '@/lib/lighthouse'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const data = JSON.parse(readFileSync(join(process.cwd(), 'data/dashboard.json'), 'utf8'))

  const sorted = [...data.itemsByDay].sort((a: any, b: any) => b.date.localeCompare(a.date))
  const recommendedDate = sorted[0]?.date || date
  const isToday = date === data.businessDay

  let items: any[] | null = null

  if (isToday) {
    // LIVE: fetch from Lighthouse reports API
    const liveItems = await fetchLiveItems(date)
    if (liveItems && liveItems.length > 0) {
      items = liveItems.map((it: any) => ({ name: it.name, count: it.qty, revenue: it.revenue }))
    }
  }

  // Fall back to stored data if live fetch failed or not today
  if (!items) {
    const day = data.itemsByDay.find((d: any) => d.date === date)
    items = day ? day.items.map((it: any) => ({ name: it.name, count: it.qty, revenue: it.revenue })) : []
  }

  return NextResponse.json({ date, items, recommendedDate, live: isToday })
}
