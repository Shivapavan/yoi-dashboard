import { NextRequest, NextResponse } from 'next/server'
import { exchangeGmailCode } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(`https://yoi-dashboard.vercel.app?gmail=error&reason=${encodeURIComponent(error || 'no_code')}`)
  }

  try {
    await exchangeGmailCode(code)
    return NextResponse.redirect('https://yoi-dashboard.vercel.app?gmail=connected')
  } catch (e: any) {
    return NextResponse.redirect(`https://yoi-dashboard.vercel.app?gmail=error&reason=${encodeURIComponent(e.message)}`)
  }
}
