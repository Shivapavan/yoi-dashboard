import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fetchLiveDisputes } from '@/lib/lighthouse'

export async function GET() {
  const data = JSON.parse(readFileSync(join(process.cwd(), 'data/dashboard.json'), 'utf8'))
  const disputes = await fetchLiveDisputes(data.disputes)

  return NextResponse.json({
    disputes,
    count: disputes.length,
    lastScanned: new Date().toLocaleString('en-US', {
      month: 'numeric', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago',
    }) + ' CDT',
  })
}
