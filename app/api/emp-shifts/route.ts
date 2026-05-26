import { NextRequest, NextResponse } from 'next/server'
import { fetchEmployeeShifts } from '@/lib/lighthouse'
import { centralTzOffset } from '@/lib/lighthouse'

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

export async function GET(req: NextRequest) {
  const view  = req.nextUrl.searchParams.get('view')  || 'weekly'
  const param = req.nextUrl.searchParams.get('param') || ''

  if (param && !/^\d{4}-\d{2}(-\d{2})?$/.test(param))
    return NextResponse.json({ error: 'Invalid param format' }, { status: 400 })

  let startDate: string
  let endDate:   string

  const today = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  if (view === 'daily') {
    startDate = param || today
    endDate   = startDate
  } else if (view === 'weekly') {
    startDate = weekMonday(param || today)
    endDate   = addDays(startDate, 6)
  } else {
    // monthly
    const month = param || today.slice(0, 7)
    const [y, m] = month.split('-').map(Number)
    startDate = `${month}-01`
    endDate   = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  }

  const startOffset = centralTzOffset(startDate)

  // Cap the end date at today — Lighthouse API rejects future end dates
  const effectiveEnd   = endDate > today ? today : endDate
  const businessEndDate   = addDays(effectiveEnd, 1)
  const businessEndOffset = centralTzOffset(businessEndDate)

  const shifts = await fetchEmployeeShifts(
    `${startDate}T04:00:00${startOffset}`,
    `${businessEndDate}T03:59:59${businessEndOffset}`
  )

  // Group by employee
  const grouped: Record<string, {
    employee: string
    totalHours: number
    shifts: Array<{ date: string; start: string; end: string; hours: number; cash: number; credit: number }>
  }> = {}

  const EXCLUDED = new Set(['Randy', 'Samantha', 'Sindhu'])

  for (const s of shifts) {
    if (EXCLUDED.has(s.employee)) continue
    if (!grouped[s.employee]) {
      grouped[s.employee] = { employee: s.employee, totalHours: 0, shifts: [] }
    }
    grouped[s.employee].totalHours += s.hoursWorked
    grouped[s.employee].shifts.push({
      date:   s.start.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }),
      start:  s.start.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' }),
      end:    s.end.toLocaleTimeString('en-US',   { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' }),
      hours:  Math.round(s.hoursWorked * 100) / 100,
      cash:   s.cashPayments,
      credit: s.creditPayments,
    })
  }

  const employees = Object.values(grouped)
    .map((e) => ({ ...e, totalHours: Math.round(e.totalHours * 100) / 100 }))
    .sort((a, b) => b.totalHours - a.totalHours)

  return NextResponse.json({
    view, startDate, endDate, employees,
    totalHours: Math.round(employees.reduce((s, e) => s + e.totalHours, 0) * 100) / 100,
  })
}
