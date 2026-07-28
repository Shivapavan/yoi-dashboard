import { getDb } from '@/lib/db'

// Tracks whether an employee has been marked paid for a pay period (either a
// Sunday-Saturday week or a semi-monthly half-month). Editable from the public
// staff-hours link — there's no login gate on that page, so this table only
// ever stores a dollar amount + a lock flag + who/when, nothing more sensitive.
// Once locked, the amount is fixed at the full pay for that period — marking
// paid always closes out the balance to $0, it doesn't support partial pay.
export async function ensureStaffPaymentsTable() {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS staff_payments (
      employee     TEXT NOT NULL,
      period_start DATE NOT NULL,
      period_end   DATE NOT NULL,
      paid_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
      locked       BOOLEAN NOT NULL DEFAULT false,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (employee, period_start, period_end)
    )
  `
  await sql`ALTER TABLE staff_payments ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false`
}

export interface PaymentRecord {
  paidAmount: number
  locked: boolean
}

export async function getPayments(periodStart: string, periodEnd: string): Promise<Record<string, PaymentRecord>> {
  await ensureStaffPaymentsTable()
  const sql = getDb()
  const rows = await sql`
    SELECT employee, paid_amount, locked FROM staff_payments
    WHERE period_start = ${periodStart} AND period_end = ${periodEnd}
  `
  const result: Record<string, PaymentRecord> = {}
  for (const row of rows as any[]) {
    result[row.employee] = { paidAmount: Number(row.paid_amount), locked: Boolean(row.locked) }
  }
  return result
}

export async function setPayment(
  employee: string,
  periodStart: string,
  periodEnd: string,
  paidAmount: number,
  locked: boolean
): Promise<void> {
  await ensureStaffPaymentsTable()
  const sql = getDb()
  await sql`
    INSERT INTO staff_payments (employee, period_start, period_end, paid_amount, locked, updated_at)
    VALUES (${employee}, ${periodStart}, ${periodEnd}, ${paidAmount}, ${locked}, NOW())
    ON CONFLICT (employee, period_start, period_end) DO UPDATE
      SET paid_amount = EXCLUDED.paid_amount, locked = EXCLUDED.locked, updated_at = NOW()
  `
}
