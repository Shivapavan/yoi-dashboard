import { NextResponse } from 'next/server'
import { fetchOpenTickets } from '@/lib/lighthouse'

export async function GET() {
  const tickets = await fetchOpenTickets()
  return NextResponse.json({ tickets }, { headers: { 'Cache-Control': 'no-store' } })
}
