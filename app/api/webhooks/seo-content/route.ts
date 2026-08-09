import { NextResponse } from 'next/server'
import { requireBlogWebhookAuth } from '@/lib/blog-webhook-auth'
import { createPendingPost } from '@/lib/blog'

export async function POST(req: Request) {
  const authError = requireBlogWebhookAuth(req)
  if (authError) return authError

  const body = await req.json().catch(() => null)
  if (!body?.title || !body?.body) {
    return NextResponse.json({ error: 'Missing title or body' }, { status: 400 })
  }

  const post = await createPendingPost({
    title: body.title,
    body: body.body,
    metaDescription: body.metaDescription ?? '',
    sourceKeyword: body.sourceKeyword ?? '',
  })

  return NextResponse.json({
    publishedUrl: `https://yoi-dashboard.vercel.app/blog/${post.slug}`,
  })
}
