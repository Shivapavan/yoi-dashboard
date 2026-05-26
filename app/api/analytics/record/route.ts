import { NextRequest, NextResponse } from 'next/server'
import { recordVisit } from '@/lib/analytics'

export async function POST(req: NextRequest) {
  const ua      = req.headers.get('user-agent') || ''
  const country = req.headers.get('x-vercel-ip-country') || 'Unknown'
  // Run in background — don't block the response
  recordVisit(ua, country).catch(() => {})
  return NextResponse.json({ ok: true })
}
