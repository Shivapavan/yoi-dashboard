import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://lighthouse-api.harbortouch.com'

// Order #4027 - Dwipika K - DoorDash
const TEST_GUID = 'a8d92ad8-57cb-4a41-b4ce-968734e12d61'

export async function GET(req: NextRequest) {
  const guid  = req.nextUrl.searchParams.get('guid') || TEST_GUID
  const token = process.env.LIGHTHOUSE_TOKEN || ''
  const locId = Number(process.env.LIGHTHOUSE_LOCATION_ID) || 0

  if (!token) return NextResponse.json({ error: 'no token' })

  const hdrs = {
    'x-access-token': token,
    'accept': 'application/json',
    'content-type': 'application/json;charset=UTF-8',
  }

  const results: Record<string, any> = { guid }

  const tryGet = async (label: string, path: string, full = false) => {
    try {
      const r = await fetch(`${BASE}${path}`, { headers: hdrs, cache: 'no-store' })
      const text = await r.text()
      let body: any
      try { body = JSON.parse(text) } catch { body = text }
      results[label] = { status: r.status, body: full ? body : (typeof body === 'string' ? body.slice(0, 2000) : body) }
    } catch (e: any) { results[label] = { error: e.message } }
  }

  await Promise.all([
    // v2 ticket — might embed items
    tryGet('GET v2 /tickets/{guid}',                  `/api/v2/echo-pro/tickets/${guid}?location=${locId}`, true),
    // include/expand query params
    tryGet('GET /tickets/{guid}?includeItems=true',   `/api/v1/echo-pro/tickets/${guid}?location=${locId}&includeItems=true`, true),
    tryGet('GET /tickets/{guid}?expand=items',        `/api/v1/echo-pro/tickets/${guid}?location=${locId}&expand=items`, true),
    // Receipt-style endpoints
    tryGet('GET /receipt?ticketGuid',                 `/api/v1/echo-pro/receipt?ticketGuid=${guid}&location=${locId}`),
    tryGet('GET /receipts/{guid}',                    `/api/v1/echo-pro/receipts/${guid}?location=${locId}`),
    // Sold items / line items by different names
    tryGet('GET /sold-items?ticketGuid',              `/api/v1/echo-pro/sold-items?ticketGuid=${guid}&location=${locId}`),
    tryGet('GET /line-items?ticketGuid',              `/api/v1/echo-pro/line-items?ticketGuid=${guid}&location=${locId}`),
    tryGet('GET /items?ticket=',                      `/api/v1/echo-pro/items?ticket=${guid}&location=${locId}`),
    tryGet('GET /ticket-detail/{guid}',               `/api/v1/echo-pro/ticket-detail/${guid}?location=${locId}`, true),
    tryGet('GET /ticket-details?ticketGuid',          `/api/v1/echo-pro/ticket-details?ticketGuid=${guid}&location=${locId}`, true),
  ])

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
}
