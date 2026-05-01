const SHIFT4_BASE = 'https://api.shift4.com'

function getAuthHeader(): string {
  const key = process.env.SHIFT4_SECRET_KEY
  if (!key) throw new Error('SHIFT4_SECRET_KEY not set in environment')
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64')
}

async function shift4Fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${SHIFT4_BASE}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Shift4 API error ${res.status}: ${err}`)
  }
  return res.json()
}

export async function fetchDisputes(since: number) {
  return shift4Fetch<{ list: any[] }>('/disputes', {
    'created[gte]': String(since),
    limit: '100',
  })
}

export async function fetchChargesForDate(dateStr: string) {
  const start = new Date(dateStr)
  start.setHours(0, 0, 0, 0)
  const end = new Date(dateStr)
  end.setHours(23, 59, 59, 999)
  return shift4Fetch<{ list: any[] }>('/charges', {
    'created[gte]': String(Math.floor(start.getTime() / 1000)),
    'created[lte]': String(Math.floor(end.getTime() / 1000)),
    limit: '100',
  })
}

export async function fetchChargesForRange(startDate: string, endDate: string) {
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(23, 59, 59, 999)
  return shift4Fetch<{ list: any[] }>('/charges', {
    'created[gte]': String(Math.floor(start.getTime() / 1000)),
    'created[lte]': String(Math.floor(end.getTime() / 1000)),
    limit: '100',
  })
}
