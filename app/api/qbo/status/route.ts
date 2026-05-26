import { NextResponse } from 'next/server'

export async function GET() {
  const hasToken   = !!process.env.QBO_ACCESS_TOKEN
  const hasRefresh = !!process.env.QBO_REFRESH_TOKEN
  const expiry     = parseInt(process.env.QBO_TOKEN_EXPIRY || '0')
  const connected  = hasToken && hasRefresh

  return NextResponse.json({
    connected,
    tokenExpired: connected && expiry < Math.floor(Date.now() / 1000),
  })
}
