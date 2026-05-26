import { NextResponse } from 'next/server'
import { listMenuPages } from '@/lib/menu'

// Public — consumed by the QR landing page at yoi-menu.vercel.app.
// CORS open so any origin can fetch.
export async function GET() {
  try {
    const pages = await listMenuPages()
    return NextResponse.json(
      { pages: pages.map(p => ({ id: p.id, url: p.blob_url, position: p.position })) },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          // CDN caches for 5 min; admin edits propagate within that window.
          // stale-while-revalidate keeps the page snappy while the cache refreshes.
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      },
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
