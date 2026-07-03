import type { IgPost, IgProfile } from './types'

const APP_ID = '936619743392459'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

// Route through ScraperAPI residential proxies if SCRAPER_API_KEY is set.
// ScraperAPI's keep_headers=true forwards our session cookie + app headers
// through their residential IPs so Instagram doesn't rate-limit us.
function proxyUrl(target: string): string {
  const key = process.env.SCRAPER_API_KEY
  if (!key) return target
  return `http://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(target)}&keep_headers=true`
}

function igHeaders(sessionId: string) {
  return {
    'x-ig-app-id': APP_ID,
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': `sessionid=${sessionId}`,
    'Referer': 'https://www.instagram.com/',
    'Origin': 'https://www.instagram.com',
    'Sec-Fetch-Site': 'same-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  }
}

async function getProfile(username: string, sessionId: string): Promise<{ userId: string; profile: Partial<IgProfile> } | null> {
  try {
    const res = await fetch(
      proxyUrl(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`),
      { headers: igHeaders(sessionId) }
    )
    if (!res.ok) return null
    const json = await res.json()
    const user = json?.data?.user
    if (!user) return null

    return {
      userId: user.id,
      profile: {
        username,
        fullName: user.full_name ?? '',
        followers: user.edge_followed_by?.count ?? 0,
        following: user.edge_follow?.count ?? 0,
        postsCount: user.edge_owner_to_timeline_media?.count ?? 0,
        bio: user.biography ?? '',
      },
    }
  } catch {
    return null
  }
}

async function getPosts(userId: string, username: string, sessionId: string, limit = 30): Promise<IgPost[]> {
  const posts: IgPost[] = []
  let nextCursor: string | null = null

  while (posts.length < limit) {
    const countToFetch = Math.min(12, limit - posts.length)
    const paramObj: Record<string, string> = { count: countToFetch.toString() }
    if (nextCursor) paramObj.max_id = nextCursor
    const params: URLSearchParams = new URLSearchParams(paramObj)

    try {
      const res: Response = await fetch(
        proxyUrl(`https://i.instagram.com/api/v1/feed/user/${userId}/?${params}`),
        { headers: igHeaders(sessionId) }
      )
      if (!res.ok) break
      const json = await res.json() as Record<string, unknown>
      const items = (json.items as Record<string, unknown>[] | undefined) ?? []

      for (const item of items) {
        const isVideo = item.media_type === 2
        const isCarousel = item.media_type === 8

        const caption = (item.caption as Record<string, unknown>)?.text as string ?? ''
        const hashtags = [...caption.matchAll(/#(\w+)/g)].map(m => m[1].toLowerCase())

        const imageVersions = item.image_versions2 as Record<string, unknown>
        const thumbCandidates = (imageVersions?.candidates as Record<string, string>[]) ?? []
        const thumbnailUrl = thumbCandidates[thumbCandidates.length - 1]?.url ?? ''

        posts.push({
          id: item.pk as string ?? item.id as string ?? '',
          username,
          type: isCarousel ? 'carousel' : isVideo ? 'video' : 'image',
          url: `https://www.instagram.com/p/${item.code}/`,
          caption,
          hashtags,
          likes: (item.like_count as number) ?? 0,
          views: (item.view_count as number) ?? (item.play_count as number) ?? 0,
          plays: (item.play_count as number) ?? 0,
          comments: (item.comment_count as number) ?? 0,
          timestamp: new Date(((item.taken_at as number) ?? 0) * 1000).toISOString(),
          thumbnailUrl,
        })
      }

      if (!json.more_available || items.length === 0) break
      nextCursor = (json.next_max_id as string | undefined) ?? null
      if (!nextCursor) break

      // Polite delay between pagination requests
      await new Promise(r => setTimeout(r, 800))
    } catch {
      break
    }
  }

  return posts
}

// Scrape a single Instagram account
export async function scrapeAccount(username: string, sessionId: string, postLimit = 30): Promise<IgProfile | null> {
  const profileData = await getProfile(username, sessionId)
  if (!profileData) return null

  // Small delay between profile fetch and posts fetch
  await new Promise(r => setTimeout(r, 500))

  const posts = await getPosts(profileData.userId, username, sessionId, postLimit)

  return {
    ...profileData.profile,
    username,
    posts,
    scrapedAt: new Date().toISOString(),
  } as IgProfile
}

// Scrape multiple accounts with per-account delay to avoid rate limiting
export async function scrapeAccounts(
  usernames: string[],
  sessionId: string,
  postLimit = 30,
  onProgress?: (done: number, total: number, current: string) => void
): Promise<IgProfile[]> {
  const results: IgProfile[] = []

  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i]
    onProgress?.(i, usernames.length, username)

    const profile = await scrapeAccount(username, sessionId, postLimit)
    if (profile) results.push(profile)

    // 2–4 second delay between accounts
    if (i < usernames.length - 1) {
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000))
    }
  }

  onProgress?.(usernames.length, usernames.length, '')
  return results
}
