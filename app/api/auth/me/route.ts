import { NextResponse } from 'next/server'
import { getSessionFromCookie, clearSessionCookie } from '@/lib/auth'
import { getDb } from '@/lib/db'

export async function GET() {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated') {
    // Cookie is invalid or stale — clear it so the client redirects cleanly
    if (!session) await clearSessionCookie()
    return NextResponse.json({ user: null })
  }
  const sql = getDb()
  const rows = await sql`SELECT username, is_admin FROM users WHERE id = ${session.sub}`
  if (!rows.length) {
    await clearSessionCookie()
    return NextResponse.json({ user: null })
  }
  const username = String(rows[0].username || '').toLowerCase()
  const isAdmin  = !!rows[0].is_admin
  // Users granted menu-editor access in addition to admins
  const MENU_EDITORS = new Set(['ranga'])
  const canEditMenu = isAdmin || MENU_EDITORS.has(username)
  return NextResponse.json({ user: { username: rows[0].username, isAdmin, canEditMenu } })
}
