export type ScraperStatus = 'idle' | 'running' | 'done' | 'failed'

export interface ScraperConfig {
  id: string
  name: string
  type: 'instagram' | 'http'
  targets: string[]          // usernames (instagram) or URLs (http)
  schedule?: string          // 'daily' | 'weekly' | 'manual'
  options?: Record<string, unknown>
}

export interface ScrapeRun {
  id: string
  scraperId: string
  status: ScraperStatus
  startedAt: string
  finishedAt?: string
  itemsCount?: number
  errorMessage?: string
}

// Instagram post result
export interface IgPost {
  id: string
  username: string
  type: 'video' | 'image' | 'carousel'
  url: string
  caption: string
  hashtags: string[]
  likes: number
  views: number
  plays: number
  comments: number
  timestamp: string
  thumbnailUrl: string
}

export interface IgProfile {
  username: string
  fullName: string
  followers: number
  following: number
  postsCount: number
  bio: string
  posts: IgPost[]
  scrapedAt: string
}

// Generic HTTP scraper result
export interface HttpResult {
  url: string
  title: string
  fields: Record<string, string | string[]>
  scrapedAt: string
}

export type ScrapeResult = IgProfile[] | HttpResult[]
