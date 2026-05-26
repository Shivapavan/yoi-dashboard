import { NextResponse } from 'next/server'
import { readAnalytics } from '@/lib/analytics'

export async function GET() {
  const data = await readAnalytics()

  // Last 7 days total
  const now7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const last7d = Object.entries(data.daily)
    .filter(([d]) => d >= now7d)
    .reduce((s, [, v]) => s + v, 0)

  // Today
  const today = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const todayCount = data.daily[today] ?? 0

  // Top countries (sorted)
  const topCountries = Object.entries(data.countries)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)

  // Daily chart data (last 14 days)
  const now14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const dailyChart = Object.entries(data.daily)
    .filter(([d]) => d >= now14d)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, visits]) => ({ date, visits }))

  return NextResponse.json({
    total: data.total,
    today: todayCount,
    last7d,
    devices: data.devices,
    topCountries,
    dailyChart,
  })
}
