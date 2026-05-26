import { NextRequest, NextResponse } from 'next/server'
import { fetchOrderItemsFromEmail } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const platform     = p.get('platform') as 'doordash' | 'ubereats' | 'grubhub' | 'other' | null
  const orderDate    = p.get('date')        // YYYY-MM-DD
  const total        = parseFloat(p.get('total') || '0')
  const customerName = p.get('customer')

  if (!platform || !orderDate || !total) {
    return NextResponse.json({ error: 'platform, date, and total are required' }, { status: 400 })
  }

  const items = await fetchOrderItemsFromEmail({ platform, orderDate, total, customerName })
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
}
