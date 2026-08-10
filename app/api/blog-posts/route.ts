import { NextResponse } from 'next/server'
import { listPendingPosts, listPublishedPosts } from '@/lib/blog'

export async function GET() {
  const [pending, published] = await Promise.all([listPendingPosts(), listPublishedPosts()])
  return NextResponse.json({ pending, published }, { headers: { 'Cache-Control': 'no-store' } })
}
