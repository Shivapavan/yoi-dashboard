import { NextRequest, NextResponse } from 'next/server'
import { fetchEmployeeShifts, centralTzOffset } from '@/lib/lighthouse'

// The middleware bypasses /api/staff-hours entirely (the public payroll page
// needs it), so this route implements its own access check: either a valid
// main-app session OR the correct ?slug=… param matching STAFF_HOURS_PUBLIC_SLUG.
// Same pattern as /api/events/bookings.
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

function weekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().split('T')[0]
}

const EXCLUDED = new Set(['Randy', 'Samantha', 'Sindhu'])

// Aggregate-only — kept out of the per-employee response so the public page
// can show a grand total without exposing each employee's rate or pay.
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

  const today = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  const startDate = weekMonday(param || today)
  const endDate = addDays(startDate, 6)
  const effectiveEnd = endDate > today ? today : endDate

  const startOffset = centralTzOffset(startDate)
  const businessEndDate = addDays(effectiveEnd, 1)
  const businessEndOffset = centralTzOffset(businessEndDate)

  const shifts = await fetchEmployeeShifts(
    `${startDate}T04:00:00${startOffset}`,
    `${businessEndDate}T03:59:59${businessEndOffset}`
  )

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
    .map((e) => ({ ...e, totalHours: Math.round(e.totalHours * 100) / 100 }))
    .sort((a, b) => b.totalHours - a.totalHours)

  const totalHours = Math.round(employees.reduce((s, e) => s + e.totalHours, 0) * 100) / 100
  const totalPay = Math.round(
    employees.reduce((s, e) => s + e.totalHours * rateFor(e.employee), 0) * 100
  ) / 100

  return NextResponse.json(
    { startDate, endDate, employees, totalHours, totalPay },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
