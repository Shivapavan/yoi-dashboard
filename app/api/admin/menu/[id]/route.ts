import { NextRequest, NextResponse } from 'next/server'
import { del, put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db'
import { requireAuthedUser } from '@/lib/menu-auth'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuthedUser()
  if (gate.error) return gate.error
  const { id } = await ctx.params

  const sql = getDb()
  const rows = await sql`SELECT blob_url FROM menu_pages WHERE id = ${id}`
  if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    await del(rows[0].blob_url, { token: process.env.BLOB_READ_WRITE_TOKEN })
  } catch { /* blob may already be gone; continue */ }

  await sql`DELETE FROM menu_pages WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}

// Replace the image but keep id + position
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuthedUser()
  if (gate.error) return gate.error
  const { id } = await ctx.params

  const sql = getDb()
  const existing = await sql`SELECT blob_url FROM menu_pages WHERE id = ${id}`
  if (!existing.length) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  const type = (file as any).type || 'image/png'
  if (!/^image\//.test(type)) return NextResponse.json({ error: 'images only' }, { status: 400 })
  const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1] || 'png'
  const blobPath = `menu/${randomUUID()}.${ext}`

  const blob = await put(blobPath, file, {
    access: 'public',
    contentType: type,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })

  try {
    await del(existing[0].blob_url, { token: process.env.BLOB_READ_WRITE_TOKEN })
  } catch { /* old blob may be gone */ }

  const rows = await sql`
    UPDATE menu_pages
       SET blob_url = ${blob.url}, blob_path = ${blobPath}, updated_at = NOW()
     WHERE id = ${id}
     RETURNING id, blob_url, position
  `
  return NextResponse.json({ page: rows[0] })
}
