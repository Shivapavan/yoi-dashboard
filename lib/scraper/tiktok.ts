// TikTok scraper — parses __UNIVERSAL_DATA_FOR_REHYDRATION__ from public profile pages

export interface TikTokPost {
  id: string
  username: string
  description: string
  hashtags: string[]
  likes: number
  comments: number
  shares: number
  views: number
  timestamp: string
  url: string
}

export interface TikTokProfile {
  username: string
  nickname: string
  bio: string
  followers: number
  following: number
  totalLikes: number
  videoCount: number
  posts: TikTokPost[]
  isYoi: boolean
  scrapedAt: string
}

const TT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.tiktok.com/',
}

type VideoRaw = {
  id?: string; desc?: string
  textExtra?: { hashtagName?: string }[]
  stats?: { diggCount?: number; commentCount?: number; shareCount?: number; playCount?: number }
  createTime?: number
}
type UserRaw  = { nickname?: string; signature?: string }
type StatsRaw = { followerCount?: number; followingCount?: number; heartCount?: number; videoCount?: number }

export async function scrapeTikTokProfile(username: string): Promise<TikTokProfile | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/@${username}`, { headers: TT_HEADERS })
    if (!res.ok) return null
    const html = await res.text()

    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/)
    if (!match) return null

    const data = JSON.parse(match[1]) as {
      __DEFAULT_SCOPE__?: {
        'webapp.user-detail'?: { userInfo?: { user?: UserRaw; stats?: StatsRaw } }
        'webapp.video-list'?: { itemList?: VideoRaw[] }
      }
    }

    const detail = data.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo
    if (!detail) return null

    const user: UserRaw = detail.user ?? {}
    const stats: StatsRaw = detail.stats ?? {}
    const videoList: VideoRaw[] = data.__DEFAULT_SCOPE__?.['webapp.video-list']?.itemList ?? []

    const posts: TikTokPost[] = videoList.map(item => ({
      id: item.id ?? '',
      username,
      description: item.desc ?? '',
      hashtags: (item.textExtra ?? []).map(t => t.hashtagName ?? '').filter(Boolean),
      likes: item.stats?.diggCount ?? 0,
      comments: item.stats?.commentCount ?? 0,
      shares: item.stats?.shareCount ?? 0,
      views: item.stats?.playCount ?? 0,
      timestamp: new Date((item.createTime ?? 0) * 1000).toISOString(),
      url: `https://www.tiktok.com/@${username}/video/${item.id}`,
    }))

    return {
      username,
      nickname: user.nickname ?? username,
      bio: user.signature ?? '',
      followers: stats.followerCount ?? 0,
      following: stats.followingCount ?? 0,
      totalLikes: stats.heartCount ?? 0,
      videoCount: stats.videoCount ?? 0,
      posts,
      isYoi: false,
      scrapedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function scrapeTikTokProfiles(
  usernames: string[],
  onProgress?: (done: number, total: number) => void
): Promise<TikTokProfile[]> {
  const results: TikTokProfile[] = []

  for (let i = 0; i < usernames.length; i++) {
    const profile = await scrapeTikTokProfile(usernames[i])
    if (profile) results.push(profile)
    onProgress?.(i + 1, usernames.length)
    if (i < usernames.length - 1) await new Promise(r => setTimeout(r, 2500))
  }

  return results
}
