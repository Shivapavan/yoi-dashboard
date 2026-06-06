import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/verify-mfa',
  '/change-password',
  '/menu',
  '/api/menu',
  '/api/auth/',
  '/api/cron/',
  // Events Space: public page reachable via /events/<slug>. The page itself
  // verifies the slug against EVENTS_PUBLIC_SLUG and 404s otherwise; the
  // bookings API checks the slug query param in-route.
  '/events/',
  '/api/events/bookings',
]

function getSecret() {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET not set')
  return new TextEncoder().encode(s)
}

// Defense in depth: reject mutating admin requests whose Origin header doesn't
// match the request host. Browsers always send Origin on cross-site POST/PUT/etc.,
// so any mismatch indicates CSRF. SameSite=Lax on the session cookie already
// blocks this, but a malformed cookie policy or stale browser shouldn't be the
// only line of defense for admin endpoints.
function blockCsrf(req: NextRequest): NextResponse | null {
  const method = req.method
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null
  if (!req.nextUrl.pathname.startsWith('/api/admin')) return null
  const origin = req.headers.get('origin')
  if (!origin) return null  // same-origin fetches from this app omit Origin in some setups
  const host = req.headers.get('host') || ''
  try {
    const o = new URL(origin)
    if (o.host !== host) {
      return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid Origin header' }, { status: 400 })
  }
  return null
}

export async function middleware(req: NextRequest) {
  const csrf = blockCsrf(req)
  if (csrf) return csrf

  const { pathname } = req.nextUrl

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/.well-known/') ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp)$/.test(pathname) ||
    PUBLIC_PATHS.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  const token = req.cookies.get('yoi_session')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    const { payload } = await jwtVerify(token, getSecret())
    const stage = payload.stage as string

    if (stage === 'authenticated') {
      return NextResponse.next()
    }

    if (stage === 'pre_mfa') {
      if (!pathname.startsWith('/verify-mfa')) {
        return NextResponse.redirect(new URL('/verify-mfa', req.url))
      }
      return NextResponse.next()
    }

    if (stage === 'change_password' || stage === 'forgot_password') {
      if (!pathname.startsWith('/change-password')) {
        return NextResponse.redirect(new URL('/change-password', req.url))
      }
      return NextResponse.next()
    }

    return NextResponse.redirect(new URL('/login', req.url))
  } catch {
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.delete('yoi_session')
    return res
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets/).*)',
  ],
}
