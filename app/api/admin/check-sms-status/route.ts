import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sql = getDb()
  const adminCheck = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  if (!adminCheck[0]?.is_admin)
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const messageSid = req.nextUrl.searchParams.get('sid') || 'SMbbb5c2073b995e66d269af6dce4401af'
  const sid   = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN!

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${messageSid}.json`,
    { headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') } },
  )
  const data = await res.json()
  return NextResponse.json({ status: res.status, twilio: data })
}
