import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET() {
  try {
    // Try Blob (latest refresh) first
    const blobUrl = await kv.get<string>('ig:blob-url')
    if (blobUrl) {
      const res = await fetch(blobUrl, { next: { revalidate: 0 } })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json(data)
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
