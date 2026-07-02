import { NextResponse } from 'next/server'
import { list } from '@vercel/blob'
import { readFileSync } from 'fs'
import { join } from 'path'

const RUN_STATE_BLOB = 'instagram-run-state.json'

export async function GET() {
  try {
    // Check Blob run state for latest blob URL
    const { blobs } = await list({ prefix: RUN_STATE_BLOB })
    if (blobs.length) {
      const stateRes = await fetch(blobs[0].url, { cache: 'no-store' })
      if (stateRes.ok) {
        const state = await stateRes.json() as { blobUrl?: string }
        if (state.blobUrl) {
          const dataRes = await fetch(state.blobUrl, { cache: 'no-store' })
          if (dataRes.ok) return NextResponse.json(await dataRes.json())
        }
      }
    }
  } catch {
    // fall through to static file
  }

  // Fall back to bundled static JSON
  try {
    const filePath = join(process.cwd(), 'data', 'instagram-intel.json')
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Data not available' }, { status: 404 })
  }
}
