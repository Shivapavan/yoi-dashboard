import { NextResponse } from 'next/server'
import { list } from '@vercel/blob'

const RUN_STATE_BLOB = 'yelp-run-state.json'

export async function GET() {
  try {
    const { blobs } = await list({ prefix: RUN_STATE_BLOB })
    if (blobs.length) {
      const state = await fetch(blobs[0].url, { cache: 'no-store' }).then(r => r.json()) as { blobUrl?: string }
      if (state.blobUrl) {
        const data = await fetch(state.blobUrl, { cache: 'no-store' })
        if (data.ok) return NextResponse.json(await data.json())
      }
    }
  } catch { /* fall through */ }
  return NextResponse.json({ error: 'No data yet' }, { status: 404 })
}
