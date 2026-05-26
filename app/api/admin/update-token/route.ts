import { NextRequest, NextResponse } from 'next/server'

const PROJECT_ID = 'prj_tqEGX5cc9l0NEsoN1HBwj1XzX2cX'
const TEAM_ID    = process.env.VERCEL_TEAM_ID || 'team_3YXszX9B3Qr3LYzpaAO4yNvB'

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token || typeof token !== 'string' || !token.startsWith('eyJ')) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const apiToken = process.env.VERCEL_API_TOKEN
  if (!apiToken) return NextResponse.json({ error: 'No Vercel API token' }, { status: 500 })

  // Decode exp from JWT payload to show expiry
  let expiresAt = ''
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    expiresAt = new Date(payload.exp * 1000).toLocaleString('en-US', {
      timeZone: 'America/Chicago', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) + ' CDT'
  } catch { /* ignore */ }

  // 1) Update the env var
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

  // NOTE: We deliberately do NOT trigger a redeploy here. Both the empty-body
  // approach and the `deploymentId` redeploy approach have produced broken
  // deployments that 404 every route. The env var update is sufficient — Vercel
  // serverless functions read env vars at request time. Warm function instances
  // drop their cached env naturally within ~1–2 minutes of idle.
  return NextResponse.json({ ok: true, expiresAt })
}
