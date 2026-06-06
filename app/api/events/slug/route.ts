import { NextRequest, NextResponse } from 'next/server'
import { getEventsPublicSlug } from '@/lib/events'

// Returns the configured public slug to authenticated admin sessions only.
// The middleware bypasses /api/events/* (the public page needs it), so we
// enforce session-auth in-route here.
export async function GET(req: NextRequest) {
  if (!req.cookies.get('yoi_session')?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ slug: getEventsPublicSlug() }, { headers: { 'Cache-Control': 'no-store' } })
}
