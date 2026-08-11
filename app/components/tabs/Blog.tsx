'use client'

import { useEffect, useState } from 'react'
import type { BlogPost } from '@/lib/blog'
import { SectionCard } from '../SectionCard'

export default function Blog() {
  const [pending, setPending] = useState<BlogPost[]>([])
  const [published, setPublished] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchPosts = async () => {
    try {
      const res = await fetch('/api/blog-posts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load posts')
      setPending(data.pending ?? [])
      setPublished(data.published ?? [])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPosts() }, [])

  const approve = async (id: string) => {
    setActionError(null)
    try {
      const res = await fetch(`/api/blog-posts/${id}`, { method: 'PATCH' })
      if (!res.ok) throw new Error('Failed to approve post')
      await fetchPosts()
    } catch (err: any) {
      setActionError(err.message)
    }
  }

  const reject = async (id: string) => {
    setActionError(null)
    try {
      const res = await fetch(`/api/blog-posts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to reject post')
      await fetchPosts()
    } catch (err: any) {
      setActionError(err.message)
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Blog</h1>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{error}</div>}
      {actionError && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">{actionError}</div>}

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading blog posts…</p>
        </div>
      )}

      {!loading && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Pending review ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="mb-6 text-sm text-gray-500">Nothing waiting for review.</p>
          ) : (
            <div className="mb-6 flex flex-col gap-3">
              {pending.map((post) => (
                <SectionCard
                  key={post.id}
                  title={post.title}
                  subtitle={`Keyword: ${post.sourceKeyword} · ${new Date(post.createdAt).toLocaleDateString()}`}
                  className="mt-0"
                  summary={
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => setExpandedId(expandedId === post.id ? null : post.id)}
                        className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700"
                      >
                        {expandedId === post.id ? 'Hide' : 'Preview'}
                      </button>
                      <button
                        onClick={() => approve(post.id)}
                        className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => reject(post.id)}
                        className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Reject
                      </button>
                    </div>
                  }
                >
                  {expandedId === post.id && (
                    <div className="px-6 py-4 border-t border-gray-100">
                      <p className="mb-2 text-xs text-gray-500">{post.metaDescription}</p>
                      <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-gray-800">
                        {post.body}
                      </pre>
                    </div>
                  )}
                </SectionCard>
              ))}
            </div>
          )}

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Published ({published.length})
          </h2>
          {published.length === 0 ? (
            <p className="text-sm text-gray-500">No posts published yet.</p>
          ) : (
            <SectionCard className="mt-0">
              {published.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between px-6 py-3 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="font-medium text-gray-900">{post.title}</p>
                    <p className="text-xs text-gray-500">
                      Published {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <a
                    href={`/blog/${post.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-teal-600 underline"
                  >
                    View live
                  </a>
                </div>
              ))}
            </SectionCard>
          )}
        </>
      )}
    </div>
  )
}
