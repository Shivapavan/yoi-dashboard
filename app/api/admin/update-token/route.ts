import { NextRequest, NextResponse } from 'next/server'

const PROJECT_ID   = 'prj_tqEGX5cc9l0NEsoN1HBwj1XzX2cX'
const TEAM_ID      = process.env.VERCEL_TEAM_ID  || 'team_3YXszX9B3Qr3LYzpaAO4yNvB'
const EC_ID        = process.env.EDGE_CONFIG_ID  || 'ecfg_gqlkdllsryermadycrvkrquozaq0'

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token || typeof token !== 'string' || !token.startsWith('eyJ')) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const apiToken = process.env.VERCEL_API_TOKEN
  if (!apiToken) return NextResponse.json({ error: 'No Vercel API token' }, { status: 500 })

  // Decode exp for confirmation message
  let expiresAt = ''
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    expiresAt = new Date(payload.exp * 1000).toLocaleString('en-US', {
      timeZone: 'America/Chicago', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) + ' CDT'
  } catch { /* ignore */ }

  // 1) Write to Edge Config — takes effect immediately, no redeploy needed
  const ecRes = await fetch(
    `https://api.vercel.com/v1/edge-config/${EC_ID}/items?teamId=${TEAM_ID}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ operation: 'upsert', key: 'LIGHTHOUSE_TOKEN', value: token }] }),
    }
  )
  if (!ecRes.ok) {
    const err = await ecRes.text()
    return NextResponse.json({ error: `Edge Config write failed: ${err}` }, { status: 500 })
  }

  // 2) Also update the Vercel env var so the next deployment bakes in the new token
  try {
    const envRes = await fetch(
      `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
      { headers: { Authorization: `Bearer ${apiToken}` } }
    )
    const envData = await envRes.json()
    const existing = envData.envs?.find((e: any) => e.key === 'LIGHTHOUSE_TOKEN' && e.target?.includes('production'))

    if (existing) {
      await fetch(
        `https://api.vercel.com/v10/projects/${PROJECT_ID}/env/${existing.id}?teamId=${TEAM_ID}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: token }),
        }
      )
    } else {
      await fetch(
        `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'LIGHTHOUSE_TOKEN', value: token, type: 'encrypted', target: ['production'] }),
        }
      )
    }
  } catch { /* env var update is best-effort; Edge Config is the live source */ }

  return NextResponse.json({ ok: true, expiresAt })
}
