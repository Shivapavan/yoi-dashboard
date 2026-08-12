import Link from 'next/link'
import { listPublishedPosts } from '@/lib/blog'

export const dynamic = 'force-dynamic'

export default async function BlogIndexPage() {
  const posts = await listPublishedPosts()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yum_logo.png" alt="Yum of India" className="h-10 w-auto" />
          <div>
            <div className="font-bold text-gray-800">Yum of India · Blog</div>
            <div className="text-xs text-gray-500">Stories from our kitchen in McKinney, TX</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {posts.length === 0 ? (
          <p className="text-sm text-gray-500">No posts yet — check back soon.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-teal-400">
                <h2 className="text-lg font-semibold text-gray-900">{post.title}</h2>
                <p className="mt-1 text-sm text-gray-600">{post.metaDescription}</p>
                <p className="mt-2 text-xs text-gray-400">
                  {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ''}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
