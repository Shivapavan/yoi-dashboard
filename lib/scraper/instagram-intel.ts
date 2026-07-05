import type { IgProfile, IgPost } from '@/lib/scraper/types'

export const IG_ACCOUNTS = [
  '_bharatbhavan_', 'athidhi.aalayam', 'spicerackfrisco', 'marina_indian',
  'ulavacharu_frisco', 'themangoyard', 'rayalaseemaruchulu_usa_frisco',
  'spicyvihaarfrisco', 'desichowrastha', 'nh7dhaba', 'yumofindia_mckinney',
  'tantraindianbistro', 'bhoomifoodtruck', 'babai_bandi',
  'hyderabadwala23', 'hyderabadhouseprosper', 'golconda_xpress_food_truck',
  'desi.district', 'dumngrill_melissa', 'jataraindiankitchen',
  '_nagskitchen_', 'premaskitchen', 'aaha_kitchen_celina', 'saibhavancarrollton',
]

export const DISPLAY_NAMES: Record<string, string> = {
  '_bharatbhavan_': 'Bharat Bhavan',
  'athidhi.aalayam': 'Athidhi Aalayam',
  'spicerackfrisco': 'Spice Rack',
  'marina_indian': 'Marina Indian',
  'ulavacharu_frisco': 'Ulavacharu',
  'themangoyard': 'The Mango Yard',
  'rayalaseemaruchulu_usa_frisco': 'Rayalaseema Ruchulu',
  'spicyvihaarfrisco': 'Spicy Vihaar',
  'desichowrastha': 'Desi Chowrastha',
  'nh7dhaba': 'NH7 Dhaba',
  'yumofindia_mckinney': 'Yum of India',
  'tantraindianbistro': 'Tantra Indian Bistro',
  'bhoomifoodtruck': 'Bhoomi Food Truck',
  'babai_bandi': 'Babai Bandi',
  'hyderabadwala23': 'Hyderabad Wala',
  'hyderabadhouseprosper': 'Hyderabad House Prosper',
  'golconda_xpress_food_truck': 'Golconda Xpress',
  'desi.district': 'Desi District',
  'dumngrill_melissa': 'Dum N Grill',
  'jataraindiankitchen': 'Jatara Indian Kitchen',
  '_nagskitchen_': 'Nags Kitchen',
  'premaskitchen': "Prema's Kitchen",
  'aaha_kitchen_celina': 'Aaha Kitchen',
  'saibhavancarrollton': 'Sai Bhavan',
}

const TOPICS: Record<string, string[]> = {
  'Grand Opening': ['grand opening', 'now open', 'opening soon', 'opening offer'],
  'Biryani': ['biryani', 'dum biryani'],
  'Food Prep / Live Kitchen': ['live kitchen', 'fresh', 'made from scratch', 'tawa', 'sizzle'],
  'Owner / Founder Story': ['founder', 'owner', 'behind the scenes', 'our story'],
  'Special Occasions': ["mother's day", 'eid', 'ramadan', 'diwali', 'ugadi'],
  'Dosa / Tiffin': ['dosa', 'tiffin', 'idli', 'vada'],
  'Catering / Events': ['catering', 'bulk order', 'party order', 'event'],
  'Chaat / Street Food': ['chaat', 'pani puri', 'bhel', 'street food'],
  'Thali / Banana Leaf': ['thali', 'banana leaf', 'unlimited'],
  'Franchise / Business': ['franchise', 'food truck', 'business'],
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function buildIntel(profiles: IgProfile[]) {
  const yoi = profiles.find(p => p.username === 'yumofindia_mckinney')
  const competitors = profiles.filter(p => p.username !== 'yumofindia_mckinney')
  const allPosts = profiles.flatMap(p => p.posts)
  const competitorPosts = competitors.flatMap(p => p.posts)

  const accounts = profiles.map(p => {
    const views = p.posts.map((post: IgPost) => post.views)
    const likes = p.posts.map((post: IgPost) => post.likes)
    const topViews = Math.max(...views, 0)
    const avgViews = Math.round(views.reduce((a: number, b: number) => a + b, 0) / (views.length || 1))
    const avgLikes = Math.round((likes.reduce((a: number, b: number) => a + b, 0) / (likes.length || 1)) * 10) / 10
    const videos = p.posts.filter((post: IgPost) => post.type === 'video').length
    const best = p.posts.reduce<IgPost | null>((a: IgPost | null, b: IgPost) => (!a || b.views > a.views) ? b : a, null)
    const engagementRate = p.followers > 0 ? Math.round((avgViews / p.followers) * 1000) / 10 : 0
    return {
      account: p.username,
      name: DISPLAY_NAMES[p.username] ?? p.username,
      followers: p.followers,
      posts: p.posts.length,
      videos,
      topViews,
      avgViews,
      avgLikes,
      engagementRate,
      isYoi: p.username === 'yumofindia_mckinney',
      bestPostUrl: best?.url ?? '',
      bestCaption: (best?.caption ?? '').slice(0, 100).replace(/\n/g, ' '),
    }
  }).sort((a, b) => b.topViews - a.topViews)

  const topPosts = allPosts
    .filter(p => p.type === 'video' || p.type === 'carousel')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20)
    .map(p => ({
      views: p.views,
      url: p.url,
      account: p.username,
      name: DISPLAY_NAMES[p.username] ?? p.username,
      caption: p.caption.slice(0, 200).replace(/\n/g, ' '),
      date: p.timestamp.slice(0, 10),
      likes: p.likes,
    }))

  const tagCounts = new Map<string, number>()
  for (const p of allPosts) {
    for (const tag of p.hashtags) {
      if (tag.length > 2 && !/^\d+$/.test(tag)) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }
  }
  const hashtags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([tag, count]) => ({ tag, count }))

  const topics = Object.entries(TOPICS).map(([topic, keywords]) => {
    const count = allPosts.filter(p => {
      const c = p.caption.toLowerCase()
      return keywords.some(kw => c.includes(kw))
    }).length
    return { topic, count }
  }).filter(t => t.count > 0).sort((a, b) => b.count - a.count)

  const sortedByViews = [...competitorPosts].filter(p => p.views > 0).sort((a, b) => b.views - a.views)
  const topTier = sortedByViews.slice(0, Math.max(1, Math.ceil(sortedByViews.length * 0.2)))
  const dayCounts: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 }
  const hourCounts: Record<number, number> = {}
  for (const p of topTier) {
    const d = new Date(p.timestamp)
    dayCounts[DAY_NAMES[d.getUTCDay()]] = (dayCounts[DAY_NAMES[d.getUTCDay()]] ?? 0) + 1
    hourCounts[d.getUTCHours()] = (hourCounts[d.getUTCHours()] ?? 0) + 1
  }
  const bestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Thursday'
  const bestHour = Number(Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? 18)
  const bestHourLabel = bestHour === 0 ? '12 AM' : bestHour < 12 ? `${bestHour} AM` : bestHour === 12 ? '12 PM' : `${bestHour - 12} PM`

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const yoiRecent = (yoi?.posts ?? []).filter(p => new Date(p.timestamp).getTime() > cutoff).length
  const competitorRecents = competitors.map(p => p.posts.filter((post: IgPost) => new Date(post.timestamp).getTime() > cutoff).length)
  const avgCompetitorRecent = Math.round((competitorRecents.reduce((a, b) => a + b, 0) / (competitorRecents.length || 1)) * 10) / 10

  const postsByDay: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 }
  const yoiByDay: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 }
  for (const p of competitorPosts) postsByDay[DAY_NAMES[new Date(p.timestamp).getUTCDay()]]++
  for (const p of yoi?.posts ?? []) yoiByDay[DAY_NAMES[new Date(p.timestamp).getUTCDay()]]++

  // Per-competitor post counts by day (from all posts, not just top)
  const dayAccountCounts: Record<string, Map<string, number>> = {}
  for (const p of competitorPosts) {
    const day = DAY_NAMES[new Date(p.timestamp).getUTCDay()]
    if (!dayAccountCounts[day]) dayAccountCounts[day] = new Map()
    const name = DISPLAY_NAMES[p.username] ?? p.username
    dayAccountCounts[day].set(name, (dayAccountCounts[day].get(name) ?? 0) + 1)
  }
  const postsByDayAndAccount: Record<string, { name: string; count: number }[]> = {}
  for (const [day, map] of Object.entries(dayAccountCounts)) {
    postsByDayAndAccount[day] = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }

  const topCaptionLengths = topTier.slice(0, 20).map(p => p.caption.length).filter(n => n > 0)
  const sweetSpotLength = Math.round(topCaptionLengths.reduce((a, b) => a + b, 0) / (topCaptionLengths.length || 1))
  const yoiAvgCaptionLength = Math.round((yoi?.posts ?? []).map(p => p.caption.length).reduce((a, b) => a + b, 0) / ((yoi?.posts.length) || 1))

  const winningFirstLines = topTier.slice(0, 8)
    .map(p => p.caption.split(/\n/)[0].trim().slice(0, 70))
    .filter(Boolean)

  const engagementRanking = accounts
    .filter(a => a.followers > 100 && a.engagementRate > 0)
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 10)

  const suggestions: { icon: string; title: string; detail: string }[] = []
  suggestions.push({
    icon: '⏰',
    title: `Post on ${bestDay}s around ${bestHourLabel} UTC`,
    detail: `Top competitor reels by views cluster on ${bestDay}s. Schedule your posts then to ride the algorithm.`,
  })
  if (avgCompetitorRecent > yoiRecent) {
    const gap = Math.round(avgCompetitorRecent - yoiRecent)
    suggestions.push({
      icon: '📅',
      title: `Post ${gap} more reels this month`,
      detail: `YOI posted ${yoiRecent} reels in 30 days. Competitors averaged ${avgCompetitorRecent}. More frequency = more reach.`,
    })
  }
  const viralTags = new Map<string, number>()
  for (const p of topTier.slice(0, 15)) {
    for (const tag of p.hashtags) {
      if (tag.length > 2) viralTags.set(tag, (viralTags.get(tag) ?? 0) + 1)
    }
  }
  const topViralTags = Array.from(viralTags.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => `#${t}`)
  if (topViralTags.length > 0) {
    suggestions.push({
      icon: '#️⃣',
      title: `Use these hashtags on every post`,
      detail: topViralTags.join(' ') + ' — these appear most in competitor viral content.',
    })
  }
  if (sweetSpotLength > 0) {
    const diff = sweetSpotLength - yoiAvgCaptionLength
    const direction = diff > 20 ? 'longer' : diff < -20 ? 'shorter' : 'similar length'
    suggestions.push({
      icon: '✍️',
      title: `Write ${direction} captions (~${sweetSpotLength} chars)`,
      detail: `Competitor viral posts average ${sweetSpotLength} characters. YOI averages ${yoiAvgCaptionLength}. Strong hook in first line matters most.`,
    })
  }
  if (topics.length > 0) {
    suggestions.push({
      icon: '🎬',
      title: `More "${topics[0].topic}" content`,
      detail: `"${topics[0].topic}" appears in ${topics[0].count} competitor posts — the most-used content theme right now.`,
    })
  }
  if (winningFirstLines.length > 0) {
    suggestions.push({
      icon: '🎣',
      title: 'Hook viewers in the first line',
      detail: `Best opening from a viral reel: "${winningFirstLines[0]}" — short, direct, creates curiosity.`,
    })
  }

  return {
    lastUpdated: new Date().toISOString(),
    totalPosts: allPosts.length,
    accounts,
    topPosts,
    hashtags,
    topics,
    insights: {
      bestDay, bestHour, bestHourLabel, dayCounts, postsByDay, yoiByDay,
      postsByDayAndAccount,
      engagementRanking, yoiPostsRecent: yoiRecent,
      avgCompetitorPostsRecent: avgCompetitorRecent,
      sweetSpotCaptionLength: sweetSpotLength,
      yoiAvgCaptionLength, winningFirstLines,
    },
    suggestions,
  }
}
