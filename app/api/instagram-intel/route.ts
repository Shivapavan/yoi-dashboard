import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'data', 'instagram-intel.json')
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Data not available' }, { status: 404 })
  }
}
