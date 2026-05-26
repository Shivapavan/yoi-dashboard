import { NextRequest, NextResponse } from 'next/server'
import { fetchDailyCateringOrders } from '@/lib/google'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })
  }
  const orders = await fetchDailyCateringOrders(date)
  return NextResponse.json({ date, orders })
}
