import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendVerifyOtp, getSessionFromCookie } from '@/lib/auth'

export async function POST() {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'pre_mfa')
    return NextResponse.json({ error: 'No active session.' }, { status: 401 })

  const sql = getDb()
  const rows = await sql`SELECT phone FROM users WHERE id = ${session.sub}`
  if (!rows.length) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

  await sendVerifyOtp(rows[0].phone)
  return NextResponse.json({ ok: true })
}
