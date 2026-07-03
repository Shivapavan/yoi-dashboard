import { NextResponse } from 'next/server'

export async function GET() {
  const sessionId = process.env.IG_SESSION_ID
  if (!sessionId) return NextResponse.json({ error: 'IG_SESSION_ID not set' })

  const sessionPrefix = sessionId.slice(0, 8) + '...'

  try {
    const res = await fetch('https://i.instagram.com/api/v1/accounts/current_user/?edit=true', {
      headers: {
        'User-Agent': 'Instagram 275.0.0.27.98 Android',
        'x-ig-app-id': '936619743392459',
        'Cookie': `sessionid=${sessionId}`,
      },
      cache: 'no-store',
    })
    const text = await res.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = text.slice(0, 200) }
    return NextResponse.json({ status: res.status, sessionPrefix, body: parsed })
  } catch (e) {
    return NextResponse.json({ error: String(e), sessionPrefix })
  }
}
