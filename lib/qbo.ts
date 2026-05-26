const PROJECT_ID = 'prj_tqEGX5cc9l0NEsoN1HBwj1XzX2cX'
const TEAM_ID    = process.env.VERCEL_TEAM_ID || 'team_3YXszX9B3Qr3LYzpaAO4yNvB'
const QBO_BASE   = 'https://quickbooks.api.intuit.com'
const TOKEN_URL  = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

export const REDIRECT_URI = 'https://yoi-dashboard.vercel.app/api/qbo/callback'

async function updateVercelEnv(key: string, value: string) {
  const apiToken = process.env.VERCEL_API_TOKEN
  if (!apiToken) return
  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  })
  const envData = await res.json()
  const existing = envData.envs?.find((e: any) => e.key === key && e.target?.includes('production'))
  if (existing) {
    await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env/${existing.id}?teamId=${TEAM_ID}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
  } else {
    await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, type: 'encrypted', target: ['production'] }),
    })
  }
}

function credentials() {
  return Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64')
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  })
  const tokens = await res.json()
  // Return error details so the caller can show a useful message
  if (!tokens.access_token) return { error: tokens.error || tokens.message || `HTTP ${res.status}` }
  const expiry = Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600)
  await Promise.all([
    updateVercelEnv('QBO_ACCESS_TOKEN',  tokens.access_token),
    updateVercelEnv('QBO_REFRESH_TOKEN', tokens.refresh_token),
    updateVercelEnv('QBO_TOKEN_EXPIRY',  String(expiry)),
  ])
  return tokens
}

export async function getValidAccessToken(): Promise<string | null> {
  const accessToken  = process.env.QBO_ACCESS_TOKEN
  const refreshToken = process.env.QBO_REFRESH_TOKEN
  if (!accessToken || !refreshToken) return null

  const expiry = parseInt(process.env.QBO_TOKEN_EXPIRY || '0')
  if (expiry > Math.floor(Date.now() / 1000) + 300) return accessToken

  // Refresh
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  const tokens = await res.json()
  if (!tokens.access_token) return null
  const newExpiry = Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600)
  await Promise.all([
    updateVercelEnv('QBO_ACCESS_TOKEN', tokens.access_token),
    updateVercelEnv('QBO_TOKEN_EXPIRY', String(newExpiry)),
    ...(tokens.refresh_token ? [updateVercelEnv('QBO_REFRESH_TOKEN', tokens.refresh_token)] : []),
  ])
  return tokens.access_token
}

export async function fetchProfitAndLoss(startDate: string, endDate: string) {
  const token   = await getValidAccessToken()
  const realmId = process.env.QBO_REALM_ID
  if (!token || !realmId) return null

  const url = `${QBO_BASE}/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&accounting_method=Accrual&minorversion=65`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json()
}

export interface VendorBill {
  id: string
  date: string
  vendor: string
  amount: number
  balance: number
  status: 'paid' | 'unpaid' | 'partial'
}

export async function fetchVendorBills(startDate: string, endDate: string): Promise<VendorBill[]> {
  const token   = await getValidAccessToken()
  const realmId = process.env.QBO_REALM_ID
  if (!token || !realmId) return []
  try {
    const query = `SELECT * FROM Bill WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' MAXRESULTS 100`
    const url = `${QBO_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    const bills: any[] = data.QueryResponse?.Bill || []
    return bills.map((b: any) => ({
      id:      b.Id,
      date:    b.TxnDate,
      vendor:  b.VendorRef?.name || 'Unknown Vendor',
      amount:  parseFloat(b.TotalAmt || '0'),
      balance: parseFloat(b.Balance || '0'),
      status:  parseFloat(b.Balance || '0') === 0 ? 'paid'
             : parseFloat(b.Balance || '0') < parseFloat(b.TotalAmt || '0') ? 'partial'
             : 'unpaid',
    }))
  } catch { return [] }
}

export interface ExpenseTransaction {
  id: string
  date: string
  payee: string
  amount: number
  paymentType: string
  category: string
}

export async function fetchExpenseTransactions(startDate: string, endDate: string): Promise<ExpenseTransaction[]> {
  const token   = await getValidAccessToken()
  const realmId = process.env.QBO_REALM_ID
  if (!token || !realmId) return []
  try {
    const query = `SELECT * FROM Purchase WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' MAXRESULTS 200`
    const url = `${QBO_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    const purchases: any[] = data.QueryResponse?.Purchase || []
    return purchases.map((p: any) => {
      const category = p.Line?.[0]?.AccountBasedExpenseLineDetail?.AccountRef?.name
                    || p.Line?.[0]?.ItemBasedExpenseLineDetail?.ItemRef?.name
                    || 'Uncategorized'
      return {
        id:          p.Id,
        date:        p.TxnDate,
        payee:       p.EntityRef?.name || p.PaymentMethodRef?.name || 'Unknown',
        amount:      parseFloat(p.TotalAmt || '0'),
        paymentType: p.PaymentType || 'Other',
        category,
      }
    }).sort((a, b) => b.date.localeCompare(a.date))
  } catch { return [] }
}

export interface PnLSection {
  section: string
  total: number
  items: { name: string; amount: number }[]
}

export function parsePnL(data: any): PnLSection[] {
  const rows: any[] = data?.Rows?.Row || []
  const result: PnLSection[] = []

  const parseRows = (innerRows: any[]): { name: string; amount: number }[] =>
    innerRows
      .filter((r: any) => r.type === 'Data')
      .map((r: any) => ({
        name:   String(r.ColData?.[0]?.value ?? '').trim(),
        amount: parseFloat(r.ColData?.[1]?.value ?? '0') || 0,
      }))
      .filter((r) => r.name && r.amount !== 0)

  for (const row of rows) {
    if (row.type !== 'Section') continue
    const section = row.group || row.Header?.ColData?.[0]?.value || ''
    const total   = parseFloat(row.Summary?.ColData?.[1]?.value ?? '0') || 0
    const items   = parseRows(row.Rows?.Row || [])
    if (section) result.push({ section, total, items })
  }
  return result
}
