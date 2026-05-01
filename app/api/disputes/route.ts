import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const LIGHTHOUSE_TOKEN = process.env.LIGHTHOUSE_TOKEN || ''
const LOCATION_ID = 43141083

// Verify a transaction is still in dispute by its ID
async function verifyDispute(txnId: string): Promise<boolean> {
  if (!LIGHTHOUSE_TOKEN) return true // no token — assume still active
  try {
    const now = new Date()
    const start = new Date(now); start.setDate(start.getDate() - 120); start.setHours(5,0,0,0)
    const end = new Date(now); end.setDate(end.getDate() + 1); end.setHours(4,59,59,999)

    const res = await fetch(
      `https://lighthouse-api.harbortouch.com/api/v2/internet-payments/transactions?limit=10&offset=0&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&searchTerm=${txnId}&sortBy=date&sortDir=DESC`,
      { method: 'POST', headers: { 'x-access-token': LIGHTHOUSE_TOKEN, 'content-type': 'application/json;charset=UTF-8' }, body: JSON.stringify({ locationIds: [LOCATION_ID] }) }
    )
    const data = await res.json()
    const txn = data.transactions?.[0]
    return txn?.eventStatus === 'NOTIFICATION_OF_DISPUTE'
  } catch {
    return true // on error, keep showing dispute
  }
}

export async function GET() {
  const dataPath = join(process.cwd(), 'data/dashboard.json')
  const data = JSON.parse(readFileSync(dataPath, 'utf8'))

  // Verify each stored dispute is still active
  const verified = await Promise.all(
    data.disputes.map(async (d: any) => {
      const active = await verifyDispute(d.txnId)
      return active ? d : null
    })
  )

  const activeDisputes = verified.filter(Boolean)
  const lastScanned = data.disputesScannedAt

  return NextResponse.json({
    disputes: activeDisputes,
    count: activeDisputes.length,
    lastScanned,
  })
}
