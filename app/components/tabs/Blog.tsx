'use client'

import { useEffect, useState } from 'react'
import type { BlogPost } from '@/lib/blog'

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

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading...</p>
  if (error) {
    return (
      <div className="p-6">
        <p role="alert" className="text-sm text-red-600">{error}</p>
        <button onClick={fetchPosts} className="mt-2 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Blog</h1>
      {actionError && <p role="alert" className="mb-4 text-sm text-red-600">{actionError}</p>}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Pending review ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p className="mb-6 text-sm text-gray-500">Nothing waiting for review.</p>
      ) : (
        <div className="mb-6 flex flex-col gap-3">
          {pending.map((post) => (
            <div key={post.id} className="rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{post.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Keyword: {post.sourceKeyword} · {new Date(post.createdAt).toLocaleDateString()}
                  </p>
                </div>
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
              </div>
              {expandedId === post.id && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="mb-2 text-xs text-gray-500">{post.metaDescription}</p>
                  <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-gray-800">
                    {post.body}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Published ({published.length})
      </h2>
      {published.length === 0 ? (
        <p className="text-sm text-gray-500">No posts published yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {published.map((post) => (
            <div key={post.id} className="flex items-center justify-between rounded border border-gray-200 p-3">
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
        </div>
      )}
    </div>
  )
}
