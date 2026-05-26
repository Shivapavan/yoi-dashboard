import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSessionFromCookie } from '@/lib/auth'

// Admin-only: reset alerted=false for low-star reviews so the next cron run will alert on them.
export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sql = getDb()
  const adminCheck = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  if (!adminCheck[0]?.is_admin)
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  // Only reset reviews with rating <= 3 (the ones that should have triggered SMS)
  const result = await sql`
    UPDATE seen_reviews
    SET alerted = false
    WHERE rating <= 3
    RETURNING id, rating, author
  `
  return NextResponse.json({ ok: true, resetCount: result.length, reviews: result })
}
