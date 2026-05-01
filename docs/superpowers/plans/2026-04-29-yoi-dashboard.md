# YOI Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js dashboard for Yum of India that pulls daily Shift4 payment data and displays disputes, end-of-day metrics, sales trends, and top items — branded in YOI purple and gold.

**Architecture:** Next.js App Router with server-side API routes that call the Shift4 REST API using Basic Auth (API secret key). The browser never touches the API key. Client components fetch from our own `/api/*` routes. Deployed to Vercel.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Vercel, Shift4 REST API (api.shift4.com)

---

## ⚠️ Before You Start — Get Your Shift4 API Key

The email/password in `.env.local` is your Lighthouse web portal login. For API access you need your **Shift4 Secret API Key** (format: `sk_live_xxxx` or `sk_test_xxxx`).

To get it:
1. Log in at https://lh.shift4.com
2. Go to **Settings → API Keys**
3. Copy your **Secret Key**
4. Add it to `.env.local`:
```
SHIFT4_SECRET_KEY=sk_live_your_key_here
```

---

## File Map

```
YOI-Dashboard/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── .env.local                          ← Add SHIFT4_SECRET_KEY here
├── .env.example                        ← Safe template
├── app/
│   ├── layout.tsx                      ← Root layout, YOI font + metadata
│   ├── globals.css                     ← Tailwind base + YOI CSS variables
│   ├── page.tsx                        ← Main dashboard page (Server Component)
│   ├── api/
│   │   ├── disputes/route.ts           ← GET /api/disputes → Shift4 disputes
│   │   ├── end-of-day/route.ts         ← GET /api/end-of-day?date=YYYY-MM-DD
│   │   ├── sales-trend/route.ts        ← GET /api/sales-trend?days=30
│   │   └── top-items/route.ts          ← GET /api/top-items?date=YYYY-MM-DD
│   └── components/
│       ├── Header.tsx                  ← YOI logo + "Yum Shift4 Daily Dashboard"
│       ├── DisputeAlert.tsx            ← Red alert banner with dispute table
│       ├── MetricCard.tsx              ← Colored-border stat card
│       ├── DatePicker.tsx              ← Date input + Today button
│       ├── TabNav.tsx                  ← End of Day / Sales Trend / Top Items tabs
│       ├── Dashboard.tsx               ← Client Component — state + tab switching
│       └── tabs/
│           ├── EndOfDay.tsx            ← 8 metric cards grid
│           ├── SalesTrend.tsx          ← Daily sales bar chart (7/30/90 days)
│           └── TopItems.tsx            ← Ranked list of top menu items
├── lib/
│   └── shift4.ts                       ← Shift4 API client (auth + fetch helpers)
└── types/
    └── shift4.ts                       ← TypeScript interfaces for API responses
```

---

## Task 1: Scaffold the Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `app/globals.css`, `app/layout.tsx`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/shiva/claude_projects/YOI-Dashboard
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*" --yes
```

Expected output: "Success! Created YOI-Dashboard"

- [ ] **Step 2: Install dependencies**

```bash
npm install recharts
npm install -D @types/node
```

- [ ] **Step 3: Update `.env.example`**

Replace contents of `.env.example`:
```
SHIFT4_SECRET_KEY=sk_live_your_secret_key_here
```

Add to `.env.local`:
```
SHIFT4_SECRET_KEY=sk_live_your_secret_key_here
```

- [ ] **Step 4: Set up CSS variables in `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --yoi-purple: #5B21B6;
  --yoi-purple-light: #EDE9FE;
  --yoi-gold: #B8860B;
  --yoi-gold-light: #FEF3C7;
  --yoi-bg: #F5F5F5;
}

body {
  background-color: var(--yoi-bg);
  font-family: system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 5: Set up `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Yum of India — Daily Dashboard',
  description: 'Shift4 daily sales dashboard for Yum of India',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Server running at http://localhost:3000 with no errors.

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Next.js project for YOI Dashboard"
```

---

## Task 2: TypeScript Types + Shift4 API Client

**Files:**
- Create: `types/shift4.ts`
- Create: `lib/shift4.ts`

- [ ] **Step 1: Create `types/shift4.ts`**

```typescript
export interface Shift4Dispute {
  id: string
  created: number
  updated: number
  amount: number
  currency: string
  status: string
  reason: string
  charge: string
  acceptedAsLost: boolean
  evidence?: {
    customerName?: string
    customerEmail?: string
  }
  card?: {
    last4: string
    brand: string
  }
  merchantDetails?: {
    employeeName?: string
  }
}

export interface Shift4Charge {
  id: string
  created: number
  amount: number
  currency: string
  captured: boolean
  refunded: boolean
  status: string
  paymentMethod?: string
  tip?: number
  tax?: number
  discount?: number
  card?: {
    last4: string
    brand: string
    type: string
  }
  metadata?: Record<string, string>
}

export interface EndOfDayMetrics {
  grossSales: number
  netSales: number
  taxes: number
  voids: number
  cashPayments: number
  creditCardPayments: number
  discounts: number
  openTickets: number
}

export interface SalesTrendDay {
  date: string
  grossSales: number
  netSales: number
  transactionCount: number
}

export interface TopItem {
  name: string
  count: number
  revenue: number
}
```

- [ ] **Step 2: Create `lib/shift4.ts`**

```typescript
const SHIFT4_BASE = 'https://api.shift4.com'

function getAuthHeader(): string {
  const key = process.env.SHIFT4_SECRET_KEY
  if (!key) throw new Error('SHIFT4_SECRET_KEY not set in environment')
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64')
}

async function shift4Fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${SHIFT4_BASE}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    next: { revalidate: 0 }, // always fresh
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Shift4 API error ${res.status}: ${err}`)
  }
  return res.json()
}

export async function fetchDisputes(since90Days: number) {
  return shift4Fetch<{ list: any[] }>('/disputes', {
    'created[gte]': String(since90Days),
    limit: '100',
  })
}

export async function fetchChargesForDate(dateStr: string) {
  // dateStr: YYYY-MM-DD
  const start = new Date(dateStr)
  start.setHours(0, 0, 0, 0)
  const end = new Date(dateStr)
  end.setHours(23, 59, 59, 999)

  return shift4Fetch<{ list: any[] }>('/charges', {
    'created[gte]': String(Math.floor(start.getTime() / 1000)),
    'created[lte]': String(Math.floor(end.getTime() / 1000)),
    limit: '100',
  })
}

export async function fetchChargesForRange(startDate: string, endDate: string) {
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(23, 59, 59, 999)

  return shift4Fetch<{ list: any[] }>('/charges', {
    'created[gte]': String(Math.floor(start.getTime() / 1000)),
    'created[lte]': String(Math.floor(end.getTime() / 1000)),
    limit: '100',
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run type-check 2>/dev/null || npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add types/shift4.ts lib/shift4.ts
git commit -m "feat: add Shift4 API client and TypeScript types"
```

---

## Task 3: Disputes API Route

**Files:**
- Create: `app/api/disputes/route.ts`

- [ ] **Step 1: Create `app/api/disputes/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { fetchDisputes } from '@/lib/shift4'
import { Shift4Dispute } from '@/types/shift4'

export async function GET() {
  try {
    const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60
    const data = await fetchDisputes(ninetyDaysAgo)

    // Filter to "Notification of Dispute" equivalent statuses
    const active = (data.list || []).filter((d: Shift4Dispute) =>
      ['CHARGEBACK_NEW', 'RETRIEVAL_REQUEST_NEW'].includes(d.status)
    )

    return NextResponse.json({
      disputes: active,
      count: active.length,
      lastScanned: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Test the endpoint**

```bash
curl http://localhost:3000/api/disputes
```

Expected: `{"disputes":[...],"count":N,"lastScanned":"..."}` — even if count is 0, no 500 error.

- [ ] **Step 3: Commit**

```bash
git add app/api/disputes/route.ts
git commit -m "feat: add disputes API route"
```

---

## Task 4: End-of-Day API Route

**Files:**
- Create: `app/api/end-of-day/route.ts`

- [ ] **Step 1: Create `app/api/end-of-day/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { fetchChargesForDate } from '@/lib/shift4'
import { EndOfDayMetrics, Shift4Charge } from '@/types/shift4'

function centsToFloat(cents: number): number {
  return Math.round(cents) / 100
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) {
    return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })
  }

  try {
    const data = await fetchChargesForDate(date)
    const charges: Shift4Charge[] = data.list || []

    const metrics: EndOfDayMetrics = {
      grossSales: 0,
      netSales: 0,
      taxes: 0,
      voids: 0,
      cashPayments: 0,
      creditCardPayments: 0,
      discounts: 0,
      openTickets: 0,
    }

    for (const charge of charges) {
      if (!charge.captured && !charge.refunded) {
        metrics.openTickets += centsToFloat(charge.amount)
        continue
      }
      if (charge.refunded) {
        metrics.voids += centsToFloat(charge.amount)
        continue
      }

      metrics.grossSales += centsToFloat(charge.amount)
      metrics.taxes += centsToFloat(charge.tax || 0)
      metrics.discounts += centsToFloat(charge.discount || 0)

      const net = charge.amount - (charge.tax || 0) - (charge.discount || 0)
      metrics.netSales += centsToFloat(net)

      if (charge.paymentMethod === 'CASH') {
        metrics.cashPayments += centsToFloat(charge.amount)
      } else {
        metrics.creditCardPayments += centsToFloat(charge.amount)
      }
    }

    return NextResponse.json({ date, metrics })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Test the endpoint**

```bash
curl "http://localhost:3000/api/end-of-day?date=$(date +%Y-%m-%d)"
```

Expected: `{"date":"YYYY-MM-DD","metrics":{"grossSales":...}}`

- [ ] **Step 3: Commit**

```bash
git add app/api/end-of-day/route.ts
git commit -m "feat: add end-of-day metrics API route"
```

---

## Task 5: Sales Trend + Top Items API Routes

**Files:**
- Create: `app/api/sales-trend/route.ts`
- Create: `app/api/top-items/route.ts`

- [ ] **Step 1: Create `app/api/sales-trend/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { fetchChargesForRange } from '@/lib/shift4'
import { SalesTrendDay, Shift4Charge } from '@/types/shift4'

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get('days') || '30')

  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)

  const endStr = end.toISOString().split('T')[0]
  const startStr = start.toISOString().split('T')[0]

  try {
    const data = await fetchChargesForRange(startStr, endStr)
    const charges: Shift4Charge[] = data.list || []

    // Group by date
    const byDate: Record<string, { grossSales: number; netSales: number; count: number }> = {}

    for (const charge of charges) {
      if (!charge.captured) continue
      const date = new Date(charge.created * 1000).toISOString().split('T')[0]
      if (!byDate[date]) byDate[date] = { grossSales: 0, netSales: 0, count: 0 }
      byDate[date].grossSales += charge.amount / 100
      byDate[date].netSales += (charge.amount - (charge.tax || 0) - (charge.discount || 0)) / 100
      byDate[date].count++
    }

    const trend: SalesTrendDay[] = Object.entries(byDate)
      .map(([date, vals]) => ({
        date,
        grossSales: Math.round(vals.grossSales * 100) / 100,
        netSales: Math.round(vals.netSales * 100) / 100,
        transactionCount: vals.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({ days, trend })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `app/api/top-items/route.ts`**

Note: Shift4 API doesn't expose item-level line data in the standard charges endpoint. This route returns what's available from charge metadata. If item-level data is needed, it must come from your POS integration (SkyTab). For now we return top servers by revenue as a placeholder that can be replaced.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { fetchChargesForDate } from '@/lib/shift4'
import { Shift4Charge } from '@/types/shift4'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]

  try {
    const data = await fetchChargesForDate(date)
    const charges: Shift4Charge[] = data.list || []

    // Group by server (employee) from metadata
    const byServer: Record<string, { count: number; revenue: number }> = {}

    for (const charge of charges) {
      if (!charge.captured) continue
      const server = charge.metadata?.employeeName || charge.merchantDetails?.employeeName || 'Unknown'
      if (!byServer[server]) byServer[server] = { count: 0, revenue: 0 }
      byServer[server].count++
      byServer[server].revenue += charge.amount / 100
    }

    const ranked = Object.entries(byServer)
      .map(([name, vals]) => ({ name, count: vals.count, revenue: Math.round(vals.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue)

    return NextResponse.json({ date, items: ranked })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/sales-trend/route.ts app/api/top-items/route.ts
git commit -m "feat: add sales trend and top items API routes"
```

---

## Task 6: UI Components

**Files:**
- Create: `app/components/Header.tsx`
- Create: `app/components/MetricCard.tsx`
- Create: `app/components/DisputeAlert.tsx`
- Create: `app/components/DatePicker.tsx`
- Create: `app/components/TabNav.tsx`

- [ ] **Step 1: Create `app/components/Header.tsx`**

```tsx
export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/yum_logo.png" alt="Yum of India" className="h-10 w-auto" />
        <span className="text-lg font-semibold text-gray-800">Yum Shift4 Daily Dashboard</span>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Copy logo to public folder**

```bash
cp /Users/shiva/Downloads/YumOfIndia_QR_Project/01_Logo/yum_logo.png /Users/shiva/claude_projects/YOI-Dashboard/public/yum_logo.png
```

- [ ] **Step 3: Create `app/components/MetricCard.tsx`**

```tsx
interface MetricCardProps {
  label: string
  value: number
  borderColor: string
}

export default function MetricCard({ label, value, borderColor }: MetricCardProps) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)

  return (
    <div
      className="bg-white rounded-lg p-5 shadow-sm"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{formatted}</p>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/components/DisputeAlert.tsx`**

```tsx
'use client'

interface Dispute {
  id: string
  created: number
  amount: number
  card?: { last4: string; brand: string }
  merchantDetails?: { employeeName?: string }
  evidence?: { customerName?: string }
}

interface DisputeAlertProps {
  disputes: Dispute[]
  count: number
  lastScanned: string
}

export default function DisputeAlert({ disputes, count, lastScanned }: DisputeAlertProps) {
  if (count === 0) return null

  const scannedAt = new Date(lastScanned).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="border border-red-300 rounded-lg bg-red-50 p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-red-600 font-bold text-sm uppercase tracking-wide">
          ⚠️ Disputed Transactions
        </span>
        <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Scanned last 90 days · Event Status = Notification of Dispute · Last scanned {scannedAt}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase text-red-700 font-semibold border-b border-red-200">
            <th className="text-left py-1 pr-4">Date</th>
            <th className="text-left py-1 pr-4">Transaction ID</th>
            <th className="text-left py-1 pr-4">Customer</th>
            <th className="text-left py-1 pr-4">Card</th>
            <th className="text-left py-1 pr-4">Server</th>
            <th className="text-left py-1 pr-4">Amount</th>
            <th className="text-left py-1">Receipt</th>
          </tr>
        </thead>
        <tbody>
          {disputes.map((d) => (
            <tr key={d.id} className="border-b border-red-100 last:border-0">
              <td className="py-2 pr-4 text-gray-700">
                {new Date(d.created * 1000).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </td>
              <td className="py-2 pr-4 text-gray-700">{d.id}</td>
              <td className="py-2 pr-4 text-gray-700">
                {d.evidence?.customerName || `CARDHOLDER/${d.card?.brand?.toUpperCase() || 'UNKNOWN'}`}
              </td>
              <td className="py-2 pr-4 text-gray-700">*{d.card?.last4 || '????'}</td>
              <td className="py-2 pr-4 text-gray-700">
                {d.merchantDetails?.employeeName || '—'}
              </td>
              <td className="py-2 pr-4 font-semibold text-red-700">
                ${(d.amount / 100).toFixed(2)}
              </td>
              <td className="py-2">
                <a
                  href={`https://lh.shift4.com/disputes/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-red-700 transition-colors"
                >
                  Open in Shift4
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Create `app/components/DatePicker.tsx`**

```tsx
'use client'

interface DatePickerProps {
  value: string
  onChange: (date: string) => void
}

export default function DatePicker({ value, onChange }: DatePickerProps) {
  const today = new Date().toISOString().split('T')[0]
  const isToday = value === today

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">📅 Date:</span>
      <input
        type="date"
        value={value}
        max={today}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      <button
        onClick={() => onChange(today)}
        className="bg-gray-900 text-white text-sm font-semibold px-4 py-1.5 rounded hover:bg-gray-700 transition-colors"
      >
        Today
      </button>
      {isToday && (
        <span className="text-sm font-semibold text-gray-700 ml-auto">Today&apos;s data</span>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Create `app/components/TabNav.tsx`**

```tsx
'use client'

export type Tab = 'end-of-day' | 'sales-trend' | 'top-items'

interface TabNavProps {
  active: Tab
  onChange: (tab: Tab) => void
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'end-of-day', label: 'End of Day' },
  { id: 'sales-trend', label: 'Sales Trend' },
  { id: 'top-items', label: 'Top Items' },
]

export default function TabNav({ active, onChange }: TabNavProps) {
  return (
    <div className="flex gap-6 border-b border-gray-200 mb-6">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`pb-3 text-sm font-medium transition-colors ${
            active === tab.id
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add app/components/
git commit -m "feat: add UI components (Header, MetricCard, DisputeAlert, DatePicker, TabNav)"
```

---

## Task 7: End of Day Tab + Sales Trend Tab + Top Items Tab

**Files:**
- Create: `app/components/tabs/EndOfDay.tsx`
- Create: `app/components/tabs/SalesTrend.tsx`
- Create: `app/components/tabs/TopItems.tsx`

- [ ] **Step 1: Create `app/components/tabs/EndOfDay.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import MetricCard from '../MetricCard'
import DatePicker from '../DatePicker'
import { EndOfDayMetrics } from '@/types/shift4'

const CARDS = [
  { key: 'grossSales',         label: 'Gross Sales',          color: '#3B82F6' },
  { key: 'netSales',           label: 'Net Sales',            color: '#22C55E' },
  { key: 'taxes',              label: 'Taxes',                color: '#F59E0B' },
  { key: 'voids',              label: 'Voids',                color: '#EF4444' },
  { key: 'cashPayments',       label: 'Cash Payments',        color: '#16A34A' },
  { key: 'creditCardPayments', label: 'Credit Card Payments', color: '#7C3AED' },
  { key: 'discounts',          label: 'Discounts',            color: '#EC4899' },
  { key: 'openTickets',        label: 'Open Tickets',         color: '#0891B2' },
] as const

const EMPTY: EndOfDayMetrics = {
  grossSales: 0, netSales: 0, taxes: 0, voids: 0,
  cashPayments: 0, creditCardPayments: 0, discounts: 0, openTickets: 0,
}

export default function EndOfDay() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [metrics, setMetrics] = useState<EndOfDayMetrics>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/end-of-day?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setMetrics(d.metrics)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [date])

  return (
    <div>
      <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
        <DatePicker value={date} onChange={setDate} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
        {CARDS.map(({ key, label, color }) => (
          <MetricCard key={key} label={label} value={metrics[key]} borderColor={color} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/components/tabs/SalesTrend.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { SalesTrendDay } from '@/types/shift4'

const RANGES = [7, 30, 90]

export default function SalesTrend() {
  const [days, setDays] = useState(30)
  const [trend, setTrend] = useState<SalesTrendDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/sales-trend?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setTrend(d.trend)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [days])

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setDays(r)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              days === r
                ? 'bg-purple-700 text-white'
                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {r} days
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className={`bg-white rounded-lg p-6 shadow-sm transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
        {trend.length === 0 && !loading ? (
          <p className="text-center text-gray-400 py-12">No sales data for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={trend} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { dateStyle: 'medium' })}
              />
              <Bar dataKey="grossSales" name="Gross Sales" fill="#5B21B6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="netSales" name="Net Sales" fill="#B8860B" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/components/tabs/TopItems.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import DatePicker from '../DatePicker'

interface ServerStat {
  name: string
  count: number
  revenue: number
}

export default function TopItems() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [items, setItems] = useState<ServerStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/top-items?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setItems(d.items)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [date])

  return (
    <div>
      <div className="bg-white rounded-lg p-4 mb-6 shadow-sm">
        <DatePicker value={date} onChange={setDate} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className={`bg-white rounded-lg shadow-sm transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
        {items.length === 0 && !loading ? (
          <p className="text-center text-gray-400 py-12">No data for this date.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold">
                <th className="text-left px-6 py-3">#</th>
                <th className="text-left px-6 py-3">Server</th>
                <th className="text-left px-6 py-3">Transactions</th>
                <th className="text-right px-6 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.name} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-400 font-mono">{i + 1}</td>
                  <td className="px-6 py-3 font-medium text-gray-800">{item.name}</td>
                  <td className="px-6 py-3 text-gray-600">{item.count}</td>
                  <td className="px-6 py-3 text-right font-semibold text-gray-900">
                    ${item.revenue.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/components/tabs/
git commit -m "feat: add EndOfDay, SalesTrend, TopItems tab components"
```

---

## Task 8: Dashboard Client Component + Main Page

**Files:**
- Create: `app/components/Dashboard.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create `app/components/Dashboard.tsx`**

```tsx
'use client'

import { useState } from 'react'
import TabNav, { Tab } from './TabNav'
import EndOfDay from './tabs/EndOfDay'
import SalesTrend from './tabs/SalesTrend'
import TopItems from './tabs/TopItems'

interface DashboardProps {
  disputes: any[]
  disputeCount: number
  lastScanned: string
}

export default function Dashboard({ disputes, disputeCount, lastScanned }: DashboardProps) {
  const [tab, setTab] = useState<Tab>('end-of-day')

  return (
    <div>
      <TabNav active={tab} onChange={setTab} />
      {tab === 'end-of-day' && <EndOfDay />}
      {tab === 'sales-trend' && <SalesTrend />}
      {tab === 'top-items' && <TopItems />}
    </div>
  )
}
```

- [ ] **Step 2: Update `app/page.tsx`**

```tsx
import Header from './components/Header'
import DisputeAlert from './components/DisputeAlert'
import Dashboard from './components/Dashboard'

async function getDisputes() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/disputes`, {
      cache: 'no-store',
    })
    return res.json()
  } catch {
    return { disputes: [], count: 0, lastScanned: new Date().toISOString() }
  }
}

export default async function Home() {
  const { disputes, count, lastScanned } = await getDisputes()

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-6">
        <DisputeAlert disputes={disputes} count={count} lastScanned={lastScanned} />
        <Dashboard disputes={disputes} disputeCount={count} lastScanned={lastScanned} />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Add `NEXT_PUBLIC_BASE_URL` to `.env.local`**

```
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

- [ ] **Step 4: Verify full dashboard renders**

```bash
npm run dev
```

Open http://localhost:3000 — expect header with YOI logo, disputes section (empty or with data), and 3-tab dashboard with metric cards.

- [ ] **Step 5: Commit**

```bash
git add app/components/Dashboard.tsx app/page.tsx
git commit -m "feat: assemble main dashboard page with all components"
```

---

## Task 9: Deploy to Vercel

- [ ] **Step 1: Create GitHub repo and push**

```bash
git remote add origin https://github.com/YOUR_USERNAME/yoi-dashboard.git
git push -u origin main
```

- [ ] **Step 2: Deploy to Vercel**

```bash
npm i -g vercel
vercel --yes
```

Follow prompts: link to existing project or create new. Choose your account.

- [ ] **Step 3: Add environment variables in Vercel**

Go to https://vercel.com → Your Project → Settings → Environment Variables. Add:

```
SHIFT4_SECRET_KEY = sk_live_your_key_here
NEXT_PUBLIC_BASE_URL = https://your-project.vercel.app
```

- [ ] **Step 4: Redeploy with env vars**

```bash
vercel --prod
```

- [ ] **Step 5: Verify production URL works**

Open the Vercel URL — full dashboard should load with live Shift4 data.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: production-ready YOI Dashboard deployed to Vercel"
git push
```

---

## ⚠️ Important Notes

1. **API Key vs Password**: The `.env.local` currently has your web portal email/password. You still need to add `SHIFT4_SECRET_KEY` (your Shift4 API secret key from Settings → API Keys in the Lighthouse portal).

2. **Top Items**: Shift4's standard API does not expose individual menu item data. The Top Items tab currently shows by server/employee. True item-level data requires a SkyTab POS integration — this can be upgraded later.

3. **Pagination**: The API routes currently fetch up to 100 charges per request. High-volume days may need pagination — add a `hasMore` loop if needed.
