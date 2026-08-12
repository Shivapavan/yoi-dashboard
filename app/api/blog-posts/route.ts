import { NextResponse } from 'next/server'
import { listPendingPosts, listPublishedPosts } from '@/lib/blog'
import { getSessionFromCookie } from '@/lib/auth'
import { getDb } from '@/lib/db'

export async function GET() {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated')
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const sql = getDb()
  const adminRows = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  if (!adminRows[0]?.is_admin)
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })

  const [pending, published] = await Promise.all([listPendingPosts(), listPublishedPosts()])
  return NextResponse.json({ pending, published }, { headers: { 'Cache-Control': 'no-store' } })
}
