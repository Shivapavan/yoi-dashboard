import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db'
import { ensureMenuTable } from '@/lib/menu'
import { requireAuthedUser } from '@/lib/menu-auth'

// One-time seed: pulls the 7 PNGs currently served by yoi-menu.vercel.app
// (the original static deploy) and writes them into Blob + DB.
// Safe to call repeatedly — bails if menu_pages already has rows.
export async function POST() {
  const gate = await requireAuthedUser()
  if (gate.error) return gate.error

  await ensureMenuTable()
  const sql = getDb()
  const existing = await sql`SELECT COUNT(*)::int AS c FROM menu_pages`
  if (Number(existing[0].c) > 0) {
    return NextResponse.json({ skipped: true, reason: 'already seeded', count: existing[0].c })
  }

  const SOURCE = 'https://yoi-menu.vercel.app'
  const seeded: any[] = []
  for (let i = 1; i <= 7; i++) {
    const res = await fetch(`${SOURCE}/${i}.png`)
    if (!res.ok) throw new Error(`fetch ${i}.png: ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const blobPath = `menu/${randomUUID()}.png`
    const blob = await put(blobPath, buf, {
      access: 'public',
      contentType: 'image/png',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    const rows = await sql`
      INSERT INTO menu_pages (blob_url, blob_path, position)
      VALUES (${blob.url}, ${blobPath}, ${i})
      RETURNING id, position, blob_url
    `
    seeded.push(rows[0])
  }
  return NextResponse.json({ ok: true, seeded })
}
