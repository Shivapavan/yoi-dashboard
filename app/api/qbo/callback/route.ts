import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/qbo'

export async function GET(req: NextRequest) {
  const code    = req.nextUrl.searchParams.get('code')
  const error   = req.nextUrl.searchParams.get('error')
  const realmId = req.nextUrl.searchParams.get('realmId')

  // Show all params in redirect so we can debug
  if (error) {
    return NextResponse.redirect(
      `https://yoi-dashboard.vercel.app?qbo=error&reason=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      'https://yoi-dashboard.vercel.app?qbo=error&reason=no_code'
    )
  }

  try {
    const result = await exchangeCodeForTokens(code)
    if (result && result.error) {
      return NextResponse.redirect(
        `https://yoi-dashboard.vercel.app?qbo=error&reason=${encodeURIComponent(result.error)}`
      )
    }
    return NextResponse.redirect('https://yoi-dashboard.vercel.app?qbo=connected')
  } catch (e: any) {
    return NextResponse.redirect(
      `https://yoi-dashboard.vercel.app?qbo=error&reason=${encodeURIComponent(e.message || 'exception')}`
    )
  }
}
