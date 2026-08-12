import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { getPublishedPostBySlug } from '@/lib/blog'

export const dynamic = 'force-dynamic'

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)
  if (!post) notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yum_logo.png" alt="Yum of India" className="h-10 w-auto" />
          <div>
            <div className="font-bold text-gray-800">Yum of India · Blog</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <article className="rounded-lg border border-gray-200 bg-white p-6">
          <h1>{post.title}</h1>
          <ReactMarkdown>{post.body}</ReactMarkdown>
        </article>
      </main>
    </div>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)
  if (!post) return {}
  return {
    title: post.title,
    description: post.metaDescription,
  }
}
