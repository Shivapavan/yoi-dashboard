import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const rateLimits = new Map<string, number[]>()
const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX = 20

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (rateLimits.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  hits.push(now)
  rateLimits.set(ip, hits)
  return hits.length > RATE_MAX
}

const ALLOWED_ORIGINS = [
  'https://yumofindiamckinney.com',
  'https://www.yumofindiamckinney.com',
]

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost')
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req)
  const ip = getIp(req)

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers })
  }

  let body: { messages?: unknown; today?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400, headers })
  }
  if (body.messages.length > 30) {
    return NextResponse.json({ error: 'Conversation too long' }, { status: 400, headers })
  }

  const today = typeof body.today === 'string' ? body.today : new Date().toISOString().slice(0, 10)

  const systemPrompt = `You are a warm, friendly table reservation assistant for Yum of India restaurant in McKinney, TX.

CRITICAL RULES:
- Ask ONLY ONE question at a time. Never list multiple questions.
- Do NOT use any markdown formatting — no asterisks, no bullet points, no dashes, no bold.
- Keep every reply short (1-3 sentences max).
- Be conversational and warm, like a friendly host.

Your job: collect these fields one by one:
1. name (full name)
2. date (convert "tomorrow", "this Saturday" etc. to YYYY-MM-DD)
3. time (e.g. "7:00 PM")
4. party_size (number of guests, 1–50)
5. phone (10-digit US number)
6. notes (optional — dietary needs, occasion, high chair)

Once you have name, date, time, party_size, and phone — output ONLY this JSON, nothing else:
{"action":"confirm","name":"...","date":"YYYY-MM-DD","time":"...","party_size":N,"phone":"...","notes":"..."}

Rules before confirming:
- Date must be ${today} or later
- Party size must be 1–50
- Phone must contain 10 digits

If something is invalid, warmly ask only for that one thing again.
If asked about food, hours, or anything else, say: "I can only help with reservations — for other questions please call us at (972) 547-9300!"

Restaurant info:
- Yum of India, 1480 S Independence Pkwy Suite 280, McKinney TX
- Phone: (469) 310-4969
- Hours: Mon–Thu 10 AM–3 PM and 5–11 PM · Fri 10 AM–3 PM and 5 PM–1 AM · Sat 10 AM–3 PM and 5 PM–12 AM · Sun 10 AM–3 PM and 5–10 PM
- Today: ${today}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: body.messages as Anthropic.MessageParam[],
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ reply }, { headers })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/public/chat]', msg)
    return NextResponse.json({ error: 'AI service temporarily unavailable' }, { status: 502, headers })
  }
}
