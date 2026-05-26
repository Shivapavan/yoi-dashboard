import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://lighthouse-api.harbortouch.com'
const LOC  = Number(process.env.LIGHTHOUSE_LOCATION_ID) || 43141083

export async function GET(req: NextRequest) {
  const token = process.env.LIGHTHOUSE_TOKEN || ''
  if (!token) return NextResponse.json({ error: 'no token' })

  const start = req.nextUrl.searchParams.get('start') || '2026-05-01T04:00:00-05:00'
  const end   = req.nextUrl.searchParams.get('end')   || '2026-05-02T03:59:59-05:00'
  const hdrs  = { 'x-access-token': token, accept: 'application/json' }

  const filter = JSON.stringify({
    locationId: { $eq: String(LOC) },
    voided:     { $eq: false },
    isTracked:  { $eq: true },
    $or: [
      { $and: [{ clockedInAt:  { $gte: start } }, { clockedInAt:  { $lte: end } }] },
      { $and: [{ clockedOutAt: { $gte: start } }, { clockedOutAt: { $lte: end } }] },
    ],
  })

  const url = `${BASE}/api/v2/echo-pro/time-clock-shifts?filter=${encodeURIComponent(filter)}&limit=200&offset=0&order=${encodeURIComponent('clockedInAt asc')}`
  let status = 0, data: any = null
  try {
    const r = await fetch(url, { headers: hdrs, cache: 'no-store' })
    status = r.status
    data = await r.json().catch(() => null)
  } catch (e: any) { data = { fetchError: e.message } }

  const rows: any[] = Array.isArray(data) ? data : (data?.timeClockShifts ?? data?.data ?? data?.rows ?? data?.shifts ?? [])

  return NextResponse.json({
    status, start, end, locationId: LOC,
    topLevelKeys: data ? Object.keys(data) : null,
    totalCount: rows.length,
    sample: rows.slice(0, 2),  // show first 2 records to understand structure
  })
}
