import { getDb } from '@/lib/db'

// Populated by scripts/restcall/sync-analytics.mjs (GitHub Actions cron).
// Separate from daily_data (Lighthouse/Shift4) — RestCall covers AI-phone-order
// revenue processed through Stripe Terminal, a channel Lighthouse never sees.
export async function ensureRestcallDataTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS restcall_daily_data (
      date        DATE PRIMARY KEY,
      metrics     JSONB NOT NULL,
      scraped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export interface RestcallBreakdown {
  revenue: number
  netSales: number
  taxes: number
  discounts: number
  cashPayments: number
  creditCardPayments: number
}

const EMPTY_BREAKDOWN: RestcallBreakdown = {
  revenue: 0, netSales: 0, taxes: 0, discounts: 0, cashPayments: 0, creditCardPayments: 0,
}

// RestCall has no equivalent of Voids or Open Tickets — those stay Lighthouse-only.
// Payment channel can include both "Cash" and card-terminal rows (confirmed against
// real data: most days are 100% "Stripe Terminal", but some days include a "Cash" row
// too), so Cash/Credit Card Payments are split by summing that channel breakdown
// rather than assuming everything is card.
export async function getRestcallBreakdown(date: string): Promise<RestcallBreakdown> {
  await ensureRestcallDataTable()
  const sql = getDb()
  const rows = await sql`SELECT metrics FROM restcall_daily_data WHERE date = ${date}`
  if (rows.length === 0) return EMPTY_BREAKDOWN

  const metrics = rows[0].metrics as any
  const financials = metrics?.financials ?? {}
  const channels: Array<{ dimension?: string; value?: string; revenue?: number }> = metrics?.channels ?? []
  const paymentRows = channels.filter((c) => c.dimension === 'Payment')
  const cashPayments = paymentRows
    .filter((c) => c.value === 'Cash')
    .reduce((s, c) => s + (c.revenue ?? 0), 0)
  const creditCardPayments = paymentRows
    .filter((c) => c.value !== 'Cash')
    .reduce((s, c) => s + (c.revenue ?? 0), 0)

  return {
    revenue: typeof metrics?.summary?.revenue === 'number' ? metrics.summary.revenue : 0,
    netSales: typeof financials.netItemSales === 'number' ? financials.netItemSales : 0,
    taxes: typeof financials.taxes === 'number' ? financials.taxes : 0,
    discounts: (financials.discounts ?? 0) + (financials.cashDiscounts ?? 0),
    cashPayments,
    creditCardPayments,
  }
}
