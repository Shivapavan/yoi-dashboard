import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getStaffSchedule, type StaffEntry, type ShiftValue } from '@/lib/schedule'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PARSE_PROMPT = `Look at this weekly staff schedule image. Extract each employee's schedule for every day of the week.

Return ONLY a valid JSON object — no markdown, no explanation, just the JSON:
{
  "staff": [
    {
      "name": "Employee Name",
      "schedule": {
        "Mon": "5-10 PM",
        "Tue": "Off",
        "Wed": null,
        "Thu": "5-10 PM",
        "Fri": "5-10:30 PM",
        "Sat": ["9:15 AM-3 PM", "5-10 PM"],
        "Sun": "Off"
      }
    }
  ]
}

Rules:
- Use null for empty/dash/blank cells (no shift info)
- Use "Off" exactly for days marked Off
- For a single shift use a string: "5-10 PM"
- For two shifts in one day use an array: ["9:15 AM-3 PM", "5-10 PM"]
- Keep shift times exactly as shown (e.g. "6 PM-Close", "11:30 AM-4 PM", "6:30 PM-Close")
- Include every employee row visible in the image`

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  let t = ''
  for (let i = 0; i < 28; i++) t += chars[Math.floor(Math.random() * chars.length)]
  return t
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Image must be JPEG, PNG, GIF or WebP' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PARSE_PROMPT },
        ],
      }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    // Strip any markdown code fences if Claude added them
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const parsed = JSON.parse(jsonStr) as { staff: Array<{ name: string; schedule: Record<string, ShiftValue> }> }

    if (!Array.isArray(parsed.staff)) throw new Error('Unexpected response shape')

    // Preserve tokens for matched employees, generate new ones for new staff
    const existing = await getStaffSchedule()
    const staff: StaffEntry[] = parsed.staff.map(p => {
      const match = existing.find(e => e.name.toLowerCase() === p.name.toLowerCase())
      return {
        name: p.name,
        token: match?.token ?? generateToken(),
        schedule: p.schedule,
      }
    })

    return NextResponse.json({ staff })
  } catch (err) {
    console.error('[parse-schedule]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
