import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })

  const data = JSON.parse(readFileSync(join(process.cwd(), 'data/dashboard.json'), 'utf8'))
  const day = data.history.find((h: any) => h.date === date)

  const metrics = day ? {
    grossSales: day.grossSales,
    netSales: day.netSales,
    taxes: day.taxes,
    voids: day.voids,
    cashPayments: day.cashPayments,
    creditCardPayments: day.creditCard,
    discounts: day.discounts,
    openTickets: day.openTickets,
    doordash: day.doordash,
    stOnline: day.stOnline,
    uberEats: day.uberEats,
  } : {
    grossSales: 0, netSales: 0, taxes: 0, voids: 0,
    cashPayments: 0, creditCardPayments: 0, discounts: 0, openTickets: 0,
    doordash: 0, stOnline: 0, uberEats: 0,
  }

  // Card processing detail — use stored breakdown if available, otherwise total only
  const isToday = date === data.businessDay
  let processingDetail = null
  const d = date.slice(5).replace('-', '/')  // YYYY-MM-DD → MM/DD

  if (isToday && data.processingDetail) {
    processingDetail = data.processingDetail
  } else if (day?.cardBreakdown) {
    // Have real per-card breakdown stored from daily fetch
    const cb = day.cardBreakdown
    processingDetail = {
      windowLabel: `${d} 12:00AM – 11:59PM CDT`,
      historical: false,
      rows: [
        { label: 'Total Sales', amount: cb.total, bold: true },
        { label: 'Visa', amount: cb.visa },
        { label: 'Mastercard', amount: cb.mastercard },
        { label: 'Amex', amount: cb.amex },
        { label: 'Discover', amount: cb.discover },
        { label: 'Debit', amount: cb.debit },
        { label: 'EBT', amount: cb.ebt },
        { label: 'Returns', amount: cb.returns },
      ]
    }
  } else if (day && day.creditCard > 0) {
    // Credit total only — per-card breakdown not yet available
    processingDetail = {
      windowLabel: `${d} 12:00AM – 11:59PM CDT`,
      historical: true,
      rows: [
        { label: 'Total Sales', amount: day.creditCard, bold: true },
        { label: 'Visa', amount: null },
        { label: 'Mastercard', amount: null },
        { label: 'Amex', amount: null },
        { label: 'Discover', amount: null },
        { label: 'Debit', amount: null },
        { label: 'EBT', amount: null },
        { label: 'Returns', amount: null },
      ]
    }
  }

  const sortedHistory = [...data.history].sort((a: any, b: any) => a.date.localeCompare(b.date))
  const lastWithData = sortedHistory.filter((h: any) => h.grossSales > 0).slice(-1)[0]
  const recommendedDate = lastWithData?.date || date
  const earliestDate = sortedHistory[0]?.date || date

  return NextResponse.json({ date, metrics, processingDetail, recommendedDate, earliestDate, businessDay: data.businessDay })
}
