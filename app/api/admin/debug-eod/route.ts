import { NextRequest, NextResponse } from 'next/server'
import { centralTzOffset } from '@/lib/lighthouse'

const BASE = 'https://lighthouse-api.harbortouch.com'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || new Date(Date.now() - 4*60*60*1000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const token = process.env.LIGHTHOUSE_TOKEN || ''
  const locId = Number(process.env.LIGHTHOUSE_LOCATION_ID) || 0

  if (!token) return NextResponse.json({ error: 'no token' })

  const [y, m, d] = date.split('-').map(Number)
  const nextStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0]
  const start = `${date}T04:00:00${centralTzOffset(date)}`
  const end   = `${nextStr}T03:59:59${centralTzOffset(nextStr)}`

  const headers = { 'x-access-token': token, 'accept': 'application/json', 'content-type': 'application/json;charset=UTF-8' }
  const body = JSON.stringify({ start, end, locations: [locId], intradayPeriodGroupGuids: [], locale: 'en-US', revenueCenterGuids: [] })

  let raw: any = null
  try {
    const r = await fetch(`${BASE}/api/v1/reports/echo-pro/activity-summary`, { method: 'POST', headers, body, cache: 'no-store' })
    raw = await r.json().catch(() => null)
  } catch (e: any) { return NextResponse.json({ error: e.message }) }

  const bucket = raw?.buckets?.find((b: any) => b.guid === null)
  const getReport = (name: string) => bucket?.reports?.find((r: any) => r.name === name)

  // Try v2 void endpoints
  const results: Record<string, any> = {}
  const hdrs = { 'x-access-token': token, accept: 'application/json', 'content-type': 'application/json' }

  const v2Paths = [
    `/api/v2/echo-pro/voids?from=${encodeURIComponent(start)}&location=${locId}&to=${encodeURIComponent(end)}`,
    `/api/v2/echo-pro/void-transactions?from=${encodeURIComponent(start)}&location=${locId}&to=${encodeURIComponent(end)}`,
  ]
  for (const path of v2Paths) {
    const r = await fetch(`${BASE}${path}`, { headers: hdrs, cache: 'no-store' }).catch(() => null)
    if (r) {
      const text = await r.text().catch(() => '')
      results[path.split('?')[0]] = { status: r.status, preview: text.slice(0, 300) }
    }
  }

  // Try POST void report
  const postPaths = [
    '/api/v1/reports/echo-pro/void-detail',
    '/api/v1/reports/echo-pro/voids',
    '/api/v1/reports/echo-pro/void-transactions',
    '/api/v1/reports/echo-pro/net-void-detail',
  ]
  const reportBody = JSON.stringify({ start, end, locations: [locId], intradayPeriodGroupGuids: [], locale: 'en-US', revenueCenterGuids: [] })
  for (const path of postPaths) {
    const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: hdrs, body: reportBody, cache: 'no-store' }).catch(() => null)
    if (r) {
      const text = await r.text().catch(() => '')
      results[`POST ${path}`] = { status: r.status, preview: text.slice(0, 300) }
    }
  }

  const XLSX = require('xlsx')
  const startUTC = new Date(start).toISOString()
  const endUTC   = new Date(end).toISOString()
  const baseXls = `${BASE}/api/v1/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(startUTC)}&end=${encodeURIComponent(endUTC)}&locations%5B%5D=${locId}&token=${token}`

  const parseXls = async (url: string) => {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) return { rowCount: 0, firstItemQty: 0 }
    const buf = Buffer.from(await r.arrayBuffer())
    const wb = XLSX.read(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
    const dataRows = rows.slice(1).filter((r: any[]) => r[0] && !String(r[0]).startsWith('Total'))
    return { rowCount: dataRows.length, firstItem: dataRows[0]?.[0], firstItemQty: dataRows[0]?.[4] }
  }

  // Test different filter param formats
  const [allR, diR, togoR, diR2, togoR2] = await Promise.all([
    parseXls(baseXls),
    parseXls(baseXls + '&orderTypes%5B%5D=Dine%20In'),
    parseXls(baseXls + '&orderTypes%5B%5D=To%20Go'),
    parseXls(baseXls + '&revenueCenters%5B%5D=Dine%20In'),
    parseXls(baseXls + '&revenueCenters%5B%5D=To%20Go'),
  ])

  return NextResponse.json({
    date,
    all:       allR,
    'orderTypes[]=Dine In':  diR,
    'orderTypes[]=To Go':    togoR,
    'revenueCenters[]=Dine In': diR2,
    'revenueCenters[]=To Go':   togoR2,
  })
}
