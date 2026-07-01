import { google } from 'googleapis'

const FOLDER_ID = '1unpdNHU558jNliADvjQlNWxmeqfsF11K'

// Map month name → 1-indexed number (handles common typos)
const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, febuary: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8, september: 9,
  october: 10, november: 11, december: 12,
}

// Parse a catering file name like "April 2026 Catering" or "December 25 Catering"
// into { month: 4, year: 2026 }
function parseSheetMonth(name: string): { month: number; year: number } | null {
  const lower = name.toLowerCase()
  let month = 0
  for (const [key, val] of Object.entries(MONTH_MAP)) {
    if (lower.includes(key)) { month = val; break }
  }
  if (!month) return null
  const yearMatch = name.match(/\b(20\d{2}|\d{2})\b/)
  if (!yearMatch) return null
  const y = parseInt(yearMatch[1])
  return { month, year: y < 100 ? 2000 + y : y }
}

// Fetch the catering cash total from the Summary tab for a given YYYY-MM month string.
export async function fetchCateringMonthTotal(monthStr: string): Promise<{ total: number; sheetName: string } | null> {
  const auth = getAuth()
  if (!auth) return null
  const [y, m] = monthStr.split('-').map(Number)

  try {
    const drive  = google.drive({ version: 'v3', auth })
    const sheets = google.sheets({ version: 'v4', auth })

    const filesRes = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`,
      fields: 'files(id, name)',
    })

    const match = (filesRes.data.files || []).find((f) => {
      if (!f.name) return false
      const parsed = parseSheetMonth(f.name)
      return parsed && parsed.month === m && parsed.year === y
    })
    if (!match) return null

    // Find summary tab (case-insensitive)
    const meta = await sheets.spreadsheets.get({ spreadsheetId: match.id! })
    const tabNames = (meta.data.sheets || []).map((s) => s.properties?.title || '')
    const summaryTab = tabNames.find((t) => t.toLowerCase() === 'summary') || 'Summary'

    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: match.id!,
      range: `'${summaryTab}'!A1:D20`,
    })
    const total = parseSummaryTotal((r.data.values || []) as string[][])
    return total > 0 ? { total, sheetName: match.name! } : null
  } catch { return null }
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const credentials = typeof parsed === 'string' ? JSON.parse(parsed) : parsed
    return new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    })
  } catch { return null }
}

export interface CateringItem {
  name: string
  traySize: string
  price: number
}

export interface CateringOrder {
  id: string
  sheetId: string
  sheetName: string
  tabName: string
  eventName: string
  items: CateringItem[]
  total: number
}

export interface DailyOrderItem {
  name: string
  traySize: string
  price: number
}

export interface DailyCateringOrder {
  title: string
  items: DailyOrderItem[]
  total: number       // sum of items / "Total Price"
  finalPrice: number  // "Final Price" if specified (after discount), else total
  cash: number
}

// Find the first number in a tab name (e.g. "May 2nd" → 2, "April 10th" → 10)
// No word boundaries — "2nd", "3rd", "10th" all contain digits not followed by \b
function tabDay(tabName: string): number {
  const m = tabName.match(/(\d+)/)
  return m ? parseInt(m[1]) : 0
}

function parseDailyOrders(rows: string[][]): DailyCateringOrder[] {
  const orders: DailyCateringOrder[] = []
  let title = ''
  let items: DailyOrderItem[] = []
  let explicitTotal = 0
  let explicitFinal = 0
  let explicitCash  = 0
  let inItems = false

  const flushOrder = () => {
    if (!title && items.length === 0) return
    const total = explicitTotal || Math.round(items.reduce((s, i) => s + i.price, 0) * 100) / 100
    const finalPrice = explicitFinal || total
    orders.push({ title, items, total, finalPrice, cash: explicitCash || finalPrice })
    title = ''; items = []; explicitTotal = 0; explicitFinal = 0; explicitCash = 0; inItems = false
  }

  for (const row of rows) {
    if (!row || row.length === 0) continue
    const a = (row[0] ?? '').trim()
    const c = (row[2] ?? '').trim()
    const d = parseFloat((row[3] ?? '').replace(/[$,]/g, ''))
    const e = parseFloat((row[4] ?? '').replace(/[$,]/g, ''))
    const cLower = c.toLowerCase()

    // "Grand Total" label in column C — old format, flushes the order
    if (cLower.includes('grand total')) {
      if (!isNaN(d) && d > 0) explicitTotal = d
      if (!isNaN(e) && e > 0) explicitCash  = e
      flushOrder()
      continue
    }

    // "Total Price" — items sum (newer format), captured but doesn't flush
    if (cLower.includes('total price')) {
      if (!isNaN(d) && d > 0) explicitTotal = d
      inItems = false
      continue
    }

    // "Final Price" — actual amount charged after any discount
    if (cLower.includes('final price')) {
      if (!isNaN(d) && d > 0) explicitFinal = d
      inItems = false
      continue
    }

    // Header row → switch to items mode
    if (a.toLowerCase() === 'item name' || a.toLowerCase() === 'item') {
      inItems = true; continue
    }

    // Non-empty column A that isn't an item (no header seen yet, or after items ended)
    if (a && !inItems) {
      flushOrder() // save previous order if any
      title = a.split('\n')[0].trim()
      continue
    }

    // Empty-A row after items: capture first numeric value as subtotal
    if (!a && inItems) {
      if (!isNaN(d) && d > 0 && !explicitTotal) explicitTotal = d
      inItems = false // items section ended
      continue
    }

    // Item row (inItems mode, non-empty A)
    if (inItems && a) {
      const tray  = (row[1] ?? '').trim()
      const price = !isNaN(d) && d > 0 ? d : 0
      // A row in items-mode that has NO tray AND NO price is a new order header,
      // not an item. Real items always have at least one of (tray, price).
      if (!tray && price === 0) {
        flushOrder()
        title = a.split('\n')[0].trim()
        inItems = true  // stay in items mode so the following rows are treated as the new order's items
        continue
      }
      items.push({ name: a, traySize: tray, price })
    }
  }
  flushOrder() // save last order

  return orders.filter((o) => o.items.length > 0 || o.total > 0)
}

// Fetch all catering orders for a specific business day (YYYY-MM-DD)
export async function fetchDailyCateringOrders(dateStr: string): Promise<DailyCateringOrder[]> {
  const auth = getAuth()
  if (!auth) return []

  const [y, m, d] = dateStr.split('-').map(Number)

  try {
    const drive  = google.drive({ version: 'v3', auth })
    const sheets = google.sheets({ version: 'v4', auth })

    // Find the spreadsheet for this month
    const filesRes = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`,
      fields: 'files(id, name)',
    })
    const match = (filesRes.data.files || []).find((f) => {
      if (!f.name) return false
      const parsed = parseSheetMonth(f.name)
      return parsed && parsed.month === m && parsed.year === y
    })
    if (!match) return []

    // Find tabs whose first number matches the day
    const meta = await sheets.spreadsheets.get({ spreadsheetId: match.id! })
    const matchingTabs = (meta.data.sheets || [])
      .map((s) => s.properties?.title || '')
      .filter((t) => t.toLowerCase() !== 'summary' && tabDay(t) === d)

    if (matchingTabs.length === 0) return []

    const allOrders: DailyCateringOrder[] = []
    for (const tab of matchingTabs) {
      const r = await sheets.spreadsheets.values.get({
        spreadsheetId: match.id!,
        range: `'${tab}'!A1:F60`,
      })
      const orders = parseDailyOrders((r.data.values || []) as string[][])
      allOrders.push(...orders)
    }
    return allOrders
  } catch { return [] }
}

export interface CateringSheet {
  id: string
  name: string
  orders: CateringOrder[]
  totalRevenue: number
}

function parseOrders(
  sheetId: string,
  sheetName: string,
  tabs: Array<{ tab: string; rows: string[][] }>
): CateringOrder[] {
  return tabs.flatMap(({ tab, rows }) => {
    const eventName = (rows[0]?.[0] || tab).trim().split('\n')[0].slice(0, 120)

    // Find the header row (Item / Tray Size / Price)
    const headerIdx = rows.findIndex(
      (r) => r[0]?.toLowerCase().includes('item') || r[1]?.toLowerCase().includes('tray')
    )
    const dataRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows.slice(2)

    const items: CateringItem[] = []
    let explicitTotal = 0

    for (const r of dataRows) {
      if (!r || r.length < 2) continue
      const name      = (r[0] || '').trim()
      const traySize  = (r[1] || '').trim()
      const priceStr  = (r[2] || '').replace(/[$,]/g, '')
      const price     = parseFloat(priceStr) || 0

      if (!name && price > 0) {
        explicitTotal = price // total row: empty name, numeric price
      } else if (name && price >= 0) {
        items.push({ name, traySize, price })
      }
    }

    const total = explicitTotal > 0
      ? explicitTotal
      : Math.round(items.reduce((s, i) => s + i.price, 0) * 100) / 100

    if (items.length === 0 && total === 0) return []

    return [{
      id: `${sheetId}::${tab}`,
      sheetId,
      sheetName,
      tabName: tab,
      eventName,
      items,
      total: Math.round(total * 100) / 100,
    }]
  })
}

// The Summary row has the label in column A and the value in column B or C
// e.g. ["Summary", "4730"] or ["Summary", "", "$8,623"]
function parseSummaryTotal(rows: string[][]): number {
  for (const row of rows) {
    if (!row || row.length === 0) continue
    const firstCell = (row[0] ?? '').toString().trim().toLowerCase()
    if (firstCell === 'summary') {
      // Scan columns B, C, D for the first parseable numeric value
      for (let i = 1; i < row.length; i++) {
        const cell = (row[i] ?? '').toString().trim()
        const n = parseFloat(cell.replace(/[$,]/g, ''))
        if (!isNaN(n) && n > 0) return n
      }
    }
  }
  return 0
}

export interface ContainerRow {
  [key: string]: string
}

const CONTAINERS_SHEET_ID = '1zdp_v3wZO_sj-POFkBbkRgzpOgPisZlwlhu0bY9--jM'

export async function fetchContainersList(): Promise<{ headers: string[]; rows: ContainerRow[] }> {
  const auth = getAuth()
  if (!auth) return { headers: [], rows: [] }

  try {
    const sheets = google.sheets({ version: 'v4', auth })

    const meta = await sheets.spreadsheets.get({ spreadsheetId: CONTAINERS_SHEET_ID })
    const firstTab = meta.data.sheets?.[0]?.properties?.title || 'Sheet1'

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CONTAINERS_SHEET_ID,
      range: `'${firstTab}'`,
    })
    const rawRows = (res.data.values || []) as string[][]
    if (rawRows.length === 0) return { headers: [], rows: [] }

    const headers = rawRows[0].map(h => h?.trim() || '')
    const rows = rawRows.slice(1)
      .filter(r => r.some(c => c?.trim()))
      .map(r => {
        const obj: ContainerRow = {}
        headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim() })
        return obj
      })

    return { headers, rows }
  } catch (e: any) { return { headers: [], rows: [], error: e?.message ?? String(e) } as any }
}

export async function fetchCateringData(): Promise<CateringSheet[]> {
  const auth = getAuth()
  if (!auth) return []

  try {
    const drive  = google.drive({ version: 'v3', auth })
    const sheets = google.sheets({ version: 'v4', auth })

    const filesRes = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`,
      fields: 'files(id, name)',
    })

    const files = (filesRes.data.files || []).filter(
      (f) => f.name && !f.name.includes('Party Menu') && !f.name.includes('Responses')
    )

    // Read only the Summary tab for each sheet (sequential to avoid rate limits)
    const results: CateringSheet[] = []
    for (const file of files) {
      try {
        // Find the summary tab name (case-insensitive — some sheets use lowercase)
        const meta = await sheets.spreadsheets.get({ spreadsheetId: file.id! })
        const tabNames = (meta.data.sheets || []).map((s) => s.properties?.title || '')
        const summaryTab = tabNames.find((t) => t.toLowerCase() === 'summary') || 'Summary'

        const summaryRes = await sheets.spreadsheets.values.get({
          spreadsheetId: file.id!,
          range: `'${summaryTab}'!A1:D20`,
        })
        const totalRevenue = parseSummaryTotal((summaryRes.data.values || []) as string[][])
        results.push({
          id: file.id!,
          name: file.name!,
          orders: [],
          totalRevenue: Math.round(totalRevenue * 100) / 100,
        })
      } catch { /* skip unreadable sheet */ }
    }

    // Drop zero-revenue sheets (empty templates / future placeholders)
    const now = new Date()
    const currentYM = now.getFullYear() * 12 + now.getMonth() // 0-based month

    const nonEmpty = results.filter((r) => {
      if (r.totalRevenue === 0) return false
      const p = parseSheetMonth(r.name)
      if (!p) return true
      // exclude sheets whose month is strictly in the future
      const sheetYM = p.year * 12 + (p.month - 1)
      return sheetYM <= currentYM
    })

    // Sort newest month first using parsed year/month
    nonEmpty.sort((a, b) => {
      const pa = parseSheetMonth(a.name)
      const pb = parseSheetMonth(b.name)
      if (!pa || !pb) return 0
      if (pa.year !== pb.year) return pb.year - pa.year
      return pb.month - pa.month
    })

    return nonEmpty
  } catch { return [] }
}
