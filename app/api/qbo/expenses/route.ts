import { NextRequest, NextResponse } from 'next/server'
import { fetchProfitAndLoss, parsePnL, fetchVendorBills, fetchExpenseTransactions } from '@/lib/qbo'

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month param required (YYYY-MM)' }, { status: 400 })
  }

  const [y, m] = month.split('-').map(Number)
  const startDate = `${month}-01`
  const lastDay   = new Date(y, m, 0).getDate()
  const endDate   = `${month}-${String(lastDay).padStart(2, '0')}`

  const [data, bills, transactions] = await Promise.all([
    fetchProfitAndLoss(startDate, endDate),
    fetchVendorBills(startDate, endDate),
    fetchExpenseTransactions(startDate, endDate),
  ])

  if (!data) return NextResponse.json({ error: 'not_connected' }, { status: 401 })

  const sections = parsePnL(data)
  return NextResponse.json({ month, startDate, endDate, sections, bills, transactions })
}
