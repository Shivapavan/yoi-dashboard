import { NextRequest, NextResponse } from 'next/server'
import { fetchItemsForRange } from '@/lib/lighthouse'

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from')
  const to   = req.nextUrl.searchParams.get('to')
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from and to required (YYYY-MM-DD)' }, { status: 400 })
  }
  const items = await fetchItemsForRange(from, to)
  return NextResponse.json({ from, to, items: items || [] }, { headers: { 'Cache-Control': 'no-store' } })
}
