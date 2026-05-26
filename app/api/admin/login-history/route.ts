import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSessionFromCookie } from '@/lib/auth'

export async function GET() {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sql = getDb()

  const adminCheck = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  if (!adminCheck[0]?.is_admin)
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const rows = await sql`
    SELECT username, email, logged_in_at, ip_address, user_agent
    FROM login_history
    ORDER BY logged_in_at DESC
    LIMIT 200
  `

  return NextResponse.json({ logins: rows })
}
