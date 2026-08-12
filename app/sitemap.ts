import type { MetadataRoute } from 'next'
import { listPublishedPosts } from '@/lib/blog'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listPublishedPosts()
  const base = 'https://yoi-dashboard.vercel.app'

  return [
    { url: `${base}/blog`, lastModified: new Date() },
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : new Date(),
    })),
  ]
}
