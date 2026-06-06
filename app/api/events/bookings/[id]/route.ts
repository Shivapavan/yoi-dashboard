import { NextRequest, NextResponse } from 'next/server'
import { updateBooking, deleteBooking, getEventsPublicSlug } from '@/lib/events'

function isPublicSlugOk(req: NextRequest): boolean {
  const provided = req.nextUrl.searchParams.get('slug')
  const expected = getEventsPublicSlug()
  return !!expected && !!provided && provided === expected
}
function hasSession(req: NextRequest): boolean {
  return !!req.cookies.get('yoi_session')?.value
}
function authorized(req: NextRequest): boolean {
  return hasSession(req) || isPublicSlugOk(req)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const patch: any = {}
  if (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) patch.date = body.date
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 120)
  if (body.party_size !== undefined) {
    patch.party_size = body.party_size === '' || body.party_size == null
      ? null
      : Math.max(1, Math.min(500, parseInt(String(body.party_size), 10) || 0))
  }
  if (body.start_time !== undefined) patch.start_time = body.start_time ? String(body.start_time).slice(0, 20) : null
  if (body.phone      !== undefined) patch.phone      = body.phone      ? String(body.phone).slice(0, 30) : null
  if (body.status === 'Confirmed' || body.status === 'Tentative') patch.status = body.status
  if (body.notes      !== undefined) patch.notes      = body.notes ? String(body.notes).slice(0, 2000) : null

  const updated = await updateBooking(id, patch)
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ booking: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const ok = await deleteBooking(id)
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 })
}
