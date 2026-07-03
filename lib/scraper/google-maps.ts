// Google Places API — fetches competitor info + reviews

export interface PlaceResult {
  placeId: string
  name: string
  rating: number
  userRatingsTotal: number
  address: string
  phone: string
  website: string
  priceLevel: number
  isYoi: boolean
  reviews: PlaceReview[]
  scrapedAt: string
}

export interface PlaceReview {
  author: string
  rating: number
  text: string
  relativeTime: string
}

const PLACES_API = 'https://maps.googleapis.com/maps/api/place'

async function findPlaceId(name: string, location: string, apiKey: string): Promise<string | null> {
  const q = encodeURIComponent(`${name} ${location}`)
  const res = await fetch(`${PLACES_API}/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id&key=${apiKey}`)
  const json = await res.json() as { candidates?: { place_id: string }[] }
  return json.candidates?.[0]?.place_id ?? null
}

async function getPlaceDetails(placeId: string, apiKey: string): Promise<Omit<PlaceResult, 'isYoi'> | null> {
  const fields = 'name,rating,user_ratings_total,formatted_address,formatted_phone_number,website,price_level,reviews'
  const res = await fetch(`${PLACES_API}/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`)
  const json = await res.json() as { result?: Record<string, unknown> }
  const r = json.result
  if (!r) return null

  type ReviewRaw = { author_name: string; rating: number; text: string; relative_time_description: string }

  return {
    placeId,
    name: (r.name as string) ?? '',
    rating: (r.rating as number) ?? 0,
    userRatingsTotal: (r.user_ratings_total as number) ?? 0,
    address: (r.formatted_address as string) ?? '',
    phone: (r.formatted_phone_number as string) ?? '',
    website: (r.website as string) ?? '',
    priceLevel: (r.price_level as number) ?? 0,
    reviews: ((r.reviews as ReviewRaw[] | undefined) ?? []).map(rev => ({
      author: rev.author_name,
      rating: rev.rating,
      text: rev.text,
      relativeTime: rev.relative_time_description,
    })),
    scrapedAt: new Date().toISOString(),
  }
}

export interface GMapsBusiness {
  name: string
  location: string
  isYoi?: boolean
}

export async function scrapeGoogleMapsProfiles(
  businesses: GMapsBusiness[],
  apiKey: string,
  onProgress?: (done: number, total: number) => void
): Promise<PlaceResult[]> {
  const results: PlaceResult[] = []

  for (let i = 0; i < businesses.length; i++) {
    const biz = businesses[i]
    try {
      const placeId = await findPlaceId(biz.name, biz.location, apiKey)
      if (placeId) {
        const details = await getPlaceDetails(placeId, apiKey)
        if (details) results.push({ ...details, isYoi: !!biz.isYoi })
      }
    } catch { /* skip */ }
    onProgress?.(i + 1, businesses.length)
    if (i < businesses.length - 1) await new Promise(r => setTimeout(r, 600))
  }

  return results
}
