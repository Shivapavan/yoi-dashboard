const BASE = 'https://lighthouse-api.harbortouch.com'

// Read token from Edge Config first (updated instantly via ribbon), fall back to env var.
async function resolveToken(): Promise<string> {
  try {
    const { get } = await import('@vercel/edge-config')
    const t = await get<string>('LIGHTHOUSE_TOKEN')
    if (t) return t
  } catch { /* edge config unavailable */ }
  return process.env.LIGHTHOUSE_TOKEN || ''
}

function getLocationId(): number { return Number(process.env.LIGHTHOUSE_LOCATION_ID) || 0 }
function getMerchantId(): string { return process.env.LIGHTHOUSE_MERCHANT_ID   || '' }

function makeHeaders(token: string) {
  return {
    'x-access-token': token,
    'accept': 'application/json',
    'content-type': 'application/json;charset=UTF-8',
  }
}

// Returns '-05:00' (CDT) or '-06:00' (CST) for America/Chicago on a given date.
// DST: 2nd Sunday of March → 1st Sunday of November.
export function centralTzOffset(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)

  const dstStart = new Date(y, 2, 1) // March 1
  while (dstStart.getDay() !== 0) dstStart.setDate(dstStart.getDate() + 1)
  dstStart.setDate(dstStart.getDate() + 7) // 2nd Sunday of March

  const dstEnd = new Date(y, 10, 1) // November 1
  while (dstEnd.getDay() !== 0) dstEnd.setDate(dstEnd.getDate() + 1) // 1st Sunday of November

  return date >= dstStart && date < dstEnd ? '-05:00' : '-06:00'
}

// Fetch totals + revenue class breakdowns from activity-summary.
// start/end must be ISO strings with tz offset, e.g. "2026-04-01T04:00:00-05:00".
export async function fetchActivitySummaryData(start: string, end: string) {
  const token = await resolveToken()
  if (!token) return null
  try {
    const res = await fetch(
      `${BASE}/api/v1/reports/echo-pro/activity-summary`,
      {
        method: 'POST',
        headers: makeHeaders(token),
        body: JSON.stringify({
          start,
          end,
          locations: [getLocationId()],
          intradayPeriodGroupGuids: [],
          locale: 'en-US',
          revenueCenterGuids: [],
        }),
        cache: 'no-store',
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const bucket = data.buckets?.find((b: any) => b.guid === null)
    if (!bucket) return null

    type RevenueRow = { label: string; count: number | null; amount: number }

    const parseRevenueRows = (reportName: string): RevenueRow[] => {
      const report = bucket.reports?.find((r: any) => r.name === reportName)
      if (!report) return []
      return (report.rows as any[][]).map((r) => ({
        label:  String(r[0] ?? ''),
        count:  r.length === 3 ? (parseInt(r[1]) || 0) : null,
        amount: parseFloat((String(r[r.length - 1] ?? '0')).replace(/[$,]/g, '')),
      }))
    }

    const grossRows = parseRevenueRows('Gross Sales by Revenue Class')
    const netRows   = parseRevenueRows('Net Sales by Revenue Class')
    const totalRow  = (rows: RevenueRow[]) => rows.find((r) => r.label.startsWith('Total'))

    // Order type breakdown (Dine In / In-Person / Pickup etc.)
    // Row format: [type, count, "$amount"] — 3 columns
    const orderTypeReport = bucket.reports?.find((r: any) => r.name === 'Gross Sales by Order Type')
    const orderTypes = (orderTypeReport?.rows || [])
      .filter((r: any) => r[0] && !String(r[0]).startsWith('Total'))
      .map((r: any) => ({
        type:   String(r[0]).trim(),
        count:  r.length >= 3 ? (parseInt(String(r[1])) || 0) : 0,
        amount: parseFloat(String(r[r.length - 1]).replace(/[$,]/g, '')) || 0,
      }))
      .filter((r: any) => r.amount > 0)

    // Extract a single total from a named summary report (last-column value of the Total row or last row)
    const extractSummaryTotal = (reportName: string): number => {
      const report = bucket.reports?.find((r: any) => r.name === reportName)
      if (!report?.rows?.length) return 0
      const rows = report.rows as any[][]
      const row = rows.find((r) => String(r[0] ?? '').startsWith('Total')) ?? rows[rows.length - 1]
      return parseFloat(String(row[row.length - 1] ?? '0').replace(/[$,]/g, '')) || 0
    }

    // voidDetails populated separately via fetchVoidDetail
    const voidDetails: { employee: string; reason: string; count: number; amount: number }[] = []

    // Cash reconciliation rows
    const cashReport = bucket.reports?.find((r: any) => r.name === 'Cash Summary')
    const cashDetails: { label: string; amount: number }[] = (cashReport?.rows || [])
      .filter((r: any) => r[0]?.trim())
      .map((r: any) => ({
        label:  String(r[0]).trim(),
        amount: parseFloat(String(r[r.length - 1]).replace(/[$,]/g, '')) || 0,
      }))

    return {
      grossSales:     totalRow(grossRows)?.amount ?? 0,
      netSales:       totalRow(netRows)?.amount   ?? 0,
      grossByRevenue: grossRows,
      netByRevenue:   netRows,
      orderTypes,
      taxes:          extractSummaryTotal('Tax Summary'),
      discounts:      extractSummaryTotal('Sales Discount Summary'),
      voids:          extractSummaryTotal('Net Void Summary'),
      cashPayments:   extractSummaryTotal('Cash Summary'),
      voidDetails,
      cashDetails,
    }
  } catch { return null }
}

export function businessDayWindow(dateStr: string) {
  // Use centralTzOffset so CDT (UTC-5) and CST (UTC-6) are both handled correctly
  const utcHours = centralTzOffset(dateStr) === '-05:00' ? 5 : 6
  const [y, m, d] = dateStr.split('-').map(Number)
  const nextDay = dateStr.slice(0, 8) + String(d + 1).padStart(2, '0')
  const start = new Date(Date.UTC(y, m - 1, d,     utcHours + 4,     0,  0,   0))
  const end   = new Date(Date.UTC(y, m - 1, d + 1, utcHours + 3, 59, 59, 999))
  void nextDay // computed for reference only
  return { start: start.toISOString(), end: end.toISOString() }
}

export type OnlineOrder = {
  guid: string
  orderNumber: number
  platform: 'doordash' | 'ubereats' | 'grubhub' | 'other'
  paymentTypeName: string
  customerName: string | null
  employeeName: string
  completedAt: string | null
  createdAt: string
  businessDay: string | null   // YYYY-MM-DD in Chicago time
  subtotal: number
  taxTotal: number
  discountTotal: number
  surchargeTotal: number
  grandTotal: number
}

export async function fetchOnlineOrders(dateStr: string): Promise<OnlineOrder[]> {
  const token = await resolveToken()
  if (!token) return []
  try {
    // No server-side date filter works; fetch latest 100 online orders sorted desc and filter client-side by businessDay
    const url = `${BASE}/api/v1/echo-pro/tickets?location=${getLocationId()}&isOnlineOrder=true&order=${encodeURIComponent('completedAt desc')}&limit=100`
    const res = await fetch(url, { headers: makeHeaders(token), cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    const tickets: any[] = data.tickets ?? []

    return tickets
      .filter((t: any) => {
        const bd: string = t.businessDay?.slice(0, 10) ?? ''
        if (bd !== dateStr || t.voided) return false
        // Only include known delivery platform payments
        const pmt = (t.paymentTypeName ?? '').toLowerCase()
        return pmt.includes('doordash') || pmt.includes('door dash') || pmt.includes('uber') || pmt.includes('grubhub')
      })
      .map((t: any): OnlineOrder => {
        const pmt = (t.paymentTypeName ?? '').toLowerCase()
        const platform: OnlineOrder['platform'] =
          pmt.includes('doordash') || pmt.includes('door dash') ? 'doordash'
          : pmt.includes('uber') ? 'ubereats'
          : pmt.includes('grubhub') ? 'grubhub'
          : 'other'
        // Strip "PickUp-" prefix that DoorDash prepends to customer name
        const rawName: string = t.customTableName ?? ''
        const customerName = rawName.replace(/^pickup-/i, '').trim() || null
        return {
          guid:            t.guid,
          orderNumber:     t.orderNumber,
          platform,
          paymentTypeName: t.paymentTypeName ?? '',
          customerName,
          employeeName:    t.employeeOwnerName || t.employeeCloseName || '',
          completedAt:     t.completedAt ?? null,
          createdAt:       t.createdAt,
          businessDay:     t.businessDay ? t.businessDay.slice(0, 10) : null,
          subtotal:        parseFloat(t.subtotal)       || 0,
          taxTotal:        parseFloat(t.taxTotal)       || 0,
          discountTotal:   parseFloat(t.discountTotal)  || 0,
          surchargeTotal:  parseFloat(t.surchargeTotal) || 0,
          grandTotal:      parseFloat(t.grandTotal)     || 0,
        }
      })
      .sort((a, b) => {
        const ta = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.createdAt).getTime()
        const tb = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.createdAt).getTime()
        return tb - ta
      })
  } catch { return [] }
}

export async function fetchMetric(metric: string, start: string, end: string): Promise<number> {
  const token = await resolveToken()
  if (!token) return 0
  try {
    const res = await fetch(
      `${BASE}/api/v1/dashboard/financial-overview/${metric}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { headers: makeHeaders(token), cache: 'no-store' }
    )
    if (!res.ok) return 0
    const data = await res.json()
    const arr = data[metric] || data[Object.keys(data)[0]] || []
    return (arr as any[]).reduce((s: number, l: any) => s + (l.total || 0), 0)
  } catch { return 0 }
}

export async function fetchVoidDetail(start: string, end: string): Promise<{ employee: string; approvedBy: string; voidedAt: string; ticket: string; item: string; reason: string; amount: number }[]> {
  const token = await resolveToken()
  if (!token) return []
  try {
    const res = await fetch(`${BASE}/api/v1/reports/echo-pro/voids-by-employee`, {
      method: 'POST',
      headers: makeHeaders(token),
      body: JSON.stringify({ start, end, locations: [getLocationId()], intradayPeriodGroupGuids: [], locale: 'en-US', revenueCenterGuids: [] }),
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    // Structure: group header rows (col[0]=employee, col[5]=subtotal)
    //            detail rows (col[0]='', col[1]=approvedBy, col[2]=time, col[3]=ticket, col[4]=item, col[5]=amount, col[6]=reason)
    const rows: string[][] = data.rows || []
    const result: ReturnType<typeof fetchVoidDetail> extends Promise<infer T> ? T : never[] = []
    let currentEmployee = ''
    for (const r of rows) {
      const col0 = (r[0] || '').trim()
      if (col0 && !/^total/i.test(col0)) {
        currentEmployee = col0  // group header — update employee
        continue
      }
      const time = (r[2] || '').trim()
      if (!currentEmployee || !time) continue  // skip empty/total rows
      result.push({
        employee:   currentEmployee,
        approvedBy: (r[1] || '').trim(),
        voidedAt:   time,
        ticket:     (r[3] || '').trim(),
        item:       (r[4] || '').trim(),
        amount:     parseFloat((r[5] || '0').replace(/[$,]/g, '')) || 0,
        reason:     (r[6] || '').trim(),
      })
    }
    return result
  } catch { return [] }
}

export interface OpenTicket {
  guid: string
  orderNumber: number
  orderName: string
  orderTypeName: string
  customerName: string | null
  employeeName: string
  createdAt: string
  lastOpenedAt: string | null
  subtotal: number
  taxTotal: number
  grandTotal: number
}

export async function fetchOpenTickets(): Promise<OpenTicket[]> {
  const token = await resolveToken()
  if (!token) return []
  try {
    // "Open ticket" in Shift4 terminology = unpaid (complete=false), regardless of whether
    // it's actively being edited (open=true) or saved/idle (open=false).
    // Server-side filter complete=false would be ideal but is unreliable, so we filter client-side.
    // Sort newest first so today's real tickets surface above any old ghost tickets.
    const url = `${BASE}/api/v1/echo-pro/tickets?location=${getLocationId()}&order=${encodeURIComponent('createdAt desc')}&limit=200`
    const res = await fetch(url, { headers: makeHeaders(token), cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    const tickets: any[] = data.tickets ?? []

    // Hide ghost tickets older than 7 days — they're forgotten data, not real open orders
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

    return tickets
      .filter(t => !t.complete && !t.voided && new Date(t.createdAt).getTime() >= sevenDaysAgo)
      .map((t: any): OpenTicket => {
        const rawName: string = t.customTableName ?? ''
        const customerName = rawName.replace(/^pickup-/i, '').trim() || null
        return {
          guid:           t.guid,
          orderNumber:    t.orderNumber,
          orderName:      t.orderName ?? `Order #${t.orderNumber}`,
          orderTypeName:  t.orderTypeName ?? '',
          customerName,
          employeeName:   t.employeeOwnerName || t.employeeCloseName || t.employeeCreateName || '',
          createdAt:      t.createdAt,
          lastOpenedAt:   t.lastOpenedAt ?? null,
          subtotal:       parseFloat(t.subtotal)   || 0,
          taxTotal:       parseFloat(t.taxTotal)   || 0,
          grandTotal:     parseFloat(t.grandTotal) || 0,
        }
      })
  } catch { return [] }
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

export async function fetchLiveCardBreakdown(dateStr: string) {
  const token = await resolveToken()
  if (!token) return null

  const [y, m, d] = dateStr.split('-').map(Number)
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1))
  const nextStr = nextDate.toISOString().split('T')[0]

  try {
    const res = await fetch(
      `${BASE}/api/v1/reports/echo-pro/activity-summary`,
      {
        method: 'POST',
        headers: makeHeaders(token),
        body: JSON.stringify({
          start: `${dateStr}T04:00:00${centralTzOffset(dateStr)}`,
          end:   `${nextStr}T03:59:59${centralTzOffset(nextStr)}`,
          locations: [getLocationId()],
          intradayPeriodGroupGuids: [],
          locale: 'en-US',
          revenueCenterGuids: [],
        }),
        cache: 'no-store',
      }
    )
    if (!res.ok) return null
    const data = await res.json()

    const totalsBucket = data.buckets?.find((b: any) => b.guid === null)
    if (!totalsBucket) return null

    const paymentReport = totalsBucket.reports?.find((r: any) => r.name === 'Payment Summary')
    if (!paymentReport) return null

    const rows: Array<{ label: string; amount: number }> = []
    let total = 0

    for (const row of paymentReport.rows as string[][]) {
      const label = row[0]
      const amount = parseFloat((row[2] || '0').replace(/[$,]/g, ''))
      if (label === 'Totals Payments:') {
        total = amount
      } else if (label?.trim()) {
        rows.push({ label, amount })
      }
    }

    if (!total && rows.length === 0) return null
    return { total, rows }
  } catch { return null }
}

export async function fetchLiveBatchDetail(dateStr: string) {
  const token = await resolveToken()
  if (!token) return null
  try {
    const nextDate = new Date(dateStr + 'T12:00:00'); nextDate.setDate(nextDate.getDate() + 1)
    const nextStr = nextDate.toISOString().split('T')[0]
    const start = nextStr + 'T05:00:00.000Z'
    const end   = new Date(nextDate); end.setDate(end.getDate() + 1)

    const res = await fetch(
      `${BASE}/api/v1/dashboard/processing/batch-detail?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end.toISOString())}&merchantId=${getMerchantId()}`,
      { headers: makeHeaders(token), cache: 'no-store' }
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

// Fetch items sold for an arbitrary date range. Uses the same XLS report as
// fetchLiveItems but with custom start/end.
export async function fetchItemsForRange(startDate: string, endDate: string): Promise<{name: string; qty: number; revenue: number}[] | null> {
  const token = await resolveToken()
  if (!token) return null
  try {
    const startISO = `${startDate}T04:00:00${centralTzOffset(startDate)}`
    // End = 3:59:59 AM the day AFTER endDate (business day boundary)
    const [y, m, d] = endDate.split('-').map(Number)
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0]
    const endISO = `${nextDay}T03:59:59${centralTzOffset(nextDay)}`

    const url = `${BASE}/api/v1/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(startISO.replace('Z', '-00:00'))}&end=${encodeURIComponent(endISO.replace('Z', '-00:00'))}&locations%5B%5D=${getLocationId()}&token=${token}`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    const XLSX = require('xlsx')
    const wb = XLSX.read(buffer)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

    return rows.slice(1)
      .filter((r: any[]) => r[0] && typeof r[0] === 'string' && !r[0].startsWith('Total'))
      .map((r: any[]) => ({ name: r[0].trim(), qty: Number(r[4]) || 0, revenue: +(Number(r[9]) || 0).toFixed(2) }))
      .filter((it) => it.qty > 0)
  } catch { return null }
}

export async function fetchLiveItems(dateStr: string, orderType?: string) {
  const token = await resolveToken()
  if (!token) return null
  try {
    const { start, end } = businessDayWindow(dateStr)
    // This XLS endpoint requires the token as a query param (download URL, no header support)
    let url = `${BASE}/api/v1/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(start.replace('Z', '-00:00'))}&end=${encodeURIComponent(end.replace('Z', '-00:00'))}&locations%5B%5D=${getLocationId()}&token=${token}`
    if (orderType) url += `&orderTypes%5B%5D=${encodeURIComponent(orderType)}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null

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

export interface EmployeeShift {
  employee: string
  start: Date
  end: Date
  hoursWorked: number
  cashPayments: number
  creditPayments: number
}

// start/end: ISO strings with CDT offset e.g. "2026-05-01T04:00:00-05:00"
export async function fetchEmployeeShifts(start: string, end: string): Promise<EmployeeShift[]> {
  const token = await resolveToken()
  if (!token) return []
  try {
    // v2 timeclock API expects UTC ISO strings (e.g. "2026-05-02T09:00:00.000Z")
    // Convert whatever format was passed (offset strings work too via Date constructor)
    const startUTC = new Date(start).toISOString()
    const endUTC   = new Date(end).toISOString()

    // v2 timeclock API — paginated, catches shifts that started OR ended in the window
    const filter = JSON.stringify({
      locationId: { $eq: String(getLocationId()) },
      voided:     { $eq: false },
      isTracked:  { $eq: true },
      $or: [
        { $and: [{ clockedInAt:  { $gte: startUTC } }, { clockedInAt:  { $lte: endUTC } }] },
        { $and: [{ clockedOutAt: { $gte: startUTC } }, { clockedOutAt: { $lte: endUTC } }] },
      ],
    })

    // Fetch all pages (portal uses limit=10; we use 200 to cover all shifts in one request)
    const url = `${BASE}/api/v2/echo-pro/time-clock-shifts?filter=${encodeURIComponent(filter)}&limit=200&offset=0&order=${encodeURIComponent('clockedInAt asc')}`
    const res = await fetch(url, { headers: makeHeaders(token), cache: 'no-store' })
    if (!res.ok) return []

    const data = await res.json()
    const rows: any[] = Array.isArray(data) ? data : (data.timeClockShifts ?? data.data ?? data.rows ?? data.shifts ?? [])

    const shifts: EmployeeShift[] = []
    for (const row of rows) {
      const employee = row.employee?.name ?? row.employeeName ?? row.name ?? 'Unknown'
      const shiftStart = new Date(row.clockedInAt)
      const shiftEnd   = row.clockedOutAt ? new Date(row.clockedOutAt) : new Date()
      if (isNaN(shiftStart.getTime())) continue

      const hoursWorked = Math.max(0, (shiftEnd.getTime() - shiftStart.getTime()) / 3600000)
      shifts.push({
        employee,
        start:          shiftStart,
        end:            shiftEnd,
        hoursWorked:    Math.round(hoursWorked * 100) / 100,
        cashPayments:   0,
        creditPayments: 0,
      })
    }
    return shifts
  } catch { return [] }
}

export async function fetchLiveDisputes(knownDisputes: any[]) {
  const token = await resolveToken()
  if (!token) return knownDisputes

  try {
    const now = new Date()
    const start = new Date(now); start.setDate(start.getDate() - 120); start.setHours(5, 0, 0, 0)
    const end = new Date(now); end.setDate(end.getDate() + 1); end.setHours(4, 59, 59, 999)

    // Use Jan 1 of current year as the portal start date to match the
    // URL format the user sees in Lighthouse.
    const endStr   = now.toISOString().split('T')[0]
    const startStr = `${now.getFullYear()}-01-01`

    // URL for Lighthouse portal — detail page if we have a TRAN id, list page otherwise
    const lhUrl = (tranId?: string) =>
      tranId
        ? `https://lh.shift4.com/transactions/master-transactions/${tranId}?end=${endStr}&eventStatus=%5B%22NOTIFICATION_OF_DISPUTE%22%5D&start=${startStr}`
        : `https://lh.shift4.com/transactions/master-transactions?end=${endStr}&eventStatus=%5B%22NOTIFICATION_OF_DISPUTE%22%5D&start=${startStr}`

    const verified = await Promise.all(knownDisputes.map(async (d: any) => {
      try {
        const res = await fetch(
          `${BASE}/api/v2/internet-payments/transactions?limit=5&offset=0&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&searchTerm=${d.txnId}&sortBy=date&sortDir=DESC`,
          { method: 'POST', headers: makeHeaders(token), body: JSON.stringify({ locationIds: [getLocationId()] }), cache: 'no-store' }
        )
        if (!res.ok) return { ...d, link: lhUrl() }
        const data = await res.json()
        const txns = data.transactions || []
        if (txns.length === 0) return { ...d, link: lhUrl() }
        const txn = txns[0]
        if (txn?.eventStatus !== 'NOTIFICATION_OF_DISPUTE') return null
        // Search every string field for a TRAN-prefixed Lighthouse ID —
        // the field name varies across API versions.
        const tranId = Object.values(txn)
          .find((v): v is string => typeof v === 'string' && v.startsWith('TRAN'))
        return { ...d, link: lhUrl(tranId) }
      } catch { return { ...d, link: lhUrl() } }
    }))
    return verified.filter(Boolean)
  } catch { return knownDisputes }
}
