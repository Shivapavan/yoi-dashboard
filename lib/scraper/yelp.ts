// Yelp Fusion API scraper

export interface YelpBusiness {
  id: string
  name: string
  rating: number
  reviewCount: number
  address: string
  phone: string
  url: string
  imageUrl: string
  categories: string[]
  isYoi: boolean
  reviews: YelpReview[]
  scrapedAt: string
}

export interface YelpReview {
  id: string
  text: string
  rating: number
  author: string
  timeCreated: string
  url: string
}

const YELP_API = 'https://api.yelp.com/v3'

type YelpBizRaw = {
  id: string; name: string; rating: number; review_count: number
  location?: { display_address?: string[] }; display_phone?: string; url: string
  image_url?: string; categories?: { title: string }[]
}
type YelpReviewRaw = { id: string; text: string; rating: number; user?: { name: string }; time_created: string; url: string }

async function yelpFetch<T>(path: string, apiKey: string): Promise<T | null> {
  const res = await fetch(`${YELP_API}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) return null
  return res.json() as Promise<T>
}

async function findYelpBusiness(name: string, location: string, apiKey: string): Promise<string | null> {
  const q = `term=${encodeURIComponent(name)}&location=${encodeURIComponent(location)}&limit=1`
  const json = await yelpFetch<{ businesses?: YelpBizRaw[] }>(`/businesses/search?${q}`, apiKey)
  return json?.businesses?.[0]?.id ?? null
}

async function getYelpDetails(id: string, apiKey: string): Promise<Omit<YelpBusiness, 'isYoi' | 'reviews' | 'scrapedAt'> | null> {
  const b = await yelpFetch<YelpBizRaw>(`/businesses/${id}`, apiKey)
  if (!b) return null
  return {
    id: b.id,
    name: b.name,
    rating: b.rating,
    reviewCount: b.review_count,
    address: b.location?.display_address?.join(', ') ?? '',
    phone: b.display_phone ?? '',
    url: b.url,
    imageUrl: b.image_url ?? '',
    categories: (b.categories ?? []).map(c => c.title),
  }
}

async function getYelpReviews(id: string, apiKey: string): Promise<YelpReview[]> {
  const json = await yelpFetch<{ reviews?: YelpReviewRaw[] }>(`/businesses/${id}/reviews?limit=3`, apiKey)
  return (json?.reviews ?? []).map(r => ({
    id: r.id, text: r.text, rating: r.rating,
    author: r.user?.name ?? 'Anonymous',
    timeCreated: r.time_created, url: r.url,
  }))
}

export interface YelpBizInput {
  name: string
  location: string
  isYoi?: boolean
}

export async function scrapeYelpProfiles(
  businesses: YelpBizInput[],
  apiKey: string,
  onProgress?: (done: number, total: number) => void
): Promise<YelpBusiness[]> {
  const results: YelpBusiness[] = []

  for (let i = 0; i < businesses.length; i++) {
    const biz = businesses[i]
    try {
      const id = await findYelpBusiness(biz.name, biz.location, apiKey)
      if (id) {
        const [details, reviews] = await Promise.all([getYelpDetails(id, apiKey), getYelpReviews(id, apiKey)])
        if (details) results.push({ ...details, isYoi: !!biz.isYoi, reviews, scrapedAt: new Date().toISOString() })
      }
    } catch { /* skip */ }
    onProgress?.(i + 1, businesses.length)
    if (i < businesses.length - 1) await new Promise(r => setTimeout(r, 400))
  }

  return results
}
