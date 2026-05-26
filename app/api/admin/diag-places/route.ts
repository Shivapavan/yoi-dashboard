import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth'
import { getDb } from '@/lib/db'

export async function GET() {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sql = getDb()
  const adminCheck = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  if (!adminCheck[0]?.is_admin)
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  const out: any = { hasKey: !!apiKey, keyLength: apiKey?.length ?? 0 }

  if (!apiKey) {
    out.diagnosis = 'GOOGLE_PLACES_API_KEY env var not set'
    return NextResponse.json(out)
  }

  // 1) Text search
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: 'Yum Of India Indian Restaurant McKinney TX',
        locationBias: {
          circle: {
            center: { latitude: 33.1906463, longitude: -96.7509856 },
            radius: 500,
          },
        },
      }),
    })
    const text = await res.text()
    let parsed: any
    try { parsed = JSON.parse(text) } catch { parsed = text }
    out.textSearch = { status: res.status, body: parsed }

    // 2) If we got a place ID, try Place Details
    const placeId = parsed?.places?.[0]?.id
    if (placeId) {
      out.placeId = placeId
      const detailsRes = await fetch(`https://places.googleapis.com/v1/${placeId}`, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,rating,userRatingCount,reviews,googleMapsUri',
        },
      })
      const dtext = await detailsRes.text()
      let dparsed: any
      try { dparsed = JSON.parse(dtext) } catch { dparsed = dtext }
      out.placeDetails = { status: detailsRes.status, body: dparsed }
    }
  } catch (e: any) {
    out.error = e.message
  }

  return NextResponse.json(out)
}
