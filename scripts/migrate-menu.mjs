// One-time: create menu_pages table and seed from /public/menu/*.png to Vercel Blob.
// Run: node --env-file=.env.local scripts/migrate-menu.mjs
import { neon } from '@neondatabase/serverless'
import { put, list } from '@vercel/blob'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const sql = neon(process.env.DATABASE_URL)

await sql`
  CREATE TABLE IF NOT EXISTS menu_pages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blob_url   TEXT NOT NULL,
    blob_path  TEXT NOT NULL,
    position   INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`
await sql`CREATE INDEX IF NOT EXISTS menu_pages_position_idx ON menu_pages(position)`
console.log('table ready')

const existing = await sql`SELECT COUNT(*)::int AS c FROM menu_pages`
if (existing[0].c > 0) {
  console.log(`menu_pages already has ${existing[0].c} rows — skipping seed.`)
  process.exit(0)
}

// Order matches what yoi-menu.vercel.app currently serves:
// 1=IMG_4175, 2=1.png, 3=2.png, 4=3.png, 5=4.png, 6=7.png, 7=8.png
const files = [
  'public/menu/7.png', // was IMG_4175
  'public/menu/1.png',
  'public/menu/2.png',
  'public/menu/3.png',
  'public/menu/4.png',
  'public/menu/5.png',
  'public/menu/6.png',
]

for (let i = 0; i < files.length; i++) {
  const path = files[i]
  const body = await readFile(path)
  const blobPath = `menu/${randomUUID()}.png`
  const blob = await put(blobPath, body, {
    access: 'public',
    contentType: 'image/png',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  await sql`
    INSERT INTO menu_pages (blob_url, blob_path, position)
    VALUES (${blob.url}, ${blobPath}, ${i + 1})
  `
  console.log(`seeded pos ${i + 1}: ${blob.url}`)
}

const rows = await sql`SELECT id, position, blob_url FROM menu_pages ORDER BY position`
console.log('\nFinal state:')
rows.forEach(r => console.log(`  #${r.position}  ${r.blob_url}`))
