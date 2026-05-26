import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuthedUser } from '@/lib/menu-auth'

// Body: { order: [id1, id2, ...] }   positions assigned by array index (1-based)
export async function PATCH(req: NextRequest) {
  const gate = await requireAuthedUser()
  if (gate.error) return gate.error

  const { order } = await req.json()
  if (!Array.isArray(order) || order.some(x => typeof x !== 'string')) {
    return NextResponse.json({ error: 'order: string[] required' }, { status: 400 })
  }

  const sql = getDb()
  // Two-phase update so we don't violate any unique-position constraint mid-write
  // (we don't have one today, but cheap insurance).
  await sql`UPDATE menu_pages SET position = position + 1000`
  for (let i = 0; i < order.length; i++) {
    await sql`UPDATE menu_pages SET position = ${i + 1}, updated_at = NOW() WHERE id = ${order[i]}`
  }
  return NextResponse.json({ ok: true, count: order.length })
}
