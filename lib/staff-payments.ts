import { getDb } from '@/lib/db'

// Tracks how much has actually been paid out per employee per pay period
// (either a Monday-Sunday week or a semi-monthly half-month). Editable from
// the public staff-hours link — there's no login gate on that page, so this
// table only ever stores a dollar amount + who/when, nothing more sensitive.
export async function ensureStaffPaymentsTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS staff_payments (
      employee     TEXT NOT NULL,
      period_start DATE NOT NULL,
      period_end   DATE NOT NULL,
      paid_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (employee, period_start, period_end)
    )
  `
}

export async function getPaidAmounts(periodStart: string, periodEnd: string): Promise<Record<string, number>> {
  await ensureStaffPaymentsTable()
  const sql = getDb()
  const rows = await sql`
    SELECT employee, paid_amount FROM staff_payments
    WHERE period_start = ${periodStart} AND period_end = ${periodEnd}
  `
  const result: Record<string, number> = {}
  for (const row of rows as any[]) {
    result[row.employee] = Number(row.paid_amount)
  }
  return result
}

export async function setPaidAmount(
  employee: string,
  periodStart: string,
  periodEnd: string,
  paidAmount: number
): Promise<void> {
  await ensureStaffPaymentsTable()
  const sql = getDb()
  await sql`
    INSERT INTO staff_payments (employee, period_start, period_end, paid_amount, updated_at)
    VALUES (${employee}, ${periodStart}, ${periodEnd}, ${paidAmount}, NOW())
    ON CONFLICT (employee, period_start, period_end) DO UPDATE
      SET paid_amount = EXCLUDED.paid_amount, updated_at = NOW()
  `
}
