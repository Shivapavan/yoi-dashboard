import { NextRequest, NextResponse } from 'next/server'
import { approvePost, deletePost } from '@/lib/blog'
import { getSessionFromCookie } from '@/lib/auth'
import { getDb } from '@/lib/db'

async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated')
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const sql = getDb()
  const adminRows = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  if (!adminRows[0]?.is_admin)
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })

  return null
}

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  const { id } = await params
  await approvePost(id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  const { id } = await params
  await deletePost(id)
  return NextResponse.json({ ok: true })
}
