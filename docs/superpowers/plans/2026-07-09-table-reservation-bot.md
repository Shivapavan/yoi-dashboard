# Table Reservation Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Claude Haiku-powered chat widget to yumofindiamckinney.com that lets customers reserve tables, saving bookings to the YOI Dashboard via a new "Table Reservations" tab.

**Architecture:** A self-contained JS widget (`public/reservation-widget.js`) on the Shift4 website calls `/api/public/chat` (Haiku proxy) to drive conversation, then POSTs the collected reservation to `/api/public/reservations` (unauthenticated, rate-limited). Both public endpoints write to the existing `event_bookings` Neon table with `handled_by = 'chat-bot'`. A new `TableReservations` tab in the dashboard shows these bookings for the owner to confirm or cancel.

**Tech Stack:** Next.js 15 App Router, TypeScript, `@anthropic-ai/sdk`, Neon PostgreSQL, Tailwind CSS, vanilla JS widget (no framework, embeds anywhere via `<script>` tag).

## Global Constraints

- TypeScript strict mode — no `any` unless casting external API responses
- All Anthropic API calls server-side only — key never in browser
- Public endpoints (`/api/public/*`) need no auth cookie — rate-limited by IP (5 req/hr for reservations, 20 req/hr for chat)
- CORS on public endpoints: allow `https://yumofindiamckinney.com` and `http://localhost:*`
- `handled_by = 'chat-bot'` on all widget-created bookings — used to filter in the new tab
- Haiku model: `claude-haiku-4-5-20251001`
- Status for new bookings: `Tentative` always
- No schema changes to `event_bookings` — existing table is sufficient
- Phone stored as-is (string, user-provided format)
- Date validation: must be a valid future date (today or later in Chicago timezone)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `@anthropic-ai/sdk` |
| `app/api/public/chat/route.ts` | Create | Haiku proxy — keeps API key server-side |
| `app/api/public/reservations/route.ts` | Create | Public unauthenticated booking endpoint |
| `public/reservation-widget.js` | Create | Self-contained chat widget, embeds via `<script>` |
| `app/components/tabs/TableReservations.tsx` | Create | Dashboard tab — view/confirm/cancel chat-bot bookings |
| `app/components/TabNav.tsx` | Modify | Add `'table-reservations'` to `Tab` type and tab list |
| `app/components/Dashboard.tsx` | Modify | Import and render `TableReservations` tab |
| `.env.local` | Modify | Add `ANTHROPIC_API_KEY` |
| `.env.example` | Modify | Add `ANTHROPIC_API_KEY=` placeholder |

---

## Task 1: Install Anthropic SDK and configure env

**Files:**
- Modify: `package.json`
- Modify: `.env.local`
- Modify: `.env.example`

**Interfaces:**
- Produces: `@anthropic-ai/sdk` available for import in Tasks 2+

- [ ] **Step 1: Install the SDK**

```bash
cd /Users/shiva/claude_projects/YOI-Dashboard
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm install @anthropic-ai/sdk
```

Expected: `package.json` now includes `"@anthropic-ai/sdk": "^0.x.x"` in dependencies.

- [ ] **Step 2: Add env var to .env.local**

Open `.env.local` and add at the bottom:

```bash
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```

Get the key from https://console.anthropic.com/settings/keys — create one named `yoi-reservation-bot`.

- [ ] **Step 3: Add placeholder to .env.example**

Open `.env.example` and add at the bottom:

```bash
ANTHROPIC_API_KEY=
```

- [ ] **Step 4: Verify SDK imports cleanly**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm run type-check
```

Expected: No errors related to `@anthropic-ai/sdk`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat: install @anthropic-ai/sdk for reservation bot"
```

---

## Task 2: Public chat proxy endpoint (`/api/public/chat`)

**Files:**
- Create: `app/api/public/chat/route.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk`, `ANTHROPIC_API_KEY` env var
- Produces:
  - `POST /api/public/chat` — accepts `{ messages: {role:'user'|'assistant', content:string}[], today: string }`, returns `{ reply: string }` or `{ error: string }`

- [ ] **Step 1: Create the route file**

Create `app/api/public/chat/route.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// In-memory rate limiter: IP → [timestamps]
const rateLimits = new Map<string, number[]>()
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour
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

  const systemPrompt = `You are a table reservation assistant for Yum of India restaurant in McKinney, TX.
Your ONLY job is to collect reservation details and confirm the booking. Do NOT discuss anything else.
If a customer asks about food, hours, directions, or anything unrelated, politely redirect: "I can only help with table reservations. For other questions, please call us!"

Collect exactly these fields:
- name: customer's full name
- date: specific date (convert "this Saturday", "tomorrow", etc. to YYYY-MM-DD format)
- time: time of reservation (e.g. "7:00 PM")
- party_size: number of people (integer, 1–50)
- phone: US phone number (10 digits, any format accepted)
- notes: optional special requests (dietary needs, occasion, high chair, etc.)

When you have ALL required fields (name, date, time, party_size, phone), output ONLY a JSON block like this — no other text:
{"action":"confirm","name":"...","date":"YYYY-MM-DD","time":"...","party_size":N,"phone":"...","notes":"..."}

Before outputting the JSON, verify:
- date is ${today} or later (never a past date)
- party_size is between 1 and 50
- phone contains 10 digits

If anything is missing or invalid, ask conversationally for only the missing/invalid field(s).

Restaurant details:
- Name: Yum of India, McKinney TX
- Hours: Tuesday–Sunday 11:00 AM – 9:30 PM. Closed Mondays.
- Phone: (972) 547-9300
- Today's date: ${today}

Start with a warm greeting and ask for their reservation details.`

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
```

- [ ] **Step 2: Type-check**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Manual test with curl**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm run dev &
sleep 5

curl -s -X POST http://localhost:3000/api/public/chat \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3001" \
  -d '{"messages":[{"role":"user","content":"Hi I want a table"}],"today":"2026-07-09"}' | jq .
```

Expected: `{ "reply": "..." }` with a greeting asking for reservation details. No error.

- [ ] **Step 4: Kill dev server and commit**

```bash
kill %1 2>/dev/null; true
git add app/api/public/chat/route.ts
git commit -m "feat: add public Haiku chat proxy for reservation bot"
```

---

## Task 3: Public reservations endpoint (`/api/public/reservations`)

**Files:**
- Create: `app/api/public/reservations/route.ts`

**Interfaces:**
- Consumes: `createBooking` from `@/lib/events`, rate limiter pattern from Task 2
- Produces:
  - `POST /api/public/reservations` — accepts `{ name, date, time, party_size, phone, notes? }`, returns `{ success: true, bookingId: string }` or `{ error: string }`

- [ ] **Step 1: Create the route file**

Create `app/api/public/reservations/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createBooking } from '@/lib/events'

// In-memory rate limiter — separate from chat limiter
const rateLimits = new Map<string, number[]>()
const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX = 5

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
    return NextResponse.json({ error: 'Too many reservations from this device. Please call us at (972) 547-9300.' }, { status: 429, headers })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
  }

  // Validate required fields
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
  const date = typeof body.date === 'string' ? body.date : ''
  const time = typeof body.time === 'string' ? body.time.trim().slice(0, 20) : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : ''
  const party_size = parseInt(String(body.party_size ?? ''), 10)
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : null

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400, headers })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400, headers })
  if (!time) return NextResponse.json({ error: 'Time is required' }, { status: 400, headers })
  if (!phone) return NextResponse.json({ error: 'Phone is required' }, { status: 400, headers })
  if (isNaN(party_size) || party_size < 1 || party_size > 50) {
    return NextResponse.json({ error: 'party_size must be 1–50' }, { status: 400, headers })
  }

  // Date must not be in the past (Chicago timezone)
  const chicagoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  if (date < chicagoToday) {
    return NextResponse.json({ error: 'Reservation date must be today or in the future' }, { status: 400, headers })
  }

  try {
    const booking = await createBooking({
      date,
      name,
      party_size,
      start_time: time,
      phone,
      notes: notes || null,
      status: 'Tentative',
      handled_by: 'chat-bot',
    })
    return NextResponse.json({ success: true, bookingId: booking.id }, { headers })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/public/reservations]', msg)
    return NextResponse.json({ error: 'Failed to save reservation. Please call us at (972) 547-9300.' }, { status: 500, headers })
  }
}
```

- [ ] **Step 2: Type-check**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Manual test with curl**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm run dev &
sleep 5

curl -s -X POST http://localhost:3000/api/public/reservations \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3001" \
  -d '{"name":"Test User","date":"2026-08-01","time":"7:00 PM","party_size":4,"phone":"9725551234","notes":"window seat please"}' | jq .
```

Expected: `{ "success": true, "bookingId": "..." }`

Verify in the YOI Dashboard Events Space calendar that the booking appears on August 1.

- [ ] **Step 4: Test validation — past date**

```bash
curl -s -X POST http://localhost:3000/api/public/reservations \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3001" \
  -d '{"name":"Test","date":"2020-01-01","time":"7 PM","party_size":2,"phone":"9725551234"}' | jq .
```

Expected: `{ "error": "Reservation date must be today or in the future" }` with status 400.

- [ ] **Step 5: Kill dev server and commit**

```bash
kill %1 2>/dev/null; true
git add app/api/public/reservations/route.ts
git commit -m "feat: add public reservations API endpoint"
```

---

## Task 4: Chat widget (`public/reservation-widget.js`)

**Files:**
- Create: `public/reservation-widget.js`

**Interfaces:**
- Consumes: `/api/public/chat` (POST), `/api/public/reservations` (POST) — both from Tasks 2 & 3
- Produces: Self-contained script tag embeddable on any website. Auto-detects the API base URL from the script's `src` attribute.

- [ ] **Step 1: Create the widget file**

Create `public/reservation-widget.js`:

```javascript
(function () {
  'use strict';

  // Derive API base from the script tag src
  var scriptEl = document.currentScript ||
    Array.from(document.querySelectorAll('script')).find(function (s) {
      return s.src && s.src.includes('reservation-widget');
    });
  var API_BASE = scriptEl
    ? new URL(scriptEl.src).origin
    : 'https://yoi-dashboard-production.vercel.app';

  var COLORS = {
    teal: '#0D9488',
    tealDark: '#0F766E',
    tealLight: '#CCFBF1',
    gold: '#D97706',
    white: '#FFFFFF',
    gray50: '#F9FAFB',
    gray100: '#F3F4F6',
    gray200: '#E5E7EB',
    gray500: '#6B7280',
    gray700: '#374151',
    gray900: '#111827',
  };

  // ── Inject CSS ──────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#yoi-chat-fab{position:fixed;bottom:24px;right:24px;z-index:9998;',
    'background:' + COLORS.teal + ';color:#fff;border:none;border-radius:28px;',
    'padding:14px 20px;font-size:15px;font-weight:600;cursor:pointer;',
    'box-shadow:0 4px 16px rgba(13,148,136,0.4);',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
    'display:flex;align-items:center;gap:8px;transition:transform .2s,box-shadow .2s;}',

    '#yoi-chat-fab:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(13,148,136,0.5);}',

    '#yoi-chat-panel{position:fixed;bottom:90px;right:24px;z-index:9999;',
    'width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 110px);',
    'background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.18);',
    'display:none;flex-direction:column;overflow:hidden;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',

    '#yoi-chat-panel.yoi-open{display:flex;}',

    '#yoi-chat-header{background:' + COLORS.teal + ';color:#fff;',
    'padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',

    '#yoi-chat-header-title{font-weight:700;font-size:15px;}',
    '#yoi-chat-header-sub{font-size:11px;opacity:.85;margin-top:1px;}',

    '#yoi-chat-close{background:none;border:none;color:#fff;font-size:20px;',
    'cursor:pointer;padding:0 4px;line-height:1;opacity:.8;}',
    '#yoi-chat-close:hover{opacity:1;}',

    '#yoi-chat-messages{flex:1;overflow-y:auto;padding:14px;display:flex;',
    'flex-direction:column;gap:10px;scroll-behavior:smooth;}',

    '.yoi-msg{max-width:82%;padding:10px 13px;border-radius:12px;',
    'font-size:13.5px;line-height:1.5;word-break:break-word;}',

    '.yoi-msg-bot{background:' + COLORS.gray100 + ';color:' + COLORS.gray900 + ';',
    'align-self:flex-start;border-bottom-left-radius:3px;}',

    '.yoi-msg-user{background:' + COLORS.teal + ';color:#fff;',
    'align-self:flex-end;border-bottom-right-radius:3px;}',

    '.yoi-msg-success{background:#D1FAE5;color:#065F46;',
    'align-self:flex-start;border-radius:10px;}',

    '.yoi-msg-error{background:#FEE2E2;color:#991B1B;',
    'align-self:flex-start;border-radius:10px;}',

    '.yoi-typing{display:flex;gap:4px;padding:10px 13px;',
    'background:' + COLORS.gray100 + ';border-radius:12px;border-bottom-left-radius:3px;',
    'align-self:flex-start;}',
    '.yoi-dot{width:7px;height:7px;border-radius:50%;background:' + COLORS.gray500 + ';',
    'animation:yoi-bounce 1.2s infinite;}',
    '.yoi-dot:nth-child(2){animation-delay:.2s;}',
    '.yoi-dot:nth-child(3){animation-delay:.4s;}',
    '@keyframes yoi-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}',

    '#yoi-chat-input-row{display:flex;gap:8px;padding:12px;',
    'border-top:1px solid ' + COLORS.gray200 + ';flex-shrink:0;}',

    '#yoi-chat-input{flex:1;border:1px solid ' + COLORS.gray200 + ';',
    'border-radius:8px;padding:9px 12px;font-size:14px;',
    'font-family:inherit;outline:none;resize:none;',
    'color:' + COLORS.gray900 + ';background:#fff;}',
    '#yoi-chat-input:focus{border-color:' + COLORS.teal + ';}',

    '#yoi-chat-send{background:' + COLORS.teal + ';color:#fff;border:none;',
    'border-radius:8px;padding:9px 14px;font-size:13px;font-weight:600;',
    'cursor:pointer;white-space:nowrap;transition:background .2s;}',
    '#yoi-chat-send:hover{background:' + COLORS.tealDark + ';}',
    '#yoi-chat-send:disabled{opacity:.5;cursor:not-allowed;}',

    '#yoi-chat-footer{text-align:center;font-size:10px;color:' + COLORS.gray500 + ';',
    'padding:4px 0 8px;flex-shrink:0;}',
  ].join('');
  document.head.appendChild(style);

  // ── Build DOM ───────────────────────────────────────────────────────────────
  var fab = document.createElement('button');
  fab.id = 'yoi-chat-fab';
  fab.innerHTML = '🍽️ Reserve a Table';
  fab.setAttribute('aria-label', 'Reserve a table at Yum of India');

  var panel = document.createElement('div');
  panel.id = 'yoi-chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Table reservation chat');
  panel.innerHTML = [
    '<div id="yoi-chat-header">',
    '  <div>',
    '    <div id="yoi-chat-header-title">🍛 Yum of India</div>',
    '    <div id="yoi-chat-header-sub">Reserve a Table · McKinney, TX</div>',
    '  </div>',
    '  <button id="yoi-chat-close" aria-label="Close chat">✕</button>',
    '</div>',
    '<div id="yoi-chat-messages" role="log" aria-live="polite"></div>',
    '<div id="yoi-chat-input-row">',
    '  <textarea id="yoi-chat-input" rows="1" placeholder="Type your message…" aria-label="Message"></textarea>',
    '  <button id="yoi-chat-send">Send</button>',
    '</div>',
    '<div id="yoi-chat-footer">Powered by Yum of India · (972) 547-9300</div>',
  ].join('');

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  // ── State ────────────────────────────────────────────────────────────────────
  var messages = [];   // [{role:'user'|'assistant', content:string}]
  var busy = false;
  var booked = false;

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  var msgList  = document.getElementById('yoi-chat-messages');
  var input    = document.getElementById('yoi-chat-input');
  var sendBtn  = document.getElementById('yoi-chat-send');
  var closeBtn = document.getElementById('yoi-chat-close');

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function addMessage(text, type) {
    // type: 'bot' | 'user' | 'success' | 'error'
    var el = document.createElement('div');
    el.className = 'yoi-msg yoi-msg-' + type;
    el.textContent = text;
    msgList.appendChild(el);
    msgList.scrollTop = msgList.scrollHeight;
    return el;
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'yoi-typing';
    el.id = 'yoi-typing';
    el.innerHTML = '<div class="yoi-dot"></div><div class="yoi-dot"></div><div class="yoi-dot"></div>';
    msgList.appendChild(el);
    msgList.scrollTop = msgList.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('yoi-typing');
    if (el) el.remove();
  }

  function setInputDisabled(val) {
    input.disabled = val;
    sendBtn.disabled = val;
  }

  // ── Parse confirm JSON from bot reply ────────────────────────────────────────
  function parseConfirm(text) {
    var match = text.match(/\{[\s\S]*"action"\s*:\s*"confirm"[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }

  // ── Book the reservation ─────────────────────────────────────────────────────
  function bookReservation(data) {
    return fetch(API_BASE + '/api/public/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        date: data.date,
        time: data.time,
        party_size: data.party_size,
        phone: data.phone,
        notes: data.notes || null,
      }),
    }).then(function (r) { return r.json(); });
  }

  // ── Get today in Chicago ──────────────────────────────────────────────────────
  function getToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  }

  // ── Send user message to Haiku ───────────────────────────────────────────────
  function sendMessage() {
    if (busy || booked) return;
    var text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.rows = 1;
    addMessage(text, 'user');
    messages.push({ role: 'user', content: text });

    busy = true;
    setInputDisabled(true);
    showTyping();

    fetch(API_BASE + '/api/public/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages, today: getToday() }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        hideTyping();

        if (data.error) {
          addMessage('Sorry, something went wrong. Please call us at (972) 547-9300.', 'error');
          busy = false;
          setInputDisabled(false);
          return;
        }

        var reply = data.reply || '';
        var confirm = parseConfirm(reply);

        if (confirm) {
          // Show a human-readable confirmation message
          var dateFormatted = new Date(confirm.date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
          });
          var confirmText = [
            '✅ Reservation confirmed!',
            '',
            '📅 ' + dateFormatted,
            '🕐 ' + confirm.time,
            '👥 Party of ' + confirm.party_size,
            '👤 ' + confirm.name,
            '📞 ' + confirm.phone,
            confirm.notes ? '📝 ' + confirm.notes : '',
            '',
            "We'll call to confirm. See you soon! 🎉",
          ].filter(function (l) { return l !== undefined && (l !== '' || true); }).join('\n').replace(/\n{3,}/g, '\n\n');

          addMessage(confirmText, 'success');
          messages.push({ role: 'assistant', content: reply });

          // Save to dashboard
          bookReservation(confirm).then(function (result) {
            if (!result.success) {
              addMessage(
                'We had trouble saving your reservation online. Please call us at (972) 547-9300 to confirm.',
                'error'
              );
            }
          }).catch(function () {
            addMessage(
              'We had trouble saving your reservation online. Please call us at (972) 547-9300 to confirm.',
              'error'
            );
          });

          booked = true;
          setInputDisabled(true);
          input.placeholder = 'Reservation complete!';
        } else {
          addMessage(reply, 'bot');
          messages.push({ role: 'assistant', content: reply });
          busy = false;
          setInputDisabled(false);
          input.focus();
        }
      })
      .catch(function () {
        hideTyping();
        addMessage('Connection error. Please call us at (972) 547-9300.', 'error');
        busy = false;
        setInputDisabled(false);
      });
  }

  // ── Open chat and greet ───────────────────────────────────────────────────────
  function openChat() {
    panel.classList.add('yoi-open');
    fab.style.display = 'none';

    if (messages.length === 0) {
      busy = true;
      setInputDisabled(true);
      showTyping();

      fetch(API_BASE + '/api/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          today: getToday(),
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          hideTyping();
          var reply = data.reply || "Hi! I'm here to help you reserve a table at Yum of India. What date and time works for you?";
          addMessage(reply, 'bot');
          messages.push({ role: 'user', content: 'Hello' });
          messages.push({ role: 'assistant', content: reply });
          busy = false;
          setInputDisabled(false);
          input.focus();
        })
        .catch(function () {
          hideTyping();
          addMessage("Hi! I'm here to help you reserve a table. What's your name, preferred date, time, and party size?", 'bot');
          busy = false;
          setInputDisabled(false);
        });
    } else {
      input.focus();
    }
  }

  function closeChat() {
    panel.classList.remove('yoi-open');
    fab.style.display = 'flex';
  }

  // ── Event listeners ──────────────────────────────────────────────────────────
  fab.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);
  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input.addEventListener('input', function () {
    this.rows = Math.min(4, (this.value.match(/\n/g) || []).length + 1);
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('yoi-open')) closeChat();
  });
})();
```

- [ ] **Step 2: Test widget loads locally**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm run dev
```

Open http://localhost:3000/reservation-widget.js — should return JavaScript (not a 404).

- [ ] **Step 3: Test widget in browser**

Create a quick test HTML file at `/tmp/widget-test.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Widget Test</title></head>
<body>
  <h1>Widget Test Page</h1>
  <p>The chat button should appear in the bottom right.</p>
  <script src="http://localhost:3000/reservation-widget.js"></script>
</body>
</html>
```

Open `file:///tmp/widget-test.html` in Chrome. Verify:
- ✅ Teal "🍽️ Reserve a Table" button appears bottom-right
- ✅ Clicking opens chat panel
- ✅ Bot greets automatically
- ✅ Typing and pressing Enter sends message
- ✅ Full conversation ends with green success card
- ✅ ✕ closes the panel

- [ ] **Step 4: Commit**

```bash
git add public/reservation-widget.js
git commit -m "feat: add self-contained table reservation chat widget"
```

---

## Task 5: Table Reservations dashboard tab

**Files:**
- Create: `app/components/tabs/TableReservations.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/events/bookings?start=YYYY-MM-DD&end=YYYY-MM-DD` (existing, requires session cookie)
  - `PATCH /api/events/bookings/[id]` (existing)
  - `DELETE /api/events/bookings/[id]` (existing)
- Produces: React component `export default function TableReservations()` — no props

- [ ] **Step 1: Create the component**

Create `app/components/tabs/TableReservations.tsx`:

```typescript
'use client'

import { useCallback, useEffect, useState } from 'react'

interface Booking {
  id: string
  date: string
  name: string
  party_size: number | null
  start_time: string | null
  phone: string | null
  status: 'Tentative' | 'Confirmed' | 'NotAvailable'
  notes: string | null
  handled_by: string | null
  created_at: string
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function StatusBadge({ status }: { status: Booking['status'] }) {
  const styles: Record<Booking['status'], string> = {
    Tentative:    'bg-amber-100 text-amber-800 border border-amber-300',
    Confirmed:    'bg-emerald-100 text-emerald-800 border border-emerald-300',
    NotAvailable: 'bg-red-100 text-red-800 border border-red-300',
  }
  const labels: Record<Booking['status'], string> = {
    Tentative: 'Pending',
    Confirmed: 'Confirmed',
    NotAvailable: 'Cancelled',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

export default function TableReservations() {
  // Show past 7 days → next 90 days
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  const start = (() => { const d = new Date(today); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })()
  const end   = (() => { const d = new Date(today); d.setDate(d.getDate() + 90); return d.toISOString().slice(0, 10) })()

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [filter,   setFilter]   = useState<'all' | 'Tentative' | 'Confirmed' | 'NotAvailable'>('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/events/bookings?start=${start}&end=${end}`, { credentials: 'include', cache: 'no-store' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      const j = await r.json()
      // Filter to chat-bot bookings only
      const chatBot = ((j.bookings ?? []) as Booking[]).filter(b => b.handled_by === 'chat-bot')
      setBookings(chatBot)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => { load() }, [load])

  async function confirm(b: Booking) {
    await fetch(`/api/events/bookings/${b.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'Confirmed' }),
    })
    await load()
  }

  async function cancel(b: Booking) {
    if (!window.confirm(`Cancel reservation for ${b.name}?`)) return
    await fetch(`/api/events/bookings/${b.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'NotAvailable' }),
    })
    await load()
  }

  const visible = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)
  const todayBookings   = bookings.filter(b => b.date === today && b.status !== 'NotAvailable')
  const pendingCount    = bookings.filter(b => b.status === 'Tentative').length
  const thisWeekEnd     = (() => { const d = new Date(today); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) })()
  const weekCount       = bookings.filter(b => b.date >= today && b.date <= thisWeekEnd && b.status !== 'NotAvailable').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-gray-800">Table Reservations</h2>
        <button onClick={load} className="text-xs text-teal-600 hover:text-teal-800 font-medium">
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Today',            value: todayBookings.length, color: 'border-teal-500' },
          { label: 'Pending Confirm',  value: pendingCount,         color: 'border-amber-500' },
          { label: 'Next 7 Days',      value: weekCount,            color: 'border-indigo-500' },
        ].map(c => (
          <div key={c.label} className={`bg-white rounded-lg p-4 shadow-sm border-l-4 ${c.color}`}>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{c.label}</div>
            <div className="text-2xl font-bold text-gray-900">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'Tentative', 'Confirmed', 'NotAvailable'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              filter === f
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'All' : f === 'NotAvailable' ? 'Cancelled' : f}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">{error}</div>
      )}

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading reservations…</p>
        </div>
      )}

      {!loading && visible.length === 0 && !error && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No reservations found.
          <br />
          <span className="text-xs mt-1 block">Bookings from the website chat widget appear here.</span>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Date', 'Time', 'Name', 'Party', 'Phone', 'Status', 'Notes', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(b => (
                  <tr key={b.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{formatDate(b.date)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.start_time ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{b.name}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{b.party_size ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {b.phone
                        ? <a href={`tel:${b.phone}`} className="hover:text-teal-600">{b.phone}</a>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[180px] truncate" title={b.notes ?? ''}>{b.notes || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-2">
                        {b.status === 'Tentative' && (
                          <button
                            onClick={() => confirm(b)}
                            className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 font-medium"
                          >
                            Confirm
                          </button>
                        )}
                        {b.status !== 'NotAvailable' && (
                          <button
                            onClick={() => cancel(b)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Showing chat-bot reservations · {start} – {end}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/tabs/TableReservations.tsx
git commit -m "feat: add TableReservations dashboard tab"
```

---

## Task 6: Wire tab into TabNav and Dashboard

**Files:**
- Modify: `app/components/TabNav.tsx`
- Modify: `app/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `TableReservations` from Task 5
- Produces: `table-reservations` visible as a tab in the dashboard nav

- [ ] **Step 1: Update TabNav.tsx**

In `app/components/TabNav.tsx`, change the `Tab` type and add the tab to `BASE_TABS`:

```typescript
// Change this line:
export type Tab = 'end-of-day' | 'sales-trend' | 'top-items' | 'item-trends' | 'catering' | 'visitors' | 'emp-shdt' | 'expenses' | 'containers' | 'reviews' | 'activity' | 'menu-editor' | 'events-space' | 'instagram' | 'tiktok' | 'local-intel' | 'scraper'

// To:
export type Tab = 'end-of-day' | 'sales-trend' | 'top-items' | 'item-trends' | 'catering' | 'table-reservations' | 'visitors' | 'emp-shdt' | 'expenses' | 'containers' | 'reviews' | 'activity' | 'menu-editor' | 'events-space' | 'instagram' | 'tiktok' | 'local-intel' | 'scraper'
```

In `BASE_TABS`, add the entry after `catering`:

```typescript
const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'end-of-day',          label: 'End of Day' },
  { id: 'sales-trend',         label: 'Sales Trend' },
  { id: 'top-items',           label: 'Top Items' },
  { id: 'item-trends',         label: 'Item Trends' },
  { id: 'catering',            label: 'Catering' },
  { id: 'table-reservations',  label: '🍽️ Table Reservations' },  // ← add this
  { id: 'events-space',        label: 'Events Space' },
  // ... rest unchanged
]
```

- [ ] **Step 2: Update Dashboard.tsx**

Add the import at the top of `app/components/Dashboard.tsx`:

```typescript
import TableReservations from './tabs/TableReservations'
```

Add the render line inside the return, after the Catering div:

```typescript
<div className={tab === 'catering'            ? '' : 'hidden'}><Catering /></div>
<div className={tab === 'table-reservations'  ? '' : 'hidden'}><TableReservations /></div>  {/* ← add */}
<div className={tab === 'events-space'        ? '' : 'hidden'}><EventsSpace /></div>
```

- [ ] **Step 3: Type-check**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
npm run type-check
```

Expected: No errors.

- [ ] **Step 4: Smoke test in browser**

```bash
npm run dev
```

Open http://localhost:3000, log in, and verify:
- ✅ "🍽️ Table Reservations" tab is visible in the tab bar
- ✅ Clicking it shows the reservation table (empty or with test data from Task 3)
- ✅ Bookings created via the widget appear here with status "Pending"
- ✅ "Confirm" button changes status to Confirmed
- ✅ "Cancel" button changes status to Cancelled after confirmation dialog

- [ ] **Step 5: Final commit and deploy**

```bash
git add app/components/TabNav.tsx app/components/Dashboard.tsx
git commit -m "feat: wire Table Reservations tab into dashboard"

export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
cd /Users/shiva/claude_projects/YOI-Dashboard
vercel --prod
```

---

## Task 7: Embed widget on Shift4 website

**Files:** None (manual step in Shift4 editor)

- [ ] **Step 1: Get the deployed widget URL**

After Task 6 deploy, the widget is live at:
```
https://[your-yoi-vercel-domain]/reservation-widget.js
```

Check your Vercel dashboard for the exact production URL.

- [ ] **Step 2: Open Shift4 website editor**

Go to https://shopmanager.s4shops.com/editor

- [ ] **Step 3: Find the Custom HTML block**

In the Shift4 editor, look for an "Embed" or "Custom Code" or "HTML" block in the page elements panel. Drag it to the bottom of any page (or add it site-wide if the editor supports global scripts).

- [ ] **Step 4: Paste the script tag**

```html
<script src="https://YOUR-VERCEL-DOMAIN/reservation-widget.js" defer></script>
```

- [ ] **Step 5: Publish and verify**

Publish changes in the Shift4 editor. Visit https://yumofindiamckinney.com and verify:
- ✅ Teal "🍽️ Reserve a Table" button appears bottom-right
- ✅ Full reservation conversation works end-to-end
- ✅ Booking appears in YOI Dashboard → Table Reservations tab

---

## End-to-End Test Checklist

After all tasks are complete, run through this full flow:

1. Open https://yumofindiamckinney.com
2. Click "🍽️ Reserve a Table"
3. Type: *"Hi, I'd like a table for 2 on August 15th at 7pm, name is Priya, phone 9725550001"*
4. Bot should respond with a confirmation card
5. Open YOI Dashboard → Table Reservations tab
6. Reservation appears with status "Pending"
7. Click "Confirm" — status changes to "Confirmed"
8. Verify booking also appears in Events Space calendar on August 15
