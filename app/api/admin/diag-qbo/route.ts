import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth'
import { getDb } from '@/lib/db'

const QBO_BASE  = 'https://quickbooks.api.intuit.com'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

export async function GET() {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sql = getDb()
  const adminCheck = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  if (!adminCheck[0]?.is_admin)
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const accessToken  = process.env.QBO_ACCESS_TOKEN
  const refreshToken = process.env.QBO_REFRESH_TOKEN
  const expiry       = parseInt(process.env.QBO_TOKEN_EXPIRY || '0')
  const realmId      = process.env.QBO_REALM_ID
  const clientId     = process.env.QBO_CLIENT_ID
  const clientSecret = process.env.QBO_CLIENT_SECRET
  const now          = Math.floor(Date.now() / 1000)

  const out: any = {
    env: {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      hasRealmId: !!realmId,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasVercelApiToken: !!process.env.VERCEL_API_TOKEN,
    },
    tokenExpiry: {
      expiryTimestamp: expiry,
      expiresAt: expiry ? new Date(expiry * 1000).toISOString() : null,
      secondsUntilExpiry: expiry - now,
      isExpired: expiry < now + 300,
    },
  }

  if (!accessToken || !refreshToken || !clientId || !clientSecret) {
    out.diagnosis = 'Missing one or more required env vars — reconnect QBO via /api/qbo/connect.'
    return NextResponse.json(out)
  }

  // Try to refresh the token to see what happens
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    })
    const text = await res.text()
    let json: any
    try { json = JSON.parse(text) } catch { json = text }

    out.refreshAttempt = {
      status: res.status,
      response: typeof json === 'object' ? { ...json, access_token: json.access_token ? '[redacted]' : null, refresh_token: json.refresh_token ? '[redacted]' : null } : json,
    }

    if (json.access_token && realmId) {
      // Try a simple QBO API call with the fresh token
      const testUrl = `${QBO_BASE}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`
      const testRes = await fetch(testUrl, {
        headers: { Authorization: `Bearer ${json.access_token}`, Accept: 'application/json' },
        cache: 'no-store',
      })
      const testBody = await testRes.text()
      out.companyInfoAttempt = {
        status: testRes.status,
        body: testBody.slice(0, 500),
      }
    }
  } catch (e: any) {
    out.refreshError = e.message
  }

  return NextResponse.json(out)
}
