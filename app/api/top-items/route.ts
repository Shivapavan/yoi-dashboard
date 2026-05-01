import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const data = JSON.parse(readFileSync(join(process.cwd(), 'data/dashboard.json'), 'utf8'))

  const day = data.itemsByDay.find((d: any) => d.date === date)

  // Find last date with items data
  const sorted = [...data.itemsByDay].sort((a: any, b: any) => b.date.localeCompare(a.date))
  const recommendedDate = sorted[0]?.date || date

  const items = day ? day.items.map((item: any) => ({
    name: item.name,
    count: item.qty,
    revenue: item.revenue,
  })) : []

  return NextResponse.json({ date, items, recommendedDate })
}
