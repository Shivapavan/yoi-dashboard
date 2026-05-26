import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSessionFromCookie } from '@/lib/auth'

export async function requireAuthedUser() {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated') {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sql = getDb()
  const rows = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  return { session, isAdmin: !!rows[0]?.is_admin }
}
