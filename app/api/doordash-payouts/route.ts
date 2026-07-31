import { NextResponse } from 'next/server'
import { fetchDoorDashPayouts, fetchDoorDashEarningsSummaries } from '@/lib/gmail'

export async function GET() {
  const connected = !!(process.env.GMAIL_ACCESS_TOKEN && process.env.GMAIL_REFRESH_TOKEN)
  if (!connected) return NextResponse.json({ connected: false, payouts: [], earningsSummaries: [] })

  try {
    const [payouts, earningsSummaries] = await Promise.all([
      fetchDoorDashPayouts(),
      fetchDoorDashEarningsSummaries(),
    ])
    return NextResponse.json({ connected: true, payouts, earningsSummaries })
  } catch (e: any) {
    return NextResponse.json({ connected: true, payouts: [], earningsSummaries: [], error: e.message })
  }
}
