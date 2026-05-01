import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get('days') || '30')
  const data = JSON.parse(readFileSync(join(process.cwd(), 'data/dashboard.json'), 'utf8'))

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const trend = data.history
    .filter((h: any) => h.date >= cutoffStr && h.grossSales > 0)
    .map((h: any) => ({
      date: h.date,
      grossSales: h.grossSales,
      netSales: h.netSales,
      transactionCount: 0,
    }))

  return NextResponse.json({ days, trend })
}
