import { google } from 'googleapis'

const PROJECT_ID = 'prj_tqEGX5cc9l0NEsoN1HBwj1XzX2cX'
const TEAM_ID    = process.env.VERCEL_TEAM_ID || 'team_3YXszX9B3Qr3LYzpaAO4yNvB'

export const GMAIL_REDIRECT_URI = 'https://yoi-dashboard.vercel.app/api/gmail/callback'

async function updateVercelEnv(key: string, value: string) {
  const apiToken = process.env.VERCEL_API_TOKEN
  if (!apiToken) return
  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  })
  const envData = await res.json()
  const existing = envData.envs?.find((e: any) => e.key === key && e.target?.includes('production'))
  if (existing) {
    await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env/${existing.id}?teamId=${TEAM_ID}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
  } else {
    await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, type: 'encrypted', target: ['production'] }),
    })
  }
}

export function getGmailOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI
  )
}

export async function getValidGmailClient() {
  const accessToken  = process.env.GMAIL_ACCESS_TOKEN
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!accessToken || !refreshToken) return null

  const auth = getGmailOAuthClient()
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken })

  // Refresh access token if expired
  try {
    const { credentials } = await auth.refreshAccessToken()
    if (credentials.access_token && credentials.access_token !== accessToken) {
      await updateVercelEnv('GMAIL_ACCESS_TOKEN', credentials.access_token)
      auth.setCredentials(credentials)
    }
  } catch { /* use existing token */ }

  return auth
}

// Send an email via the connected Gmail account.
// Used for alerts (review notifications, billing, etc.) instead of SMS — avoids the
// US A2P 10DLC carrier-block issue that affects regular long-code Twilio sends.
export async function sendEmail(to: string[], subject: string, body: string): Promise<boolean> {
  const auth = await getValidGmailClient()
  if (!auth) return false
  try {
    const { google } = await import('googleapis')
    const gmail = google.gmail({ version: 'v1', auth })

    const message = [
      `To: ${to.join(', ')}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
    ].join('\r\n')

    const raw = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })
    return true
  } catch { return false }
}

export async function exchangeGmailCode(code: string) {
  const auth = getGmailOAuthClient()
  const { tokens } = await auth.getToken(code)
  await Promise.all([
    updateVercelEnv('GMAIL_ACCESS_TOKEN',  tokens.access_token || ''),
    updateVercelEnv('GMAIL_REFRESH_TOKEN', tokens.refresh_token || ''),
  ])
  return tokens
}

export interface DoorDashPayout {
  weekStart:  string  // YYYY-MM-DD
  weekEnd:    string  // YYYY-MM-DD
  amount:     number
  type:       'projected' | 'finalized'
  receivedAt: string  // ISO date of email
}

export async function fetchDoorDashPayouts(): Promise<DoorDashPayout[]> {
  const auth = await getValidGmailClient()
  if (!auth) return []

  const gmail = google.gmail({ version: 'v1', auth })

  // Search for DoorDash payout emails
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'from:no-reply@doordash.com subject:"DoorDash payment"',
    maxResults: 20,
  })

  const messages = listRes.data.messages || []
  const payouts: DoorDashPayout[] = []

  for (const msg of messages) {
    try {
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      })

      const headers = fullMsg.data.payload?.headers || []
      const subject = headers.find(h => h.name === 'Subject')?.value || ''
      const dateHeader = headers.find(h => h.name === 'Date')?.value || ''

      // Parse amount from body
      let body = ''
      const parts = fullMsg.data.payload?.parts || [fullMsg.data.payload]
      for (const part of parts) {
        if (part?.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf8')
          break
        }
        if (part?.mimeType === 'text/html' && part.body?.data) {
          const html = Buffer.from(part.body.data, 'base64').toString('utf8')
          body = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
        }
      }

      // Parse amount: "payment of $378.95"
      const amountMatch = body.match(/payment of \$([0-9,]+\.[0-9]{2})/i)
                       || body.match(/\$([0-9,]+\.[0-9]{2})/i)
      if (!amountMatch) continue
      const amount = parseFloat(amountMatch[1].replace(/,/g, ''))

      // Parse date range from subject: "(04/27/2026 – 05/03/2026)"
      const dateMatch = subject.match(/\((\d{2})\/(\d{2})\/(\d{4})\s*[–-]\s*(\d{2})\/(\d{2})\/(\d{4})\)/)
      if (!dateMatch) continue
      const weekStart = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`
      const weekEnd   = `${dateMatch[6]}-${dateMatch[4]}-${dateMatch[5]}`

      // Determine projected vs finalized (Thursdays = finalized)
      const emailDate = new Date(dateHeader)
      const type: 'projected' | 'finalized' = emailDate.getDay() === 4 ? 'finalized' : 'projected'

      payouts.push({
        weekStart,
        weekEnd,
        amount,
        type,
        receivedAt: emailDate.toISOString(),
      })
    } catch { /* skip malformed emails */ }
  }

  // Deduplicate: keep most recent email per week (finalized takes priority)
  const byWeek = new Map<string, DoorDashPayout>()
  for (const p of payouts) {
    const key = p.weekStart
    const existing = byWeek.get(key)
    if (!existing || p.type === 'finalized' || new Date(p.receivedAt) > new Date(existing.receivedAt)) {
      byWeek.set(key, p)
    }
  }

  return [...byWeek.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}

export interface OrderItem {
  name: string
  qty: number
  price: number | null
}

// Extract plain text from a Gmail message payload (handles multipart recursively)
function extractBodyText(payload: any): string {
  if (!payload) return ''

  const parts: any[] = payload.parts || []
  if (parts.length === 0) {
    if (!payload.body?.data) return ''
    const raw = Buffer.from(payload.body.data, 'base64').toString('utf8')
    if (payload.mimeType === 'text/plain') return raw
    return raw
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
  }

  let plain = ''
  let html = ''
  for (const part of parts) {
    const text = extractBodyText(part)
    if ((part.mimeType === 'text/plain' || part.parts?.some((p: any) => p.mimeType === 'text/plain')) && !plain) {
      plain = text
    } else if (!html) {
      html = text
    }
  }
  return plain || html
}

function normLine(s: string) {
  return s.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim()
}

function parseItems(text: string): OrderItem[] {
  const items: OrderItem[] = []
  const seen = new Set<string>()

  const lines = text.split(/[\n\r]+/).map(normLine).filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // "2 × Hyderabad Chicken Biryani $17.99" or "2x Samosa $5.99"
    const mA = line.match(/^(\d{1,2})\s*[×x×]\s+(.{4,60}?)\s+\$(\d{1,3}(?:\.\d{2})?)$/i)
    if (mA) {
      const qty = parseInt(mA[1]), name = mA[2].trim(), price = parseFloat(mA[3])
      const key = name.toLowerCase()
      if (qty >= 1 && qty <= 20 && price > 0 && price < 300 && !seen.has(key)) {
        seen.add(key); items.push({ name, qty, price })
      }
      continue
    }

    // "2 Item Name $17.99" (space-separated, starts with digit then capital)
    const mB = line.match(/^(\d{1,2})\s+([A-Z].{3,55}?)\s+\$(\d{1,3}\.\d{2})$/)
    if (mB) {
      const qty = parseInt(mB[1]), name = mB[2].trim(), price = parseFloat(mB[3])
      const key = name.toLowerCase()
      if (qty >= 1 && qty <= 20 && price > 0 && price < 300 && !seen.has(key)) {
        seen.add(key); items.push({ name, qty, price })
      }
      continue
    }

    // Price-only line — item name on previous line
    const mP = line.match(/^\$(\d{1,3}\.\d{2})$/)
    if (mP && i >= 1) {
      const price = parseFloat(mP[1])
      const nameLine = lines[i - 1]
      const mQ = nameLine.match(/^(\d{1,2})\s+(.{4,60})$/)
      if (mQ) {
        const qty = parseInt(mQ[1]), name = mQ[2].trim(), key = name.toLowerCase()
        if (qty >= 1 && qty <= 20 && price > 0 && price < 300 && !seen.has(key)) {
          seen.add(key); items.push({ name, qty, price })
        }
      } else if (nameLine.length >= 4 && nameLine.length <= 60 && /^[A-Z]/.test(nameLine)) {
        const key = nameLine.toLowerCase()
        if (!seen.has(key) && price > 0 && price < 300) {
          seen.add(key); items.push({ name: nameLine, qty: 1, price })
        }
      }
    }
  }

  return items
}

export async function fetchOrderItemsFromEmail(params: {
  platform: 'doordash' | 'ubereats' | 'grubhub' | 'other'
  orderDate: string   // YYYY-MM-DD (Chicago business day)
  total: number
  customerName?: string | null
}): Promise<OrderItem[] | null> {
  const auth = await getValidGmailClient()
  if (!auth) return null

  const gmail = google.gmail({ version: 'v1', auth })

  const senderMap: Record<string, string> = {
    doordash: 'from:doordash.com',
    ubereats:  '(from:uber.com OR from:ubereats.com)',
    grubhub:  'from:grubhub.com',
    other:    '',
  }
  const senderQ = senderMap[params.platform]
  if (!senderQ) return null

  const base = new Date(params.orderDate + 'T12:00:00Z')
  const after  = new Date(base); after.setDate(after.getDate() - 1)
  const before = new Date(base); before.setDate(before.getDate() + 2)
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '/')

  const query = `${senderQ} after:${fmt(after)} before:${fmt(before)}`

  let messages: any[] = []
  try {
    const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 30 })
    messages = listRes.data.messages || []
  } catch { return null }

  if (!messages.length) return null

  const totalStr = params.total.toFixed(2)

  for (const msg of messages) {
    try {
      const full = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' })
      const text = extractBodyText(full.data.payload)

      if (!text.includes(totalStr)) continue

      const items = parseItems(text)
      if (items.length > 0) return items

      return []  // email matched total but couldn't parse items
    } catch { /* skip malformed */ }
  }

  return null  // no matching email found
}
