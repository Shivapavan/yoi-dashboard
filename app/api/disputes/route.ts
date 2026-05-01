import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET() {
  const data = JSON.parse(readFileSync(join(process.cwd(), 'data/dashboard.json'), 'utf8'))
  return NextResponse.json({
    disputes: data.disputes,
    count: data.disputes.length,
    lastScanned: data.disputesScannedAt,
  })
}
