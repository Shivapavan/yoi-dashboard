import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendVerifyOtp, checkVerifyOtp, createSessionToken, setSessionCookie } from '@/lib/auth'

// Normalize any US phone format to E.164 (+1XXXXXXXXXX)
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

// Step 1: POST { phone } — send OTP via Twilio Verify
export async function POST(req: NextRequest) {
  const { phone } = await req.json()
  if (!phone) return NextResponse.json({ error: 'Phone number required.' }, { status: 400 })

  const normalized = normalizePhone(phone)
  const sql = getDb()
  const rows = await sql`SELECT id FROM users WHERE phone = ${normalized} AND is_active = true`
  if (rows.length) {
    await sendVerifyOtp(normalized)
  }
  return NextResponse.json({ ok: true })
}

// Step 2: PUT { phone, code } — verify and issue change-password session
export async function PUT(req: NextRequest) {
  const { phone, code } = await req.json()
  if (!phone || !code) return NextResponse.json({ error: 'Phone and code required.' }, { status: 400 })

  const normalized = normalizePhone(phone)
  const valid = await checkVerifyOtp(normalized, code.trim())
  if (!valid) return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 })

  const sql = getDb()
  const rows = await sql`SELECT id FROM users WHERE phone = ${normalized} AND is_active = true`
  if (!rows.length) return NextResponse.json({ error: 'Invalid code.' }, { status: 400 })

  const token = await createSessionToken(
    { sub: rows[0].id, stage: 'forgot_password', sessionId: crypto.randomUUID() }, '15m',
  )
  await setSessionCookie(token, 15 * 60)
  return NextResponse.json({ redirect: '/change-password?reason=forgot' })
}
