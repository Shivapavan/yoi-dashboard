# CLAUDE.md — YOI Dashboard

## Domain Rules (authoritative — read these first)
@.claude/rules/frontend.md
@.claude/rules/api.md
@.claude/rules/data.md

## Project Overview

**Yum of India — Shift4 Daily Dashboard**

A web dashboard for Yum of India restaurant (McKinney, TX) that pulls daily transaction and sales data from Shift4 (payment processor) and displays it with automatic daily refresh.

- **Restaurant site:** https://www.yumofindiamckinney.com
- **QR Menu:** https://yoi-qr-code.netlify.app
- **Tagline:** Pure · Authentic · Indian

---

## Brand Identity

- **Primary color:** Teal `#0D9488` (token `yoi-primary`)
- **Accent color:** Amber `#D97706` (token `yoi-accent`)
- **Alert color:** Red `#DC2626` (token `danger`)
- **Logo:** `/yum_logo.png` (purple wordmark with brushstroke circle — intentionally kept purple)
- **Font style:** Clean, professional — matches existing dashboard aesthetic

> Detailed, current standards live in `.claude/rules/` (imported below). Some sections further down in this file are historical and may be out of date — the rules files are authoritative.

---

## What This Dashboard Does

Replicates and improves the "Yum Shift4 Daily Dashboard" previously built as a Claude artifact. Connects to the Shift4 API to show restaurant owners their daily financial summary.

### Three Tabs
1. **End of Day** — Daily financial snapshot (default view)
2. **Sales Trend** — Charts showing sales over time
3. **Top Items** — Best-selling menu items

### End of Day Metrics (8 cards)
| Metric | Color Accent |
|---|---|
| Gross Sales | Blue |
| Net Sales | Green |
| Taxes | Gold/Orange |
| Voids | Red |
| Cash Payments | Green |
| Credit Card Payments | Purple |
| Discounts | Pink/Magenta |
| Open Tickets | Teal |

### Disputed Transactions Alert
- Shown at top when disputes exist
- Pulls last 90 days, filters by `Event Status = Notification of Dispute`
- Table: Date · Transaction ID · Auth · Customer · Card · Server · Amount · "Open in Shift4" button
- Last scanned timestamp shown

---

## Tech Stack

- **Framework:** Next.js (App Router)
- **Hosting:** Vercel
- **Data source:** Shift4 API
- **Styling:** Tailwind CSS
- **Language:** TypeScript

---

## Security Rules

- Shift4 API key goes in `.env.local` as `SHIFT4_API_KEY` — NEVER in client code
- All Shift4 API calls made from Next.js API routes (server-side only)
- `.env.local` must be in `.gitignore`
- Never log API keys or transaction data to console

---

## Key Files (once built)

```
app/
├── page.tsx                  # Main dashboard page
├── api/
│   ├── end-of-day/route.ts   # Shift4 end-of-day data
│   ├── disputes/route.ts     # Disputed transactions
│   ├── sales-trend/route.ts  # Sales over time
│   └── top-items/route.ts    # Top selling items
├── components/
│   ├── MetricCard.tsx        # Colored border stat card
│   ├── DisputeAlert.tsx      # Red alert banner
│   ├── DatePicker.tsx        # Date selector with Today button
│   └── tabs/
│       ├── EndOfDay.tsx
│       ├── SalesTrend.tsx
│       └── TopItems.tsx
assets/
└── yum_logo.png
.env.local                    # SHIFT4_API_KEY (never commit)
.env.example                  # Template with placeholder keys
```

---

## Development Commands

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run type-check
```

---

## Environment Variables

```bash
# .env.local
SHIFT4_API_KEY=your_shift4_secret_key_here
```

---

## Shift4 API Notes

- Base URL: `https://api.shift4.com`
- Auth: HTTP Basic — API key as username, empty password
- Disputes endpoint: `GET /disputes?created[gte]=<90daysago>`
- Charges endpoint: `GET /charges?created[gte]=<start>&created[lte]=<end>`
- All amounts returned in cents — divide by 100 for display

---

## Design Reference

The original dashboard (Claude artifact) had:
- Light gray background (`#f5f5f5`)
- White cards with colored left border (4px)
- Uppercase small-caps labels above large dollar amounts
- Red alert box with orange border for disputes
- Tab navigation with blue underline on active tab
