# Table Reservation Bot — Design Spec
**Date:** 2026-07-09  
**Project:** YOI Dashboard (yumofindiamckinney.com)  
**Status:** Approved for implementation

---

## Overview

A Claude Haiku-powered chat widget embedded on the Yum of India restaurant website that lets customers reserve a table through natural conversation. Reservations are saved to the existing `event_bookings` database and appear in a new **Table Reservations** tab in the YOI Dashboard for the owner to manage.

---

## Architecture

```
[yumofindiamckinney.com]          [YOI Dashboard / Vercel]
  Shift4 website editor      →     /api/public/reservations  (POST, public)
  <script> embed tag               ↓
  Chat widget (JS + CSS)           event_bookings table (Neon PostgreSQL)
  Claude Haiku API call            ↓
                                   /app/components/tabs/TableReservations.tsx
                                   (new tab, owner-only, authenticated)
```

---

## Components

### 1. Chat Widget (public-facing)

**File:** `public/reservation-widget.js` + `public/reservation-widget.css`

A self-contained JavaScript widget that injects itself into any page via a single `<script>` tag:

```html
<script src="https://yoi-dashboard.vercel.app/reservation-widget.js"></script>
```

**UI:**
- Floating button bottom-right: `🍽️ Reserve a Table` (teal, matches YOI brand)
- Opens a chat panel (360×520px) with YOI logo header
- Message bubbles (bot = teal left, customer = gray right)
- Text input + Send button at bottom
- "Powered by Yum of India" footer

**Conversation flow:**
1. Bot greets: *"Hi! I'm here to help you reserve a table at Yum of India. Tell me your name, preferred date, time, party size, and phone number — or just describe what you need!"*
2. Customer responds (one message or multiple)
3. Haiku extracts: `name`, `date` (YYYY-MM-DD), `time`, `party_size`, `phone`, `notes`
4. Bot confirms: *"Confirming: Table for [N] on [Date] at [Time] for [Name] ([phone]). Any special requests?"*
5. Customer confirms / adds notes
6. Widget POSTs to `/api/public/reservations`
7. Bot shows success: *"You're all set! We'll see you [Date]. ✅ We'll call to confirm."*

**Error states:**
- API failure → "Something went wrong. Please call us at [phone] or try again."
- Missing fields after 2 exchanges → bot asks specifically for each missing field
- Date in the past → bot asks for a future date

---

### 2. Claude Haiku API Integration (inside widget)

**Model:** `claude-haiku-4-5-20251001`

**System prompt** (strict, single-purpose):
```
You are a table reservation assistant for Yum of India restaurant in McKinney, TX.
Your ONLY job is to collect reservation details and confirm the booking.
Do NOT discuss anything else.

Collect exactly these fields:
- name (customer's full name)
- date (specific date, convert "this Saturday" etc. to YYYY-MM-DD)
- time (e.g. "7:00 PM")
- party_size (number of people)
- phone (10-digit US number)
- notes (optional: dietary needs, occasion, special requests)

When you have all required fields (name, date, time, party_size, phone), respond with a JSON block:
{"action":"confirm","name":"...","date":"YYYY-MM-DD","time":"...","party_size":N,"phone":"...","notes":"..."}

If fields are missing, ask conversationally for only what's missing.
Today's date is {TODAY}.
Restaurant hours: Tue–Sun 11 AM – 9:30 PM. Closed Mondays.
```

**Conversation state:** Held in memory (JS array) for the session. Not persisted.

**API call:** Made client-side from the widget directly to Anthropic API using a **publishable/restricted key** scoped to Haiku only — OR proxied through `/api/public/chat` to keep the key server-side (recommended).

> **Recommended:** Proxy through `/api/public/chat` so the Anthropic API key stays server-side.

---

### 3. Public Reservations API

**File:** `app/api/public/reservations/route.ts`

- **Method:** POST only
- **Auth:** None (public endpoint)
- **Rate limit:** 5 requests per IP per hour (via in-memory Map or Upstash Redis)
- **Validates:** name, date (valid future date), time, party_size (1–50), phone (10 digits)
- **Saves to:** `event_bookings` table with:
  - `status = 'Tentative'`
  - `handled_by = 'chat-bot'`
- **Returns:** `{ success: true, bookingId: "..." }` or `{ error: "..." }`

**File:** `app/api/public/chat/route.ts`

- **Method:** POST only
- **Auth:** None (public proxy)
- **Rate limit:** 10 requests per IP per hour
- **Body:** `{ messages: [{role, content}][], today: string }`
- **Calls:** Anthropic API with Haiku, injects today's date into system prompt
- **Returns:** Claude's response text

---

### 4. Table Reservations Tab (YOI Dashboard)

**File:** `app/components/tabs/TableReservations.tsx`

New tab in the existing dashboard tab navigation, authenticated (owner-only).

**UI layout:**
- Summary row: `[Total Today] [Pending Confirmation] [This Week]`
- Filter bar: Date range | Status (All / Tentative / Confirmed / Cancelled)
- Reservation table:

| Date | Time | Name | Party | Phone | Status | Notes | Actions |
|------|------|------|-------|-------|--------|-------|---------|
| Jul 12 | 7:00 PM | Priya S. | 4 | 972-555-1234 | Tentative | Jain dishes | Confirm · Cancel |

- **Confirm** → updates status to `Confirmed`, sends SMS confirmation to customer (optional, Phase 2)
- **Cancel** → updates status to `NotAvailable` (reuses existing status)
- **New reservation button** → opens inline form for phone reservations (reuses existing `BookingForm`)
- Filtered to only show bookings where `handled_by = 'chat-bot'` (all chat-bot bookings, regardless of date)

**Tab navigation entry:** Added to `app/components/TabNav.tsx` as `Table Reservations`

---

### 5. Widget Embed on Shift4 Website

The owner pastes one line into the Shift4 website editor's custom HTML block:

```html
<script src="https://yoi-dashboard-production.vercel.app/reservation-widget.js" defer></script>
```

(Exact URL confirmed after first Vercel deploy of the widget file.)

The widget self-initializes, injects its own CSS, and attaches to `document.body`. No other setup required.

---

## Data Model

Uses existing `event_bookings` table — no schema changes needed.

| Field | Value for chat-bot reservations |
|---|---|
| `date` | YYYY-MM-DD from conversation |
| `name` | Customer name |
| `party_size` | Number of guests |
| `start_time` | e.g. "7:00 PM" |
| `phone` | Customer phone |
| `status` | `Tentative` (owner confirms manually) |
| `notes` | Special requests |
| `handled_by` | `chat-bot` |

---

## Security

- Anthropic API key stays server-side in `/api/public/chat` — never exposed to browser
- Public endpoints rate-limited by IP
- Input validated and sanitized before DB write
- No PII logged to console
- CORS on public endpoints restricted to `yumofindiamckinney.com` and `localhost`

---

## Environment Variables (new)

```bash
# .env.local additions
ANTHROPIC_API_KEY=sk-ant-...          # New — Anthropic key for Haiku, server-side only
```

---

## Out of Scope (Phase 2)

- SMS confirmation to customer after booking
- Availability checking (e.g. max covers per time slot)
- Voice bot (Option B — separate project)
- Online payment / deposit
- Email notifications to owner

---

## Implementation Order

1. `/api/public/chat` proxy endpoint
2. `/api/public/reservations` POST endpoint  
3. `public/reservation-widget.js` + CSS
4. `TableReservations` tab component
5. Wire tab into `TabNav`
6. Test embed on staging, then paste script into Shift4 editor
