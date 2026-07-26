import * as XLSX from '../../node_modules/xlsx/xlsx.mjs'

function sheetAoa(wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null })
}

// Handles sheets built from one or more stacked "label | Value" / "label | Count"
// blocks (Summary, Financials, AI Summary). A row whose second column is the
// literal string "Value" or "Count" starts a new block; blank rows are just
// separators, not block boundaries — RestCall stacks several blocks per sheet.
function parseStackedKeyValueSheet(aoa) {
  const scalars = {}
  const countTables = {}
  let mode = null
  let currentCountTable = null

  for (const row of aoa) {
    const col0 = row?.[0] != null ? String(row[0]).trim() : ''
    const col1 = row?.[1]
    if (!col0) continue

    if (col1 === 'Value') { mode = 'value'; continue }
    if (col1 === 'Count') {
      mode = 'count'
      currentCountTable = col0
      countTables[currentCountTable] = []
      continue
    }
    if (mode === 'value') scalars[col0] = col1
    else if (mode === 'count' && currentCountTable) countTables[currentCountTable].push({ label: col0, count: col1 })
  }

  return { scalars, countTables }
}

function parseTabularSheet(aoa, columns) {
  return aoa.slice(1)
    .filter(row => row && row[0] != null)
    .map(row => Object.fromEntries(columns.map((key, i) => [key, row[i] ?? null])))
}

export function parseRestcallWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  const { scalars: summary } = parseStackedKeyValueSheet(sheetAoa(wb, 'Summary'))
  const { scalars: financials } = parseStackedKeyValueSheet(sheetAoa(wb, 'Financials'))
  const { scalars: aiScalars, countTables: aiBreakdowns } = parseStackedKeyValueSheet(sheetAoa(wb, 'AI Summary'))

  const comparisonRows = parseTabularSheet(sheetAoa(wb, 'Comparison'), ['metric', 'current', 'previous', 'change'])
  const comparison = Object.fromEntries(comparisonRows.map(r => [r.metric, { current: r.current, previous: r.previous, change: r.change }]))

  const channels = parseTabularSheet(sheetAoa(wb, 'Channels'), ['dimension', 'value', 'orders', 'revenue', 'orderShare', 'revenueShare'])
  const outcomes = parseTabularSheet(sheetAoa(wb, 'Outcomes'), ['status', 'orders', 'share'])
  const dailyRevenue = parseTabularSheet(sheetAoa(wb, 'Daily Revenue'), ['businessDate', 'revenue', 'orders', 'averageTicket'])
    .map(r => ({ ...r, businessDate: r.businessDate instanceof Date ? r.businessDate.toISOString().slice(0, 10) : r.businessDate }))
  const hourlyVolume = parseTabularSheet(sheetAoa(wb, 'Hourly Volume'), ['hour', 'orders', 'revenue', 'share'])
  const categories = parseTabularSheet(sheetAoa(wb, 'Categories'), ['category', 'qtySold', 'revenue', 'revenueShare'])
  const topSellers = parseTabularSheet(sheetAoa(wb, 'Top Sellers'), ['rank', 'item', 'qtySold', 'revenue', 'avgRevenuePerUnit'])

  return {
    summary: {
      selectedRange: summary['Selected range'] ?? null,
      revenue: summary['Revenue'] ?? 0,
      orders: summary['Orders'] ?? 0,
      averageTicket: summary['Average ticket'] ?? 0,
      cancellationRate: summary['Cancellation rate'] ?? 0,
      countedSales: summary['Counted sales'] ?? 0,
      allOrderOutcomes: summary['All order outcomes'] ?? 0,
    },
    comparison,
    financials: {
      revenue: financials['Revenue'] ?? 0,
      grossItemSales: financials['Gross item sales'] ?? 0,
      discounts: financials['Discounts'] ?? 0,
      cashDiscounts: financials['Cash discounts'] ?? 0,
      rewardRedemptions: financials['Reward redemptions'] ?? 0,
      netItemSales: financials['Net item sales'] ?? 0,
      taxes: financials['Taxes'] ?? 0,
      tips: financials['Tips'] ?? 0,
      serviceCharges: financials['Service charges'] ?? 0,
      deliveryFees: financials['Delivery fees'] ?? 0,
      coveredOrders: financials['Covered orders'] ?? 0,
      breakdownCoverage: financials['Breakdown coverage'] ?? 0,
    },
    channels,
    outcomes,
    dailyRevenue,
    hourlyVolume,
    categories,
    topSellers,
    aiSummary: {
      customerCalls: aiScalars['Customer calls'] ?? 0,
      spamCalls: aiScalars['Spam / robocalls'] ?? 0,
      callsWithIssues: aiScalars['Calls with issues'] ?? 0,
      issueRate: aiScalars['Issue rate'] ?? 0,
      majorOrCritical: aiScalars['Major or critical'] ?? 0,
      aiConversations: aiScalars['AI conversations'] ?? 0,
      directTextOrders: aiScalars['Direct text orders'] ?? 0,
      attributedRevenue: aiScalars['Attributed revenue'] ?? 0,
      conversionRate: aiScalars['Conversion rate'] ?? 0,
      deliveryFailures: aiScalars['Delivery failures'] ?? 0,
      actionRequired: aiScalars['Action required'] ?? 0,
      staffHandoffs: aiScalars['Staff handoffs'] ?? 0,
      postCallRecoveries: aiScalars['Post-call recoveries'] ?? 0,
      medianResponseSeconds: aiScalars['Median response (seconds)'] ?? null,
      breakdowns: aiBreakdowns,
    },
  }
}
