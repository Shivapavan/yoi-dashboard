import { NextResponse } from 'next/server'

export async function GET() {
  const token = process.env.LIGHTHOUSE_TOKEN || ''
  if (!token) return NextResponse.json({ status: 'missing' })

  try {
    // Decode JWT payload (middle section, base64url)
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
    )
    const exp = payload.exp as number
    const now = Math.floor(Date.now() / 1000)
    const secondsLeft = exp - now
    const hoursLeft = Math.round(secondsLeft / 3600)

    if (secondsLeft <= 0) return NextResponse.json({ status: 'expired', hoursLeft: 0 })
    if (secondsLeft < 4 * 3600) return NextResponse.json({ status: 'expiring_soon', hoursLeft })
    return NextResponse.json({ status: 'ok', hoursLeft })
  } catch {
    return NextResponse.json({ status: 'unknown' })
  }
}
