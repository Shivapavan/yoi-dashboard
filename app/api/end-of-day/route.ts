import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fetchLiveDayMetrics, fetchLiveCardBreakdown, fetchActivitySummaryData, centralTzOffset, fetchVoidDetail } from '@/lib/lighthouse'
import { getDailyData } from '@/lib/daily-data'

// Historical end-of-day data never changes after the business day closes,
// so the CDN can hold it for an hour with stale-while-revalidate.
const HISTORICAL_CACHE = 'public, s-maxage=3600, stale-while-revalidate=600'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })

  const data = JSON.parse(readFileSync(join(process.cwd(), 'data/dashboard.json'), 'utf8'))

  // Use server-computed business day (4 AM CDT boundary) instead of stale dashboard.json
  // businessDay so live data shows even when the scraper hasn't run today yet.
  const serverToday = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const isToday = date === serverToday

  // Sort history for defaults
  const sortedHistory = [...data.history].sort((a: any, b: any) => a.date.localeCompare(b.date))
  const lastWithData = sortedHistory.filter((h: any) => h.grossSales > 0).slice(-1)[0]
  // Prefer serverToday as recommended date (business day in progress) over last scraped date
  const recommendedDate = serverToday
  const earliestDate = sortedHistory[0]?.date || date

  let metrics: any
  let processingDetail = null
  const d = date.slice(5).replace('-', '/')

  let cashRefund  = 0
  let voidDetails: any[] = []
  let cashDetails: any[] = []
  let orderTypes: any[] = []

  if (isToday) {
    // LIVE: fetch from Lighthouse API
    // financial-overview works for gross/net/openTickets but returns 0 for voids/taxes/discounts
    // activity-summary works for voids/taxes/discounts/cash
    const [y0, m0, d0] = date.split('-').map(Number)
    const nextStr0 = new Date(Date.UTC(y0, m0 - 1, d0 + 1)).toISOString().split('T')[0]
    const todayStart = `${date}T04:00:00${centralTzOffset(date)}`
    const todayEnd   = `${nextStr0}T03:59:59${centralTzOffset(nextStr0)}`
    const [liveMetrics, breakdown, activityData, rawVoids] = await Promise.all([
      fetchLiveDayMetrics(date),
      fetchLiveCardBreakdown(date),
      fetchActivitySummaryData(todayStart, todayEnd),
      fetchVoidDetail(todayStart, todayEnd),
    ])
    const cashRows = breakdown?.rows.filter((r: any) => /^cash/i.test(r.label.trim())) ?? []
    const cashPayments = cashRows.length
      ? cashRows.reduce((s: number, r: any) => s + r.amount, 0)
      : liveMetrics.cashPayments
    cashRefund = cashRows.filter((r: any) => r.amount < 0).reduce((s: number, r: any) => s + Math.abs(r.amount), 0)
    const creditCardPayments = breakdown
      ? Math.max(0, breakdown.total - cashPayments)
      : liveMetrics.creditCardPayments
    const taxesLive = activityData?.taxes ?? liveMetrics.taxes
    // Lighthouse "Gross Sales by Revenue Class" is pre-tax; the customer-facing
    // "Gross Sales" most owners think of is Net + Tax (+ any surcharge above that).
    const grossLive = Math.max(liveMetrics.netSales + taxesLive, liveMetrics.grossSales || 0)
    metrics = {
      grossSales:          grossLive,
      netSales:            liveMetrics.netSales,
      taxes:               taxesLive,
      voids:               activityData?.voids      ?? liveMetrics.voids,
      discounts:           activityData?.discounts  ?? liveMetrics.discounts,
      cashPayments,
      creditCardPayments,
      openTickets:         liveMetrics.openTickets,
    }
    // Card breakdown from live data
    if (breakdown) {
      const d2 = date.slice(5).replace('-', '/')
      processingDetail = {
        windowLabel: `${d2} 12:00AM – 11:59PM CDT`,
        historical: false,
        rows: [
          { label: 'Total Sales', amount: breakdown.total, bold: true },
          ...breakdown.rows.map((r: any) => ({ label: r.label, amount: r.amount })),
        ],
      }
    }
    voidDetails = [...rawVoids]
    // Add unattributed row if voids-by-employee total < Net Void Summary total
    const totalVoidsFromSummary = activityData?.voids ?? 0
    const attributedVoids = Math.round(rawVoids.reduce((s: number, v: any) => s + v.amount, 0) * 100) / 100
    const voidGap = Math.round((totalVoidsFromSummary - attributedVoids) * 100) / 100
    if (voidGap > 0.01) {
      voidDetails.push({ employee: 'Unattributed', approvedBy: '', voidedAt: '', ticket: '', item: '(manager/owner account)', reason: '', amount: voidGap })
    }
    cashDetails = activityData?.cashDetails ?? []
    orderTypes = activityData?.orderTypes ?? []
  } else {
    // HISTORICAL: prefer Postgres daily_data table (populated by daily-checks cron),
    // then fall back to dashboard.json, then to a live Lighthouse fetch.
    const stored = await getDailyData(date).catch(() => null)
    if (stored && stored.grossSales > 0) {
      return NextResponse.json({
        date,
        metrics: {
          grossSales: stored.grossSales,
          netSales: stored.netSales,
          taxes: stored.taxes,
          voids: stored.voids,
          discounts: stored.discounts,
          cashPayments: stored.cashPayments,
          creditCardPayments: stored.creditCardPayments,
          openTickets: stored.openTickets,
        },
        processingDetail: stored.processingDetail ?? null,
        recommendedDate, earliestDate,
        businessDay: data.businessDay,
        live: false,
        cashRefund: stored.cashRefund ?? 0,
        voidDetails: stored.voidDetails ?? [],
        cashDetails: stored.cashDetails ?? [],
        orderTypes: stored.orderTypes ?? [],
      }, { headers: { 'Cache-Control': HISTORICAL_CACHE } })
    }

    const day = data.history.find((h: any) => h.date === date)

    // If not in history but within last 7 days, fetch live from Lighthouse API.
    // financial-overview GET only works for today; activity-summary POST works for any date.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    if ((!day || day.grossSales === 0) && date >= sevenDaysAgo) {
      const [y2, m2, d2] = date.split('-').map(Number)
      const nextDateStr = new Date(Date.UTC(y2, m2 - 1, d2 + 1)).toISOString().split('T')[0]
      const startStr = `${date}T04:00:00${centralTzOffset(date)}`
      const endStr   = `${nextDateStr}T03:59:59${centralTzOffset(nextDateStr)}`
      const [activityData, breakdown, rawVoids2] = await Promise.all([
        fetchActivitySummaryData(startStr, endStr),
        fetchLiveCardBreakdown(date),
        fetchVoidDetail(startStr, endStr),
      ])
      if (activityData && activityData.grossSales > 0) {
        // Cash Payments = sum of Cash + Cash Rounding rows from Payment Summary (same source as card detail)
        const cashRows = breakdown?.rows.filter((r: any) => /^cash/i.test(r.label.trim())) ?? []
        const cashPayments = cashRows.length
          ? cashRows.reduce((s: number, r: any) => s + r.amount, 0)
          : activityData.cashPayments ?? 0
        cashRefund = cashRows.filter((r: any) => r.amount < 0).reduce((s: number, r: any) => s + Math.abs(r.amount), 0)
        const creditCardPayments = breakdown ? Math.max(0, breakdown.total - cashPayments) : 0
        const taxesAct = activityData.taxes ?? 0
        const grossAct = Math.max(activityData.netSales + taxesAct, activityData.grossSales || 0)
        metrics = {
          grossSales: grossAct,
          netSales:   activityData.netSales,
          taxes:      taxesAct,
          discounts:  activityData.discounts ?? 0,
          voids:      activityData.voids     ?? 0,
          cashPayments,
          creditCardPayments,
          openTickets: 0,
        }
        if (breakdown) {
          processingDetail = {
            windowLabel: `${d} 12:00AM – 11:59PM CDT`,
            historical: false,
            rows: [
              { label: 'Total Sales', amount: breakdown.total, bold: true },
              ...breakdown.rows.map((r: any) => ({ label: r.label, amount: r.amount })),
            ],
          }
        }
        voidDetails = [...rawVoids2]
        const gap2 = Math.round(((activityData.voids ?? 0) - Math.round(rawVoids2.reduce((s: number, v: any) => s + v.amount, 0) * 100) / 100) * 100) / 100
        if (gap2 > 0.01) voidDetails.push({ employee: 'Unattributed', approvedBy: '', voidedAt: '', ticket: '', item: '(manager/owner account)', reason: '', amount: gap2 })
        cashDetails = activityData.cashDetails ?? []
        orderTypes = activityData.orderTypes ?? []
        return NextResponse.json({
          date, metrics, processingDetail: null, recommendedDate,
          earliestDate, businessDay: data.businessDay, live: true, cashRefund, voidDetails, cashDetails, orderTypes,
        })
      }
    }

    if (day) {
      const grossDay = Math.max((day.netSales || 0) + (day.taxes || 0), day.grossSales || 0)
      metrics = {
        grossSales: grossDay, netSales: day.netSales, taxes: day.taxes,
        voids: day.voids, cashPayments: day.cashPayments,
        creditCardPayments: day.creditCard, discounts: day.discounts,
        openTickets: day.openTickets,
      }

      if (day.cardBreakdown) {
        const cb = day.cardBreakdown
        processingDetail = {
          windowLabel: `${d} 12:00AM – 11:59PM CDT`,
          historical: false,
          rows: [
            { label: 'Total Sales',  amount: cb.total,       bold: true },
            { label: 'Visa',         amount: cb.visa },
            { label: 'Mastercard',   amount: cb.mastercard },
            { label: 'Amex',         amount: cb.amex },
            { label: 'Discover',     amount: cb.discover },
            { label: 'Debit',        amount: cb.debit },
            { label: 'EBT',          amount: cb.ebt },
            { label: 'Returns',      amount: cb.returns },
          ],
        }
      } else if (day.creditCard > 0) {
        processingDetail = {
          windowLabel: `${d} 12:00AM – 11:59PM CDT`,
          historical: true,
          rows: [
            { label: 'Total Sales',  amount: day.creditCard, bold: true },
            { label: 'Visa',         amount: null },
            { label: 'Mastercard',   amount: null },
            { label: 'Amex',         amount: null },
            { label: 'Discover',     amount: null },
            { label: 'Debit',        amount: null },
            { label: 'EBT',          amount: null },
            { label: 'Returns',      amount: null },
          ],
        }
      }
    } else {
      metrics = { grossSales: 0, netSales: 0, taxes: 0, voids: 0, cashPayments: 0, creditCardPayments: 0, discounts: 0, openTickets: 0 }
    }
  }

  // For any path that hasn't fetched void/cash detail yet (historical dashboard.json dates),
  // always fetch them so data is accurate for every date.
  if (voidDetails.length === 0 && cashDetails.length === 0 && metrics?.grossSales > 0) {
    const [y3, m3, d3] = date.split('-').map(Number)
    const nextStr3 = new Date(Date.UTC(y3, m3 - 1, d3 + 1)).toISOString().split('T')[0]
    const s3 = `${date}T04:00:00${centralTzOffset(date)}`
    const e3 = `${nextStr3}T03:59:59${centralTzOffset(nextStr3)}`
    const [rawVoids3, activity3] = await Promise.all([
      fetchVoidDetail(s3, e3),
      fetchActivitySummaryData(s3, e3),
    ])
    voidDetails = [...rawVoids3]
    const gap3 = Math.round(((activity3?.voids ?? 0) - Math.round(rawVoids3.reduce((s: number, v: any) => s + v.amount, 0) * 100) / 100) * 100) / 100
    if (gap3 > 0.01) voidDetails.push({ employee: 'Unattributed', approvedBy: '', voidedAt: '', ticket: '', item: '(manager/owner account)', reason: '', amount: gap3 })
    cashDetails = activity3?.cashDetails ?? []
    orderTypes = activity3?.orderTypes ?? []
  }

  // 14-day rolling averages (excluding the date being viewed and any zero-data days)
  const cutoff = new Date(date + 'T00:00:00Z')
  cutoff.setUTCDate(cutoff.getUTCDate() - 14)
  const recent = sortedHistory.filter((h: any) =>
    h.date < date && h.date >= cutoff.toISOString().slice(0, 10) && h.grossSales > 0
  )
  const averages = recent.length > 0 ? {
    grossSales:         recent.reduce((s: number, h: any) => s + Math.max((h.netSales || 0) + (h.taxes || 0), h.grossSales || 0), 0) / recent.length,
    netSales:           recent.reduce((s: number, h: any) => s + (h.netSales           || 0), 0) / recent.length,
    taxes:              recent.reduce((s: number, h: any) => s + (h.taxes              || 0), 0) / recent.length,
    voids:              recent.reduce((s: number, h: any) => s + (h.voids              || 0), 0) / recent.length,
    cashPayments:       recent.reduce((s: number, h: any) => s + (h.cashPayments       || 0), 0) / recent.length,
    creditCardPayments: recent.reduce((s: number, h: any) => s + (h.creditCard         || 0), 0) / recent.length,
    discounts:          recent.reduce((s: number, h: any) => s + (h.discounts          || 0), 0) / recent.length,
    openTickets:        recent.reduce((s: number, h: any) => s + (h.openTickets        || 0), 0) / recent.length,
    sampleDays:         recent.length,
  } : null

  // Today stays uncached so 5-min auto-refresh actually fetches live data.
  const cacheControl = isToday ? 'no-store' : HISTORICAL_CACHE

  return NextResponse.json(
    {
      date, metrics, processingDetail, recommendedDate,
      earliestDate, businessDay: data.businessDay, live: isToday, cashRefund, voidDetails, cashDetails, orderTypes,
      averages,
    },
    { headers: { 'Cache-Control': cacheControl } },
  )
}
