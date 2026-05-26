import { NextRequest, NextResponse } from 'next/server'
import { fetchPlaceReviews } from '@/lib/google-places'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month')
    || new Date(Date.now() - 4 * 60 * 60 * 1000)
        .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
        .slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }

  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS seen_reviews (
      id           VARCHAR(255) PRIMARY KEY,
      rating       INTEGER NOT NULL,
      author       VARCHAR(255),
      author_photo TEXT,
      text         TEXT,
      publish_time TIMESTAMPTZ,
      relative_time VARCHAR(50),
      uri          TEXT,
      seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      alerted      BOOLEAN NOT NULL DEFAULT false
    )
  `
  // Ensure newer columns exist (idempotent — adds if missing)
  await sql`ALTER TABLE seen_reviews ADD COLUMN IF NOT EXISTS author_photo TEXT`
  await sql`ALTER TABLE seen_reviews ADD COLUMN IF NOT EXISTS relative_time VARCHAR(50)`
  await sql`ALTER TABLE seen_reviews ADD COLUMN IF NOT EXISTS uri TEXT`

  // Always refresh from Google so brand-new reviews get captured into the DB
  const fresh = await fetchPlaceReviews()
  let placeMeta: any = null

  if (fresh) {
    placeMeta = {
      placeId: fresh.placeId,
      rating: fresh.rating,
      ratingCount: fresh.ratingCount,
      mapsUrl: fresh.mapsUrl,
    }
    for (const r of fresh.reviews) {
      await sql`
        INSERT INTO seen_reviews (id, rating, author, author_photo, text, publish_time, relative_time, uri)
        VALUES (${r.id}, ${r.rating}, ${r.author}, ${r.authorPhoto}, ${r.text}, ${r.publishTime || null}, ${r.relativeTime}, ${r.uri})
        ON CONFLICT (id) DO UPDATE SET
          rating        = EXCLUDED.rating,
          author_photo  = EXCLUDED.author_photo,
          relative_time = EXCLUDED.relative_time,
          uri           = EXCLUDED.uri
      `
    }
  }

  // Filter to the requested month based on publish_time
  const [y, m] = month.split('-').map(Number)
  const startISO = new Date(Date.UTC(y, m - 1, 1)).toISOString()
  const endISO   = new Date(Date.UTC(y, m, 1)).toISOString()

  const monthRows = await sql`
    SELECT id, rating, author, author_photo, text, publish_time, relative_time, uri
    FROM seen_reviews
    WHERE publish_time >= ${startISO} AND publish_time < ${endISO}
    ORDER BY publish_time DESC
  `

  const reviews = monthRows.map((r: any) => ({
    id: r.id,
    rating: r.rating,
    author: r.author,
    authorPhoto: r.author_photo,
    text: r.text,
    publishTime: r.publish_time,
    relativeTime: r.relative_time,
    uri: r.uri,
  }))

  // Month-specific avg/count
  const monthAvg = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0

  // Build list of months that have at least one review in the DB
  const monthsRows = await sql`
    SELECT DISTINCT TO_CHAR(publish_time, 'YYYY-MM') AS m
    FROM seen_reviews
    WHERE publish_time IS NOT NULL
    ORDER BY m DESC
  `
  const availableMonths = monthsRows.map((r: any) => r.m as string)

  return NextResponse.json({
    month,
    monthAvg,
    monthCount: reviews.length,
    reviews,
    availableMonths,
    overall: placeMeta,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
