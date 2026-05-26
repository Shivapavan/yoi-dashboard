// Google Places API (New) integration for reviews
// https://developers.google.com/maps/documentation/places/web-service/text-search

export interface PlaceReview {
  id: string                    // unique review id
  rating: number                // 1–5
  author: string
  authorPhoto: string | null
  text: string
  relativeTime: string          // "a month ago"
  publishTime: string           // ISO timestamp
  uri: string | null            // link to review on Google Maps
}

export interface PlaceSummary {
  placeId: string
  rating: number                // overall avg
  ratingCount: number
  reviews: PlaceReview[]
  mapsUrl: string | null
}

// YOI McKinney — from the Maps URL the user supplied. Used for location bias.
const YOI_LAT = 33.1906463
const YOI_LNG = -96.7509856
const YOI_QUERY = 'Yum Of India Indian Restaurant McKinney TX'

// Cache the resolved Place ID per cold start
let cachedPlaceId: string | null = null

async function findPlaceId(apiKey: string): Promise<string | null> {
  if (cachedPlaceId) return cachedPlaceId
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName',
      },
      body: JSON.stringify({
        textQuery: YOI_QUERY,
        locationBias: {
          circle: {
            center: { latitude: YOI_LAT, longitude: YOI_LNG },
            radius: 500,
          },
        },
      }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    const place = data.places?.[0]
    if (place?.id) {
      cachedPlaceId = place.id
      return cachedPlaceId
    }
    return null
  } catch { return null }
}

export async function fetchPlaceReviews(): Promise<PlaceSummary | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  const placeId = await findPlaceId(apiKey)
  if (!placeId) return null

  // Use the LEGACY Place Details endpoint — it supports reviews_sort=newest, while
  // the new API only returns reviews ranked by relevance (skipping recent low-star ones).
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total,url&reviews_sort=newest&key=${apiKey}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 'OK' || !data.result) return null

    const result = data.result
    const reviews: PlaceReview[] = (result.reviews ?? []).map((r: any) => ({
      // Legacy API has no stable review ID — build one from author + timestamp
      id: `${r.time ?? 0}-${(r.author_url ?? r.author_name ?? 'anon').slice(-32)}`,
      rating: r.rating ?? 0,
      author: r.author_name ?? 'Anonymous',
      authorPhoto: r.profile_photo_url ?? null,
      text: r.text ?? '',
      relativeTime: r.relative_time_description ?? '',
      publishTime: r.time ? new Date(r.time * 1000).toISOString() : '',
      uri: r.author_url ?? null,
    }))

    return {
      placeId,
      rating: result.rating ?? 0,
      ratingCount: result.user_ratings_total ?? 0,
      reviews,
      mapsUrl: result.url ?? null,
    }
  } catch { return null }
}
