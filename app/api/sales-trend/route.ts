import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { centralTzOffset, fetchActivitySummaryData, fetchLiveDayMetrics } from '@/lib/lighthouse'
import { fetchCateringMonthTotal } from '@/lib/google'

function round2(v: number) { return Math.round(v * 100) / 100 }

function weekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get('view') || 'daily'
  const weekParam  = req.nextUrl.searchParams.get('week')
  const monthParam = req.nextUrl.searchParams.get('month')
  const dailyMonth = req.nextUrl.searchParams.get('dailyMonth') // override for daily view

  if (weekParam  && !/^\d{4}-\d{2}-\d{2}$/.test(weekParam))
    return NextResponse.json({ error: 'Invalid week format (YYYY-MM-DD)' }, { status: 400 })
  if (monthParam && !/^\d{4}-\d{2}$/.test(monthParam))
    return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 })
  // lite=true skips the Lighthouse activity-summary API call — returns chart data only
  const lite = req.nextUrl.searchParams.get('lite') === 'true'

  const data = JSON.parse(readFileSync(join(process.cwd(), 'data/dashboard.json'), 'utf8'))
  const history: any[] = (data.history as any[]).filter((h) => h.grossSales > 0)
  // Business day starts at 4 AM CDT — shift back 4 h so midnight–3:59 AM
  // still returns the previous calendar date (previous business day).
  const today = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  // ── DAILY: shows selected month (defaults to previous complete calendar month) ─
  if (view === 'daily') {
    let prevMonthStr: string
    if (dailyMonth && /^\d{4}-\d{2}$/.test(dailyMonth)) {
      prevMonthStr = dailyMonth
    } else {
      const now = new Date()
      const prevMonthNum = now.getMonth() === 0 ? 12 : now.getMonth()
      const prevYear     = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
      prevMonthStr = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`
    }
    const [prevYear, prevMonthNum] = prevMonthStr.split('-').map(Number)
    const firstDay     = `${prevMonthStr}-01`
    const daysInMonth  = new Date(prevYear, prevMonthNum, 0).getDate()
    const lastDay      = `${prevMonthStr}-${String(daysInMonth).padStart(2, '0')}`

    // Build full slot array for every day in month, fill from history
    const historyMap = new Map(
      history.filter(h => h.date >= firstDay && h.date <= lastDay).map(h => [h.date, h])
    )
    const dailySlots = Array.from({ length: daysInMonth }, (_, i) => {
      const dateStr = `${prevMonthStr}-${String(i + 1).padStart(2, '0')}`
      const h = historyMap.get(dateStr)
      return { date: dateStr, label: dateStr, grossSales: h?.grossSales ?? 0, netSales: h?.netSales ?? 0 }
    })

    // Inject live metrics for any zero-slots within the selected period (up to today).
    // Lighthouse's metric API works for any date, so we cover the whole month —
    // not just last 7 days — so views of the current month show all days,
    // even if the scraper hasn't run for some of them.
    const dailyLiveTargets = dailySlots.filter(s => s.grossSales === 0 && s.date <= today)
    if (dailyLiveTargets.length > 0) {
      await Promise.all(dailyLiveTargets.map(async (slot) => {
        try {
          const live = await fetchLiveDayMetrics(slot.date)
          if (live.grossSales > 0) { slot.grossSales = round2(live.grossSales); slot.netSales = round2(live.netSales) }
        } catch { /* keep at 0 */ }
      }))
    }

    // Only show days up to today (no future zeros on chart)
    const trend = dailySlots.filter(s => s.date <= today)

    if (!lite) {
      const startOffset = centralTzOffset(firstDay)
      const endOffset   = centralTzOffset(lastDay)
      const [activityData, cateringData] = await Promise.all([
        fetchActivitySummaryData(`${firstDay}T04:00:00${startOffset}`, `${lastDay}T23:59:00${endOffset}`),
        fetchCateringMonthTotal(prevMonthStr),
      ])
      return NextResponse.json({
        view, trend, periodLabel: prevMonthStr,
        activityData: activityData ?? null,
        cateringCash: cateringData ?? null,
      })
    }
    return NextResponse.json({ view, trend, periodLabel: prevMonthStr, activityData: null, cateringCash: null })
  }

  // ── WEEKLY ─────────────────────────────────────────────────────────────────
  if (view === 'weekly') {
    const mon = weekMonday(weekParam || weekMonday(today))
    const sun = addDays(mon, 6)
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    const slots = Array.from({ length: 7 }, (_, i) => ({
      date: addDays(mon, i),
      label: DAY_NAMES[i],
      grossSales: 0,
      netSales: 0,
    }))

    for (const h of history) {
      const idx = slots.findIndex((s) => s.date === h.date)
      if (idx >= 0) {
        slots[idx].grossSales = round2(h.grossSales)
        slots[idx].netSales = round2(h.netSales)
      }
    }

    // Inject live metrics for any zero-slots within the past 7 days (catches unscraped recent dates)
    const sevenDaysAgo = addDays(today, -7)
    const weekLiveTargets = slots.filter(s => s.grossSales === 0 && s.date <= today && s.date > sevenDaysAgo)
    if (weekLiveTargets.length > 0) {
      await Promise.all(weekLiveTargets.map(async (slot) => {
        try {
          const live = await fetchLiveDayMetrics(slot.date)
          if (live.grossSales > 0) {
            slot.grossSales = round2(live.grossSales)
            slot.netSales   = round2(live.netSales)
          }
        } catch { /* keep at 0 */ }
      }))
    }

    if (!lite) {
      const startOffset = centralTzOffset(mon)
      const endOffset   = centralTzOffset(sun)
      const activityData = await fetchActivitySummaryData(
        `${mon}T04:00:00${startOffset}`,
        `${sun}T23:59:00${endOffset}`
      )
      return NextResponse.json({ view, weekStart: mon, weekEnd: sun, trend: slots, activityData: activityData ?? null })
    }
    return NextResponse.json({ view, weekStart: mon, weekEnd: sun, trend: slots, activityData: null })
  }

  // ── MONTHLY ────────────────────────────────────────────────────────────────
  if (view === 'monthly') {
    const resolvedMonth = monthParam || today.slice(0, 7)
    const [y, m] = resolvedMonth.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const firstDay = `${resolvedMonth}-01`
    const lastDay  = `${resolvedMonth}-${String(daysInMonth).padStart(2, '0')}`

    const slots = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      return {
        date: `${resolvedMonth}-${String(day).padStart(2, '0')}`,
        label: String(day),
        grossSales: 0,
        netSales: 0,
      }
    })

    for (const h of history) {
      if (h.date >= firstDay && h.date <= lastDay) {
        const idx = parseInt(h.date.slice(8)) - 1
        if (idx >= 0 && idx < slots.length) {
          slots[idx].grossSales = round2(h.grossSales)
          slots[idx].netSales = round2(h.netSales)
        }
      }
    }

    // Cover the entire selected month from live API for any zero-slots
    const monthLiveTargets = slots.filter(s => s.grossSales === 0 && s.date <= today)
    if (monthLiveTargets.length > 0) {
      await Promise.all(monthLiveTargets.map(async (slot) => {
        try {
          const live = await fetchLiveDayMetrics(slot.date)
          if (live.grossSales > 0) {
            slot.grossSales = round2(live.grossSales)
            slot.netSales   = round2(live.netSales)
          }
        } catch { /* keep at 0 */ }
      }))
    }

    if (!lite) {
      const startOffset = centralTzOffset(firstDay)
      const endOffset   = centralTzOffset(lastDay)
      const activityData = await fetchActivitySummaryData(
        `${firstDay}T04:00:00${startOffset}`,
        `${lastDay}T23:59:00${endOffset}`
      )
      return NextResponse.json({ view, month: resolvedMonth, trend: slots, activityData: activityData ?? null })
    }
    return NextResponse.json({ view, month: resolvedMonth, trend: slots, activityData: null })
  }

  return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
}
