import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { hashPassword, validatePasswordPolicy, getSessionFromCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session || session.stage !== 'authenticated')
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  // Only admins can create users
  const sql = getDb()
  const adminRows = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`
  if (!adminRows[0]?.is_admin)
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })

  const { name, email, phone, tempPassword, isAdmin } = await req.json()
  if (!name || !email || !phone || !tempPassword)
    return NextResponse.json({ error: 'name, email, phone, and tempPassword are required.' }, { status: 400 })

  const policyErr = validatePasswordPolicy(tempPassword)
  if (policyErr) return NextResponse.json({ error: policyErr }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  const username = normalizedEmail.split('@')[0].replace(/[^a-z0-9]/g, '')
  const hash = await hashPassword(tempPassword)

  try {
    const rows = await sql`
      INSERT INTO users (username, email, phone, password_hash, must_change_pw, is_admin, created_by)
      VALUES (${username}, ${normalizedEmail}, ${phone.trim()}, ${hash}, true, ${!!isAdmin}, ${session.sub})
      RETURNING id, username, email
    `
    return NextResponse.json({ ok: true, user: rows[0] })
  } catch (e: any) {
    if (e.message?.includes('unique')) {
      return NextResponse.json({ error: 'Email already exists.' }, { status: 409 })
    }
    throw e
  }
}
