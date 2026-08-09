// The SEO pipeline (sibling seo-content-saas repo) sends
// `Authorization: Bearer ${BLOG_WEBHOOK_SECRET}` when publishing an article.
// Same fail-closed pattern as lib/cron-auth.ts.

import { NextResponse } from 'next/server'

export function requireBlogWebhookAuth(req: Request): NextResponse | null {
  const expected = process.env.BLOG_WEBHOOK_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'BLOG_WEBHOOK_SECRET not configured' }, { status: 500 })
  }
  const got = req.headers.get('authorization') || ''
  if (got !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
