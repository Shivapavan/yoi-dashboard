import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

const RUN_STATE_BLOB = 'instagram-run-state.json'

export async function GET() {
  try {
    // Check Blob run state for latest blob URL
    const stateRes = await fetch(
      `${process.env.BLOB_BASE_URL ?? 'https://blob.vercel-storage.com'}/${RUN_STATE_BLOB}`,
      { next: { revalidate: 0 } }
    )
    if (stateRes.ok) {
      const state = await stateRes.json() as { blobUrl?: string }
      if (state.blobUrl) {
        const dataRes = await fetch(state.blobUrl, { next: { revalidate: 0 } })
        if (dataRes.ok) return NextResponse.json(await dataRes.json())
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
