import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://lighthouse-api.harbortouch.com'

function detectPlatform(name: string): string | null {
  const p = (name ?? '').toLowerCase()
  if (p.includes('doordash') || p.includes('door dash')) return 'doordash'
  if (p.includes('uber'))    return 'ubereats'
  if (p.includes('grubhub')) return 'grubhub'
  return null
}

function cleanName(name: string | null): string | null {
  if (!name) return null
  return name.replace(/^pickup-/i, '').trim() || null
}

export async function GET(req: NextRequest) {
  const token  = process.env.LIGHTHOUSE_TOKEN || ''
  const locId  = Number(process.env.LIGHTHOUSE_LOCATION_ID) || 0
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0')
  const CUTOFF = '2025-08-04'

  if (!token || !locId) return NextResponse.json({ error: 'no credentials' }, { status: 500 })

  const url = `${BASE}/api/v1/echo-pro/tickets?location=${locId}&isOnlineOrder=true&order=${encodeURIComponent('completedAt desc')}&limit=100&offset=${offset}`
  const res = await fetch(url, {
    headers: { 'x-access-token': token, 'accept': 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: `Lighthouse ${res.status}` }, { status: 502 })

  const raw: any[] = (await res.json()).tickets ?? []

  const tickets = raw
    .filter(t => {
      const bd = t.businessDay?.slice(0, 10) ?? ''
      if (!bd || bd < CUTOFF) return false
      return !!detectPlatform(t.paymentTypeName ?? '')
    })
    .map(t => ({
      guid:            t.guid,
      businessDay:     t.businessDay?.slice(0, 10) ?? '',
      orderNumber:     t.orderNumber,
      platform:        detectPlatform(t.paymentTypeName ?? ''),
      paymentTypeName: t.paymentTypeName ?? '',
      customerName:    cleanName(t.customTableName),
      employeeName:    t.employeeOwnerName || t.employeeCloseName || '',
      completedAt:     t.completedAt ?? null,
      createdAt:       t.createdAt,
      subtotal:        parseFloat(t.subtotal)       || 0,
      taxTotal:        parseFloat(t.taxTotal)       || 0,
      discountTotal:   parseFloat(t.discountTotal)  || 0,
      surchargeTotal:  parseFloat(t.surchargeTotal) || 0,
      grandTotal:      parseFloat(t.grandTotal)     || 0,
    }))

  // Detect whether any ticket in this batch predates our cutoff (signals we should stop)
  const hitCutoff = raw.some(t => (t.businessDay?.slice(0, 10) ?? '') < CUTOFF)

  return NextResponse.json({
    tickets,
    rawCount: raw.length,
    hitCutoff,
    hasMore: raw.length === 100 && !hitCutoff,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
