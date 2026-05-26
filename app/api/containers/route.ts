import { NextResponse } from 'next/server'
import { fetchContainersList } from '@/lib/google'

export async function GET() {
  const data = await fetchContainersList()
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
