// Vercel Cron automatically sends `Authorization: Bearer ${CRON_SECRET}`
// to /api/cron/* routes when CRON_SECRET is set as an env var on the project.
// Any non-cron caller (browser, curl, attacker) won't have it.

import { NextResponse } from 'next/server'

export function requireCronAuth(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // Fail-closed: refuse to run unauthenticated if the secret isn't configured.
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const got = req.headers.get('authorization') || ''
  if (got !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
