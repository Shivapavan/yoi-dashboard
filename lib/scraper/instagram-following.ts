// Scrapes who an Instagram account follows using the internal API (requires IG_SESSION_ID)

const APP_ID = '936619743392459'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

export interface FollowedAccount {
  username: string
  fullName: string
  isVerified: boolean
  isPrivate: boolean
  profilePicUrl: string
  latestReelAt: number | null
}

export interface FollowingResult {
  username: string
  displayName: string
  totalFetched: number
  accounts: FollowedAccount[]
  scrapedAt: string
}

function igHeaders(sessionId: string) {
  return {
    'x-ig-app-id': APP_ID,
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': `sessionid=${sessionId}`,
    'Referer': 'https://www.instagram.com/',
  }
}

async function getUserId(username: string, sessionId: string): Promise<{ userId: string; displayName: string } | null> {
  const res = await fetch(
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    { headers: igHeaders(sessionId) }
  )
  if (!res.ok) return null
  const json = await res.json() as { data?: { user?: { id?: string; full_name?: string } } }
  const user = json?.data?.user
  if (!user?.id) return null
  return { userId: user.id, displayName: user.full_name ?? username }
}

type RawUser = {
  username?: string; full_name?: string; is_verified?: boolean
  is_private?: boolean; profile_pic_url?: string; latest_reel_media?: number
}

// Fetch up to maxPages pages of following (50 accounts per page = 500 max by default)
async function fetchFollowingPage(
  userId: string,
  sessionId: string,
  maxId?: string
): Promise<{ users: RawUser[]; nextMaxId: string | null }> {
  const params = new URLSearchParams({ count: '50' })
  if (maxId) params.set('max_id', maxId)

  const res = await fetch(
    `https://i.instagram.com/api/v1/friendships/${userId}/following/?${params}`,
    { headers: igHeaders(sessionId) }
  )
  if (!res.ok) return { users: [], nextMaxId: null }
  const json = await res.json() as { users?: RawUser[]; next_max_id?: string }
  return {
    users: json.users ?? [],
    nextMaxId: json.next_max_id ?? null,
  }
}

export async function scrapeFollowing(
  username: string,
  sessionId: string,
  maxPages = 10,
  onProgress?: (fetched: number) => void
): Promise<FollowingResult | null> {
  const info = await getUserId(username, sessionId)
  if (!info) return null

  const allUsers: FollowedAccount[] = []
  let cursor: string | undefined = undefined

  for (let page = 0; page < maxPages; page++) {
    const { users, nextMaxId } = await fetchFollowingPage(info.userId, sessionId, cursor)

    for (const u of users) {
      allUsers.push({
        username: u.username ?? '',
        fullName: u.full_name ?? '',
        isVerified: u.is_verified ?? false,
        isPrivate: u.is_private ?? false,
        profilePicUrl: u.profile_pic_url ?? '',
        latestReelAt: u.latest_reel_media ?? null,
      })
    }

    onProgress?.(allUsers.length)

    if (!nextMaxId || users.length === 0) break
    cursor = nextMaxId
    await new Promise(r => setTimeout(r, 1500))
  }

  return {
    username,
    displayName: info.displayName,
    totalFetched: allUsers.length,
    accounts: allUsers,
    scrapedAt: new Date().toISOString(),
  }
}

// Scrape multiple accounts and find common follows (intersection analysis)
export function findCommonFollows(
  results: FollowingResult[],
  minSharedBy = 2
): { account: FollowedAccount; sharedBy: string[]; score: number }[] {
  const byUsername = new Map<string, { account: FollowedAccount; sharedBy: string[] }>()

  for (const result of results) {
    for (const acc of result.accounts) {
      if (!acc.username) continue
      const existing = byUsername.get(acc.username)
      if (existing) {
        existing.sharedBy.push(result.username)
      } else {
        byUsername.set(acc.username, { account: acc, sharedBy: [result.username] })
      }
    }
  }

  return Array.from(byUsername.values())
    .filter(e => e.sharedBy.length >= minSharedBy)
    .map(e => ({
      ...e,
      // Verified accounts score higher; more shared = higher score
      score: e.sharedBy.length * (e.account.isVerified ? 2 : 1),
    }))
    .sort((a, b) => b.score - a.score)
}
