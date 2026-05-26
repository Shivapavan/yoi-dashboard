import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db'
import { ensureMenuTable, nextPosition, listMenuPages } from '@/lib/menu'
import { requireAuthedUser } from '@/lib/menu-auth'

export async function GET() {
  const gate = await requireAuthedUser()
  if (gate.error) return gate.error
  const pages = await listMenuPages()
  return NextResponse.json({ pages })
}

// Upload: multipart/form-data with field `file` (or JSON { url, contentType, dataBase64 })
export async function POST(req: NextRequest) {
  const gate = await requireAuthedUser()
  if (gate.error) return gate.error

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file (Blob) required' }, { status: 400 })
  }
  const type = (file as any).type || 'image/png'
  if (!/^image\//.test(type)) {
    return NextResponse.json({ error: 'images only' }, { status: 400 })
  }
  const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1] || 'png'
  const blobPath = `menu/${randomUUID()}.${ext}`

  const blob = await put(blobPath, file, {
    access: 'public',
    contentType: type,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })

  await ensureMenuTable()
  const pos = await nextPosition()
  const sql = getDb()
  const rows = await sql`
    INSERT INTO menu_pages (blob_url, blob_path, position)
    VALUES (${blob.url}, ${blobPath}, ${pos})
    RETURNING id, blob_url, blob_path, position
  `
  return NextResponse.json({ page: rows[0] })
}
