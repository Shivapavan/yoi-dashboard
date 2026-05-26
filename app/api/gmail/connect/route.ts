import { NextResponse } from 'next/server'
import { getGmailOAuthClient } from '@/lib/gmail'

export async function GET() {
  const clientId = process.env.GMAIL_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'GMAIL_CLIENT_ID not configured' }, { status: 500 })

  const auth = getGmailOAuthClient()
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    prompt: 'consent',  // force refresh token every time
  })

  return NextResponse.redirect(url)
}
