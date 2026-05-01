const BASE = 'https://lighthouse-api.harbortouch.com'
const LOCATION_ID = 43141083
const MERCHANT_ID = '0022712560'

function getToken(): string {
  return process.env.LIGHTHOUSE_TOKEN || ''
}

function headers() {
  return {
    'x-access-token': getToken(),
    'accept': 'application/json',
    'content-type': 'application/json;charset=UTF-8',
  }
}

export function businessDayWindow(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d, 9, 0, 0, 0))      // 4 AM CDT = 9 AM UTC
  const end   = new Date(Date.UTC(y, m - 1, d + 1, 8, 59, 59, 999)) // 3:59 AM CDT next day
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function fetchMetric(metric: string, start: string, end: string): Promise<number> {
  const token = getToken()
  if (!token) return 0
  try {
    const res = await fetch(
      `${BASE}/api/v1/dashboard/financial-overview/${metric}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { headers: headers(), cache: 'no-store' }
    )
    if (!res.ok) return 0
    const data = await res.json()
    const arr = data[metric] || data[Object.keys(data)[0]] || []
    return (arr as any[]).reduce((s: number, l: any) => s + (l.total || 0), 0)
  } catch { return 0 }
}

export async function fetchLiveDayMetrics(dateStr: string) {
  const { start, end } = businessDayWindow(dateStr)
  const METRICS = [
    'gross-sales', 'net-sales', 'taxes', 'discounts',
    'voids', 'cash-payments', 'credit-card-payments', 'open-tickets'
  ]
  const values = await Promise.all(METRICS.map(m => fetchMetric(m, start, end)))
  const [grossSales, netSales, taxes, discounts, voids, cashPayments, creditCard, openTickets] = values
  return { grossSales, netSales, taxes, discounts, voids, cashPayments, creditCardPayments: creditCard, openTickets }
}

export async function fetchLiveBatchDetail(dateStr: string) {
  const token = getToken()
  if (!token) return null
  try {
    // Batch settles next calendar day — query D+1 to get D's card breakdown
    const nextDate = new Date(dateStr); nextDate.setDate(nextDate.getDate() + 1)
    const nextStr = nextDate.toISOString().split('T')[0]
    const start = nextStr + 'T05:00:00.000Z'
    const end   = new Date(nextDate); end.setDate(end.getDate() + 1)
    const endStr = end.toISOString().split('T')[0] + 'T04:59:59.999Z'

    const res = await fetch(
      `${BASE}/api/v1/dashboard/processing/batch-detail?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end.toISOString())}&merchantId=${MERCHANT_ID}`,
      { headers: headers(), cache: 'no-store' }
    )
    if (!res.ok) return null
    const data = await res.json()
    const batches = data.batches || []
    if (!batches.length) return null
    return {
      visa:       +batches.reduce((s: number, b: any) => s + (b.AmtVisa || 0), 0).toFixed(2),
      mastercard: +batches.reduce((s: number, b: any) => s + (b.AmtMasterCard || 0), 0).toFixed(2),
      amex:       +batches.reduce((s: number, b: any) => s + (b.AmtAmex || 0), 0).toFixed(2),
      discover:   +batches.reduce((s: number, b: any) => s + (b.AmtDiscover || 0), 0).toFixed(2),
      debit:      +batches.reduce((s: number, b: any) => s + (b.AmtDebit || 0), 0).toFixed(2),
      ebt:        +batches.reduce((s: number, b: any) => s + (b.AmtEBT || 0), 0).toFixed(2),
      returns:    +batches.reduce((s: number, b: any) => s + (b.AmtReturns || 0), 0).toFixed(2),
      total:      +batches.reduce((s: number, b: any) => s + (b.TotalAmt || 0), 0).toFixed(2),
    }
  } catch { return null }
}

export async function fetchLiveItems(dateStr: string) {
  const token = getToken()
  if (!token) return null
  try {
    const { start, end } = businessDayWindow(dateStr)
    const url = `${BASE}/api/v1/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(start.replace('Z', '-00:00'))}&end=${encodeURIComponent(end.replace('Z', '-00:00'))}&locations%5B%5D=${LOCATION_ID}&token=${token}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null

    // Parse XLS in memory
    const buffer = Buffer.from(await res.arrayBuffer())
    const XLSX = require('xlsx')
    const wb = XLSX.read(buffer)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

    const items = rows.slice(1)
      .filter((r: any[]) => r[0] && typeof r[0] === 'string' && !r[0].startsWith('Total'))
      .map((r: any[]) => ({ name: r[0].trim(), qty: Number(r[4]) || 0, revenue: +(Number(r[9]) || 0).toFixed(2) }))
      .filter((it: any) => it.qty > 0 && it.revenue > 0)
      .sort((a: any, b: any) => b.revenue - a.revenue)

    return items.length ? items : null
  } catch { return null }
}

export async function fetchLiveDisputes(knownDisputes: any[]) {
  const token = getToken()
  if (!token) return knownDisputes

  try {
    const now = new Date()
    const start = new Date(now); start.setDate(start.getDate() - 120); start.setHours(5, 0, 0, 0)
    const end = new Date(now); end.setDate(end.getDate() + 1); end.setHours(4, 59, 59, 999)

    const verified = await Promise.all(knownDisputes.map(async (d: any) => {
      const res = await fetch(
        `${BASE}/api/v2/internet-payments/transactions?limit=5&offset=0&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&searchTerm=${d.txnId}&sortBy=date&sortDir=DESC`,
        { method: 'POST', headers: headers(), body: JSON.stringify({ locationIds: [LOCATION_ID] }), cache: 'no-store' }
      )
      const data = await res.json()
      const txn = data.transactions?.[0]
      return txn?.eventStatus === 'NOTIFICATION_OF_DISPUTE' ? d : null
    }))
    return verified.filter(Boolean)
  } catch { return knownDisputes }
}
