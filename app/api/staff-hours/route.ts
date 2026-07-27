import { NextRequest, NextResponse } from 'next/server'
import { fetchEmployeeShifts, centralTzOffset } from '@/lib/lighthouse'
import { getPaidAmounts, setPaidAmount } from '@/lib/staff-payments'

// The middleware bypasses /api/staff-hours entirely (the public payroll page
// needs it), so this route implements its own access check: either a valid
// main-app session OR the correct ?slug=… param matching STAFF_HOURS_PUBLIC_SLUG.
// Same pattern as /api/events/bookings. Marking something "Paid" is reachable
// from this same public link by design — there's no separate admin gate for it.
function getStaffHoursPublicSlug(): string | null {
  const s = process.env.STAFF_HOURS_PUBLIC_SLUG?.trim()
  return s ? s : null
}

function authorized(req: NextRequest): boolean {
  if (req.cookies.get('yoi_session')?.value) return true
  const provided = req.nextUrl.searchParams.get('slug')
  const expected = getStaffHoursPublicSlug()
  return !!expected && !!provided && provided === expected
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function weekSunday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d.toISOString().split('T')[0]
}

// Real pay cycle is semi-monthly (1st–15th, 16th–end of month), not calendar weeks.
function semiMonthPeriod(dateStr: string): { start: string; end: string } {
  const [y, m] = dateStr.split('-').map(Number)
  const monthPrefix = dateStr.slice(0, 7)
  const day = Number(dateStr.slice(8, 10))
  if (day <= 15) {
    return { start: `${monthPrefix}-01`, end: `${monthPrefix}-15` }
  }
  const lastDay = new Date(y, m, 0).getDate() // day 0 of next month = last day of this month
  return { start: `${monthPrefix}-16`, end: `${monthPrefix}-${String(lastDay).padStart(2, '0')}` }
}

const EXCLUDED = new Set(['Randy', 'Samantha', 'Sindhu'])

// Same rate table as app/components/tabs/EmpShdt.tsx (the admin Staff tab) —
// kept in sync manually since this route serves the public read-only view.
// The $/hr rate itself is never returned — only the computed dollar amount.
const DEFAULT_HOURLY_RATE = 10
const EMPLOYEE_RATES: Record<string, number> = { janu: 10.5 }
function rateFor(employee: string): number {
  return EMPLOYEE_RATES[employee.trim().toLowerCase()] ?? DEFAULT_HOURLY_RATE
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const param = req.nextUrl.searchParams.get('param') || ''
  if (param && !/^\d{4}-\d{2}-\d{2}$/.test(param)) {
    return NextResponse.json({ error: 'Invalid param format' }, { status: 400 })
  }
  const view = req.nextUrl.searchParams.get('view') === 'semimonthly' ? 'semimonthly' : 'weekly'

  const today = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  let startDate: string
  let endDate: string
  if (view === 'semimonthly') {
    const period = semiMonthPeriod(param || today)
    startDate = period.start
    endDate = period.end
  } else {
    startDate = weekSunday(param || today)
    endDate = addDays(startDate, 6)
  }
  const effectiveEnd = endDate > today ? today : endDate

  const startOffset = centralTzOffset(startDate)
  const businessEndDate = addDays(effectiveEnd, 1)
  const businessEndOffset = centralTzOffset(businessEndDate)

  const [shifts, paidAmounts] = await Promise.all([
    fetchEmployeeShifts(
      `${startDate}T04:00:00${startOffset}`,
      `${businessEndDate}T03:59:59${businessEndOffset}`
    ),
    getPaidAmounts(startDate, endDate).catch((): Record<string, number> => ({})),
  ])

  const grouped: Record<string, {
    employee: string
    totalHours: number
    shifts: Array<{ date: string; start: string; end: string; hours: number }>
  }> = {}

  for (const s of shifts) {
    if (EXCLUDED.has(s.employee)) continue
    if (!grouped[s.employee]) grouped[s.employee] = { employee: s.employee, totalHours: 0, shifts: [] }
    grouped[s.employee].totalHours += s.hoursWorked
    grouped[s.employee].shifts.push({
      date: s.start.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }),
      start: s.start.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' }),
      end: s.end.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' }),
      hours: Math.round(s.hoursWorked * 100) / 100,
    })
  }

  const employees = Object.values(grouped)
    .map((e) => {
      const totalHours = Math.round(e.totalHours * 100) / 100
      const pay = Math.round(totalHours * rateFor(e.employee) * 100) / 100
      const paid = Math.round((paidAmounts[e.employee] ?? 0) * 100) / 100
      const balance = Math.round((pay - paid) * 100) / 100
      return { ...e, totalHours, pay, paid, balance }
    })
    .sort((a, b) => b.totalHours - a.totalHours)

  const totalHours = Math.round(employees.reduce((s, e) => s + e.totalHours, 0) * 100) / 100
  const totalPay = Math.round(employees.reduce((s, e) => s + e.pay, 0) * 100) / 100
  const totalPaid = Math.round(employees.reduce((s, e) => s + e.paid, 0) * 100) / 100
  const totalBalance = Math.round((totalPay - totalPaid) * 100) / 100

  return NextResponse.json(
    { startDate, endDate, view, employees, totalHours, totalPay, totalPaid, totalBalance },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { employee, periodStart, periodEnd, paidAmount } = body ?? {}
  if (typeof employee !== 'string' || !employee.trim()) {
    return NextResponse.json({ error: 'employee is required' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return NextResponse.json({ error: 'periodStart and periodEnd (YYYY-MM-DD) are required' }, { status: 400 })
  }
  const amount = Number(paidAmount)
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'paidAmount must be a non-negative number' }, { status: 400 })
  }

  await setPaidAmount(employee, periodStart, periodEnd, amount)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
