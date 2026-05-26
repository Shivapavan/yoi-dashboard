const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID  || 'ecfg_gqlkdllsryermadycrvkrquozaq0'
const TEAM_ID        = process.env.VERCEL_TEAM_ID  || 'team_3YXszX9B3Qr3LYzpaAO4yNvB'
const ANALYTICS_KEY  = 'analytics'

export interface VisitorAnalytics {
  total: number
  devices: { ios: number; android: number; desktop: number; other: number }
  countries: Record<string, number>
  daily: Record<string, number>   // YYYY-MM-DD → visit count (last 30 days)
}

const EMPTY: VisitorAnalytics = {
  total: 0,
  devices: { ios: 0, android: 0, desktop: 0, other: 0 },
  countries: {},
  daily: {},
}

export function detectDevice(ua: string): keyof VisitorAnalytics['devices'] {
  const u = ua.toLowerCase()
  if (/iphone|ipad|ipod/.test(u)) return 'ios'
  if (/android/.test(u)) return 'android'
  if (/windows|macintosh|linux|cros/.test(u)) return 'desktop'
  return 'other'
}

// Read current analytics from Edge Config
export async function readAnalytics(): Promise<VisitorAnalytics> {
  try {
    const { get } = await import('@vercel/edge-config')
    const data = await get<VisitorAnalytics>(ANALYTICS_KEY)
    return data ?? EMPTY
  } catch { return EMPTY }
}

// Write updated analytics back to Edge Config via REST API
export async function writeAnalytics(data: VisitorAnalytics): Promise<void> {
  const token = process.env.VERCEL_API_TOKEN
  if (!token) return

  // Keep daily map to last 30 days only
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const daily = Object.fromEntries(
    Object.entries(data.daily).filter(([d]) => d >= cutoff)
  )

  const payload: VisitorAnalytics = { ...data, daily }

  await fetch(
    `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items?teamId=${TEAM_ID}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ operation: 'upsert', key: ANALYTICS_KEY, value: payload }],
      }),
    }
  )
}

// Record a single visit
export async function recordVisit(ua: string, country: string): Promise<void> {
  const current = await readAnalytics()
  const device  = detectDevice(ua)
  const today   = new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  const updated: VisitorAnalytics = {
    total: current.total + 1,
    devices: { ...current.devices, [device]: (current.devices[device] ?? 0) + 1 },
    countries: {
      ...current.countries,
      [country || 'Unknown']: (current.countries[country || 'Unknown'] ?? 0) + 1,
    },
    daily: {
      ...current.daily,
      [today]: (current.daily[today] ?? 0) + 1,
    },
  }

  await writeAnalytics(updated)
}
