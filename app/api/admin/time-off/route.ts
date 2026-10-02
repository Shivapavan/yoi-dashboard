import { NextResponse } from 'next/server'
import { getTimeOffRequests } from '@/lib/schedule'

export async function GET() {
  try {
    const requests = await getTimeOffRequests()
    return NextResponse.json({ requests })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
