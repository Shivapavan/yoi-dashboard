import { getDb } from '@/lib/db'
import { fetchLiveDayMetrics, fetchLiveCardBreakdown, fetchVoidDetail, centralTzOffset } from '@/lib/lighthouse'

export interface DailyMetrics {
  grossSales: number
  netSales: number
  taxes: number
  voids: number
  discounts: number
  cashPayments: number
  creditCardPayments: number
  openTickets: number
  cashRefund?: number
  voidDetails?: any[]
  cashDetails?: any[]
  orderTypes?: any[]
  processingDetail?: any
}

export async function ensureDailyDataTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS daily_data (
      date        DATE PRIMARY KEY,
      metrics     JSONB NOT NULL,
      scraped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export async function getDailyData(date: string): Promise<DailyMetrics | null> {
  await ensureDailyDataTable()
  const sql = getDb()
  const rows = await sql`SELECT metrics FROM daily_data WHERE date = ${date}`
  return rows.length > 0 ? (rows[0].metrics as DailyMetrics) : null
}

// Fetch one business day from Lighthouse and store it. Returns the metrics if
// successful, or null if Lighthouse couldn't provide data (typical for "yesterday"
// before their batch processing finalizes ~mid-morning).
export async function scrapeAndStoreDay(date: string): Promise<DailyMetrics | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid date format')

  const [y, m, d] = date.split('-').map(Number)
  const nextStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0]
  const start = `${date}T04:00:00${centralTzOffset(date)}`
  const end   = `${nextStr}T03:59:59${centralTzOffset(nextStr)}`

  // financial-overview (per-metric GET) works for the current business day with
  // our session token; activity-summary (POST) currently 401s for both today and
  // past dates, so we avoid it. Card breakdown also uses activity-summary but is
  // best-effort — if it fails, we still save the totals.
  const [live, breakdown, rawVoids] = await Promise.all([
    fetchLiveDayMetrics(date),
    fetchLiveCardBreakdown(date).catch(() => null),
    fetchVoidDetail(start, end).catch(() => []),
  ])

  if (!live || !(live.grossSales > 0 || live.netSales > 0)) {
    return null
  }

  // Sanity check: financial-overview returns 0 for any sub-fetch that failed
  // silently. If we have meaningful sales but tax came back zero, the data is
  // probably partial — bail rather than store a broken snapshot that overwrites
  // tonight's eventual correct snapshot.
  const looksPartial = live.netSales > 100 && live.taxes === 0
  if (looksPartial) return null

  const cashRows = breakdown?.rows.filter((r: any) => /^cash/i.test(r.label.trim())) ?? []
  const cashPayments = cashRows.length
    ? cashRows.reduce((s: number, r: any) => s + r.amount, 0)
    : live.cashPayments
  const cashRefund = cashRows.filter((r: any) => r.amount < 0).reduce((s: number, r: any) => s + Math.abs(r.amount), 0)
  const creditCardPayments = breakdown ? Math.max(0, breakdown.total - cashPayments) : live.creditCardPayments

  const taxes = live.taxes
  const grossSales = Math.max(live.netSales + taxes, live.grossSales)

  const metrics: DailyMetrics = {
    grossSales,
    netSales: live.netSales,
    taxes,
    voids: live.voids,
    discounts: live.discounts,
    cashPayments,
    creditCardPayments,
    openTickets: live.openTickets,
    cashRefund,
    voidDetails: rawVoids,
    cashDetails: [],
    orderTypes: [],
    processingDetail: breakdown ? {
      windowLabel: `${date.slice(5).replace('-', '/')} 12:00AM – 11:59PM CDT`,
      historical: false,
      rows: [
        { label: 'Total Sales', amount: breakdown.total, bold: true },
        ...breakdown.rows.map((r: any) => ({ label: r.label, amount: r.amount })),
      ],
    } : null,
  }

  await ensureDailyDataTable()
  const sql = getDb()
  await sql`
    INSERT INTO daily_data (date, metrics, scraped_at, updated_at)
    VALUES (${date}, ${JSON.stringify(metrics)}, NOW(), NOW())
    ON CONFLICT (date) DO UPDATE
      SET metrics = EXCLUDED.metrics, updated_at = NOW()
  `
  return metrics
}
