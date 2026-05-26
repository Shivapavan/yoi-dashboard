import { NextResponse } from 'next/server'
import { fetchCateringData } from '@/lib/google'

export async function GET() {
  const sheets = await fetchCateringData()
  const totalRevenue = Math.round(sheets.reduce((s, sh) => s + sh.totalRevenue, 0) * 100) / 100
  return NextResponse.json({ sheets, totalRevenue })
}
