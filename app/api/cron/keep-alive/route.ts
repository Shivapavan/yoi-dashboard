import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// Pings the Neon database to keep it from auto-suspending.
// Public endpoint — safe to expose since it only runs a no-op query.
// Hit by Vercel Cron (daily) and UptimeRobot (every 5 min).
export async function GET() {
  try {
    const sql = getDb()
    const result = await sql`SELECT NOW() as now`
    return NextResponse.json({
      ok: true,
      pingedAt: new Date().toISOString(),
      dbTime: result[0]?.now,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Support HEAD requests (UptimeRobot's default) — same logic, returns no body
export async function HEAD() {
  try {
    const sql = getDb()
    await sql`SELECT NOW()`
    return new Response(null, { status: 200 })
  } catch {
    return new Response(null, { status: 500 })
  }
}
