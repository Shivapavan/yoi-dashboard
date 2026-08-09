import { getDb } from '@/lib/db'

export interface BlogPost {
  id: string
  slug: string
  title: string
  body: string
  metaDescription: string
  sourceKeyword: string
  status: 'pending' | 'published'
  createdAt: string
  publishedAt: string | null
}

function mapRow(row: any): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    metaDescription: row.meta_description,
    sourceKeyword: row.source_keyword,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  }
}

let _ensured = false
export async function ensureBlogPostsTable() {
  if (_ensured) return
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      slug              TEXT         UNIQUE NOT NULL,
      title             TEXT         NOT NULL,
      body              TEXT         NOT NULL,
      meta_description  TEXT         NOT NULL DEFAULT '',
      source_keyword    TEXT         NOT NULL DEFAULT '',
      status            TEXT         NOT NULL DEFAULT 'pending',
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      published_at      TIMESTAMPTZ
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON blog_posts(status)`
  _ensured = true
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function uniqueSlug(sql: ReturnType<typeof getDb>, base: string): Promise<string> {
  let candidate = base
  let n = 2
  for (;;) {
    const rows = await sql`SELECT 1 FROM blog_posts WHERE slug = ${candidate}`
    if (rows.length === 0) return candidate
    candidate = `${base}-${n}`
    n++
  }
}

export async function createPendingPost(params: {
  title: string
  body: string
  metaDescription: string
  sourceKeyword: string
}): Promise<BlogPost> {
  await ensureBlogPostsTable()
  const sql = getDb()
  const slug = await uniqueSlug(sql, slugify(params.title))
  const rows = await sql`
    INSERT INTO blog_posts (slug, title, body, meta_description, source_keyword)
    VALUES (${slug}, ${params.title}, ${params.body}, ${params.metaDescription}, ${params.sourceKeyword})
    RETURNING *
  `
  return mapRow(rows[0])
}

export async function listPendingPosts(): Promise<BlogPost[]> {
  await ensureBlogPostsTable()
  const sql = getDb()
  const rows = await sql`SELECT * FROM blog_posts WHERE status = 'pending' ORDER BY created_at DESC`
  return rows.map(mapRow)
}

export async function listPublishedPosts(): Promise<BlogPost[]> {
  await ensureBlogPostsTable()
  const sql = getDb()
  const rows = await sql`SELECT * FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC`
  return rows.map(mapRow)
}

export async function getPublishedPostBySlug(slug: string): Promise<BlogPost | null> {
  await ensureBlogPostsTable()
  const sql = getDb()
  const rows = await sql`SELECT * FROM blog_posts WHERE slug = ${slug} AND status = 'published'`
  return rows.length ? mapRow(rows[0]) : null
}

export async function approvePost(id: string): Promise<void> {
  await ensureBlogPostsTable()
  const sql = getDb()
  await sql`UPDATE blog_posts SET status = 'published', published_at = NOW() WHERE id = ${id}::uuid`
}

export async function deletePost(id: string): Promise<void> {
  await ensureBlogPostsTable()
  const sql = getDb()
  await sql`DELETE FROM blog_posts WHERE id = ${id}::uuid`
}
