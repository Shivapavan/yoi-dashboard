import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'crypto'

// ── Constants ────────────────────────────────────────────────────────────────
const SALT_ROUNDS      = 12
const SESSION_COOKIE   = 'yoi_session'
const DEVICE_COOKIE    = 'yoi_device'
export const MFA_TTL_DAYS       = 12
export const OTP_TTL_MINUTES    = 10
export const PASSWORD_MAX_MONTHS = 6
export const MAX_FAILED_ATTEMPTS = 5
export const LOCK_MINUTES        = 30
export const PASSWORD_HISTORY_KEEP = 10

// ── Password policy ──────────────────────────────────────────────────────────
export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8)              return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password))          return 'Password must contain at least one uppercase letter.'
  if (!/[0-9]/.test(password))          return 'Password must contain at least one number.'
  if (!/[^A-Za-z0-9]/.test(password))  return 'Password must contain at least one special character.'
  return null
}

export function isPasswordExpired(pwChangedAt: Date): boolean {
  const diffMs = Date.now() - new Date(pwChangedAt).getTime()
  return diffMs > PASSWORD_MAX_MONTHS * 30 * 24 * 60 * 60 * 1000
}

// ── Hashing ──────────────────────────────────────────────────────────────────
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function isPasswordInHistory(plain: string, hashes: string[]): Promise<boolean> {
  for (const h of hashes) {
    if (await bcrypt.compare(plain, h)) return true
  }
  return false
}

// ── OTP ──────────────────────────────────────────────────────────────────────
export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, 8)
}

export async function verifyOtp(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash)
}

// ── JWT sessions ─────────────────────────────────────────────────────────────
function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET env var is missing')
  return new TextEncoder().encode(s)
}

export type SessionStage =
  | 'authenticated'
  | 'pre_mfa'
  | 'change_password'
  | 'forgot_password'

export interface SessionPayload {
  sub: string          // userId
  stage: SessionStage
  sessionId: string
  iat?: number         // populated by jose at verify
  exp?: number
}

export async function createSessionToken(
  payload: SessionPayload,
  expiresIn: string = '24h',
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

// ── Cookie helpers (server components / route handlers) ───────────────────────
export async function setSessionCookie(token: string, maxAgeSec: number) {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSec,
  })
}

export async function clearSessionCookie() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

export async function getSessionFromCookie(): Promise<SessionPayload | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await verifySessionToken(token)
  if (!session) return null

  // Freshness check: reject JWTs issued before pw_changed_at, or for inactive users.
  // Stages 'authenticated', 'change_password', 'forgot_password' carry meaningful state
  // that must invalidate when the password changes (single-use forgot-password).
  // 'pre_mfa' is short-lived enough to skip.
  if (session.stage !== 'pre_mfa') {
    try {
      const { getDb } = await import('@/lib/db')
      const sql = getDb()
      const rows = await sql`
        SELECT pw_changed_at, is_active FROM users WHERE id = ${session.sub}
      `
      const row = rows[0]
      if (!row || !row.is_active) return null
      const pwChangedSec = Math.floor(new Date(row.pw_changed_at).getTime() / 1000)
      const iat = session.iat ?? 0
      // 5s skew tolerance to avoid same-second false-rejections
      if (pwChangedSec > iat + 5) return null
    } catch {
      // If DB lookup fails, fall back to JWT-only validation rather than locking everyone out
      return session
    }
  }

  return session
}

export async function getDeviceId(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(DEVICE_COOKIE)?.value
  if (existing) return existing
  const newId = uuidv4()
  jar.set(DEVICE_COOKIE, newId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,  // 1 year
  })
  return newId
}

// ── Device fingerprinting (binds MFA session to UA + IP /24) ─────────────────
export function hashUA(userAgent: string): string {
  return createHash('sha256').update(userAgent).digest('hex').slice(0, 64)
}

export function ipPrefix(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown'
  // IPv4 → /24
  const v4 = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/)
  if (v4) return `${v4[1]}.0/24`
  // IPv6 → /48 (first 3 groups)
  if (ip.includes(':')) {
    const parts = ip.split(':')
    return parts.slice(0, 3).join(':') + '::/48'
  }
  return ip
}

export function getRequestFingerprint(req: Request): { uaHash: string; ipPref: string } {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const ua = req.headers.get('user-agent') ?? ''
  return { uaHash: hashUA(ua), ipPref: ipPrefix(ip) }
}

// ── Login history ────────────────────────────────────────────────────────────
export async function recordLogin(userId: string, ip: string, userAgent: string) {
  try {
    const { getDb } = await import('@/lib/db')
    const sql = getDb()
    const userRows = await sql`SELECT username, email FROM users WHERE id = ${userId}`
    if (!userRows.length) return
    const { username, email } = userRows[0]
    await sql`
      INSERT INTO login_history (user_id, username, email, ip_address, user_agent)
      VALUES (${userId}, ${username}, ${email ?? null}, ${ip}, ${userAgent})
    `
  } catch { /* non-critical, don't block login */ }
}

// ── Twilio Verify (handles A2P 10DLC compliance automatically) ────────────────
export async function sendVerifyOtp(to: string): Promise<boolean> {
  const sid        = process.env.TWILIO_ACCOUNT_SID
  const token      = process.env.TWILIO_AUTH_TOKEN
  const serviceSid = process.env.TWILIO_VERIFY_SID
  if (!sid || !token || !serviceSid) return false

  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, Channel: 'sms' }).toString(),
    },
  )
  return res.ok
}

export async function checkVerifyOtp(to: string, code: string): Promise<boolean> {
  const sid        = process.env.TWILIO_ACCOUNT_SID
  const token      = process.env.TWILIO_AUTH_TOKEN
  const serviceSid = process.env.TWILIO_VERIFY_SID
  if (!sid || !token || !serviceSid) return false

  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, Code: code }).toString(),
    },
  )
  if (!res.ok) return false
  const data = await res.json()
  return data.status === 'approved'
}

// Keep for non-OTP notifications if needed
export async function sendSms(to: string, body: string): Promise<boolean> {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) return false

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    },
  )
  return res.ok
}
