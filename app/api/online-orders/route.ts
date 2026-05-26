import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fetchOnlineOrders } from '@/lib/lighthouse'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })

  const today = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  // Today → always live (orders arrive in real-time)
  if (date === today) {
    const orders = await fetchOnlineOrders(date)
    return NextResponse.json({ orders, source: 'live' }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Historical → read from backfilled JSON file
  const filePath = join(process.cwd(), 'data/online-orders.json')
  if (existsSync(filePath)) {
    const data = JSON.parse(readFileSync(filePath, 'utf8'))
    const orders = data.orders?.[date] ?? []
    if (orders.length > 0) {
      return NextResponse.json({ orders, source: 'file' })
    }
  }

  // Fallback: try live API for recent dates not yet in the file (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  if (date >= sevenDaysAgo) {
    const orders = await fetchOnlineOrders(date)
    return NextResponse.json({ orders, source: 'live-fallback' }, { headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json({ orders: [], source: 'none' })
}
