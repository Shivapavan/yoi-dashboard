import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fetchLiveDayMetrics, fetchLiveBatchDetail } from '@/lib/lighthouse'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })

  const data = JSON.parse(readFileSync(join(process.cwd(), 'data/dashboard.json'), 'utf8'))
  const isToday = date === data.businessDay

  // Sort history for defaults
  const sortedHistory = [...data.history].sort((a: any, b: any) => a.date.localeCompare(b.date))
  const lastWithData = sortedHistory.filter((h: any) => h.grossSales > 0).slice(-1)[0]
  const recommendedDate = lastWithData?.date || date
  const earliestDate = sortedHistory[0]?.date || date

  let metrics: any
  let processingDetail = null
  const d = date.slice(5).replace('-', '/')

  if (isToday) {
    // LIVE: fetch directly from Lighthouse API
    metrics = await fetchLiveDayMetrics(date)

    // Card processing for today: from batch-detail
    const batch = await fetchLiveBatchDetail(date)
    if (batch) {
      processingDetail = {
        windowLabel: `${d} 12:00AM – 11:59PM CDT`,
        historical: false,
        rows: [
          { label: 'Total Sales',  amount: batch.total,      bold: true },
          { label: 'Visa',         amount: batch.visa },
          { label: 'Mastercard',   amount: batch.mastercard },
          { label: 'Amex',         amount: batch.amex },
          { label: 'Discover',     amount: batch.discover },
          { label: 'Debit',        amount: batch.debit },
          { label: 'EBT',          amount: batch.ebt },
          { label: 'Returns',      amount: batch.returns },
        ],
      }
    } else if (data.processingDetail) {
      processingDetail = data.processingDetail
    }
  } else {
    // HISTORICAL: read from dashboard.json
    const day = data.history.find((h: any) => h.date === date)
    if (day) {
      metrics = {
        grossSales: day.grossSales, netSales: day.netSales, taxes: day.taxes,
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

  return NextResponse.json({
    date, metrics, processingDetail, recommendedDate,
    earliestDate, businessDay: data.businessDay, live: isToday,
  })
}
