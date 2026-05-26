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
    SELECT id, rating, author, alerted, publish_time, seen_at
    FROM seen_reviews
    ORDER BY publish_time DESC NULLS LAST
  `
  return NextResponse.json({ count: rows.length, reviews: rows })
}
