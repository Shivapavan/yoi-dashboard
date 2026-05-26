import { NextResponse } from 'next/server'
import { fetchDoorDashPayouts } from '@/lib/gmail'

export async function GET() {
  const connected = !!(process.env.GMAIL_ACCESS_TOKEN && process.env.GMAIL_REFRESH_TOKEN)
  if (!connected) return NextResponse.json({ connected: false, payouts: [] })

  try {
    const payouts = await fetchDoorDashPayouts()
    return NextResponse.json({ connected: true, payouts })
  } catch (e: any) {
    return NextResponse.json({ connected: true, payouts: [], error: e.message })
  }
}
