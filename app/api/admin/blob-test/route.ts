import { NextResponse } from 'next/server'
import { put, list } from '@vercel/blob'

export async function GET() {
  const results: Record<string, unknown> = {}

  results.blobTokenPresent = !!process.env.BLOB_READ_WRITE_TOKEN
  results.blobTokenPrefix = process.env.BLOB_READ_WRITE_TOKEN?.slice(0, 20) + '...'

  try {
    const { blobs } = await list({ prefix: 'instagram-run-state.json' })
    results.listOk = true
    results.listCount = blobs.length
    results.firstBlobUrl = blobs[0]?.url
  } catch (e) {
    results.listError = String(e)
  }

  try {
    await put('blob-test-delete-me.txt', 'test', {
      access: 'public',
      contentType: 'text/plain',
      addRandomSuffix: false, allowOverwrite: true,
    })
    results.putOk = true
  } catch (e) {
    results.putError = String(e)
  }

  return NextResponse.json(results)
}
