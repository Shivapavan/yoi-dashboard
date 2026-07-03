import { NextResponse } from 'next/server'

export async function GET() {
  const sessionId = process.env.IG_SESSION_ID
  if (!sessionId) return NextResponse.json({ error: 'IG_SESSION_ID not set' })

  const sessionPrefix = sessionId.slice(0, 8) + '...'

  // Test the exact endpoint the scraper uses
  const testUsername = 'golconda_xpress_food_truck'
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${testUsername}`,
      {
        headers: {
          'x-ig-app-id': '936619743392459',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': `sessionid=${sessionId}`,
          'Referer': 'https://www.instagram.com/',
          'Origin': 'https://www.instagram.com',
          'Sec-Fetch-Site': 'same-site',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
        },
        cache: 'no-store',
      }
    )
    const text = await res.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = text.slice(0, 300) }
    const hasUser = !!(parsed as Record<string, unknown>)?.data
    return NextResponse.json({ status: res.status, sessionPrefix, hasUser, body: hasUser ? 'OK — user data found' : parsed })
  } catch (e) {
    return NextResponse.json({ error: String(e), sessionPrefix })
  }
}
