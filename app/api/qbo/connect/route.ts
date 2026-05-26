import { NextResponse } from 'next/server'
import { REDIRECT_URI } from '@/lib/qbo'

export async function GET() {
  const clientId = process.env.QBO_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'QBO not configured' }, { status: 500 })

  const url = new URL('https://appcenter.intuit.com/connect/oauth2')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'com.intuit.quickbooks.accounting')
  url.searchParams.set('state', Math.random().toString(36).slice(2))

  return NextResponse.redirect(url.toString())
}
