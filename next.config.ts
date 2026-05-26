import type { NextConfig } from 'next'

const csp = [
  "default-src 'self'",
  // Next.js inlines small bootstrap scripts; needs 'unsafe-inline'. 'unsafe-eval' only in dev.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
  // Tailwind generates inline style attributes
  "style-src 'self' 'unsafe-inline'",
  // Images: self, Vercel Blob (menu uploads), Google logos for review tab, data: for inline SVG
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.googleusercontent.com https://*.gstatic.com https://www.google.com https://maps.googleapis.com",
  // Fonts (Next/font + system)
  "font-src 'self' data:",
  // XHR/fetch: self + Lighthouse + Google Places + Twilio + Gmail API + Vercel Blob
  "connect-src 'self' https://lighthouse-api.harbortouch.com https://maps.googleapis.com https://places.googleapis.com https://api.twilio.com https://gmail.googleapis.com https://oauth2.googleapis.com https://*.public.blob.vercel-storage.com https://api.vercel.com",
  // No framing
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy',      value: csp },
  { key: 'X-Frame-Options',              value: 'DENY' },
  { key: 'X-Content-Type-Options',       value: 'nosniff' },
  { key: 'Referrer-Policy',              value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security',    value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy',           value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
    ]
  },
}

export default nextConfig
