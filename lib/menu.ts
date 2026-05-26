import { getDb } from '@/lib/db'

export interface MenuPage {
  id: string
  blob_url: string
  blob_path: string
  position: number
  created_at: string
  updated_at: string
}

export async function ensureMenuTable() {
  const sql = getDb()
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
}

export async function listMenuPages(): Promise<MenuPage[]> {
  const sql = getDb()
  await ensureMenuTable()
  const rows = await sql`
    SELECT id, blob_url, blob_path, position, created_at, updated_at
    FROM menu_pages
    ORDER BY position ASC, created_at ASC
  `
  return rows as MenuPage[]
}

export async function nextPosition(): Promise<number> {
  const sql = getDb()
  const rows = await sql`SELECT COALESCE(MAX(position), 0) AS max FROM menu_pages`
  return Number(rows[0]?.max ?? 0) + 1
}
