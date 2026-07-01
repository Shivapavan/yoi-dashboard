# Data Rules — YOI Dashboard

## Stores
- `data/dashboard.json` — primary scraped cache. `history[]` entries: `date`, `grossSales`, `netSales`, `taxes`, `discounts`, `voids`, `cashPayments`, `creditCard`, `doordash`, `uberEats`, `stOnline`, `openTickets`, `cardBreakdown`.
- **Neon** (`@neondatabase/serverless`, via `lib/db.ts`) — users, auth, login history.
- **Vercel KV / Edge Config / Blob** — runtime state (review alerts, tokens status, cached assets).
- Google Sheets (via `googleapis`) — catering data ("CAT CAH"), QBO — expenses.

## Business-day rule
- The business day starts at **4 AM CDT**. Before extracting a calendar date from "now", subtract 4 hours, then format in `America/Chicago`. Midnight–3:59 AM belongs to the previous day.

## Partial / missing day handling
- A real open day grosses well over $100. Stored gross `< $100` (or `0`) means a failed/partial scrape — re-pull that day from the live Lighthouse API.
- When backfilling, take the **higher** of stored vs live; never reduce a good stored value.

## Money
- Stored + Lighthouse metric values are in **dollars** — round with `round2`.
- Raw Shift4 charge/dispute amounts are in **cents** — divide by 100 for display.
