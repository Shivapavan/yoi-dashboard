'use client'

import { useEffect, useMemo, useState } from 'react'

type Metric = 'qty' | 'revenue'
type Grouping = 'month' | 'week'

interface PeriodMeta { key: string; label: string }
interface Item {
  name: string
  byPeriod: Record<string, { qty: number; revenue: number }>
  totalQty: number
  totalRevenue: number
}

const BIRYANI_KEYWORDS   = ['biryani', 'biriyani']
const BREAKFAST_KEYWORDS = [
  'dosa', 'idly', 'idli', 'vada', 'poori', 'puri', 'chole', 'bhature', 'bhatura',
  'bonda', 'pongal', 'maggi', 'upma', 'uttapam',
]
const SNACK_KEYWORDS     = ['samosa', 'bajji', 'baji']
const APPETIZER_KEYWORDS = [
  'pakoda', 'kebab', 'kabab', 'manchurian', 'chilli', '65',
  'pepper fry', 'lollipop', 'wing', 'tikka', 'kachori', 'chaat',
  'cutlet', 'roll', 'gobi', '555',
]
const CURRY_KEYWORDS   = ['curry', 'masala', 'dum', 'korma', 'kadai', 'butter', 'dal', 'sambar', 'gravy']
const BREAD_KEYWORDS   = ['naan', 'roti', 'paratha', 'kulcha', 'chapati']
const DESSERT_KEYWORDS = ['ice cream', 'icecream', 'kheer', 'halwa', 'rasmalai', 'gulab jamun', 'kulfi', 'jalebi', 'falooda', 'paan']
const DRINK_KEYWORDS   = ['lassi', 'tea', 'chai', 'coffee', 'soda', 'juice', 'mocktail', 'water', 'cola']

function fmt(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function categoryMatch(name: string, cat: string): boolean {
  const n = name.toLowerCase()
  const isBiryani   = BIRYANI_KEYWORDS.some(k => n.includes(k))
  const isBreakfast = BREAKFAST_KEYWORDS.some(k => n.includes(k))
  const isSnack     = SNACK_KEYWORDS.some(k => n.includes(k))
  // "Tikka Masala" / "Butter Masala" → those are curries, not appetizers, even if
  // they contain the appetizer keyword "tikka".
  const isMasalaCurry = /tikka\s+masala|butter\s+masala/.test(n)

  switch (cat) {
    case 'all':       return true
    case 'biryani':   return isBiryani
    case 'breakfast': return isBreakfast && !isBiryani
    case 'snacks':    return isSnack     && !isBiryani && !isBreakfast
    case 'appetizer': return APPETIZER_KEYWORDS.some(k => n.includes(k))
                           && !isBiryani && !isBreakfast && !isSnack && !isMasalaCurry
    case 'curry':     return CURRY_KEYWORDS.some(k => n.includes(k))
                           && !isBiryani && !isBreakfast && !isSnack
                           && (isMasalaCurry || !APPETIZER_KEYWORDS.some(k => n.includes(k)))
    case 'bread':     return BREAD_KEYWORDS.some(k => n.includes(k)) && !isBreakfast
    case 'dessert':   return DESSERT_KEYWORDS.some(k => n.includes(k))
    case 'drink':     return DRINK_KEYWORDS.some(k => n.includes(k))
    default:          return true
  }
}

// Tiny SVG sparkline. Color follows overall slope: green = up, red = down, gray = flat.
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const width = 96, height = 28, pad = 2
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const step = (width - 2 * pad) / (data.length - 1)
  const points = data.map((v, i) => {
    const x = pad + i * step
    const y = pad + (height - 2 * pad) - ((v - min) / range) * (height - 2 * pad)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  // Last-point dot
  const lastX = pad + (data.length - 1) * step
  const lastY = pad + (height - 2 * pad) - ((data[data.length - 1] - min) / range) * (height - 2 * pad)

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  )
}

function deltaBadge(curr: number, prev: number): { text: string; color: string } {
  if (prev === 0 && curr === 0) return { text: '—', color: 'text-gray-300' }
  if (prev === 0)               return { text: 'new', color: 'text-indigo-600' }
  if (curr === 0)               return { text: '−100%', color: 'text-red-600' }
  const pct = ((curr - prev) / prev) * 100
  const sign = pct >= 0 ? '+' : ''
  const color = pct >= 5 ? 'text-green-600' : pct <= -5 ? 'text-red-600' : 'text-gray-400'
  return { text: `${sign}${pct.toFixed(0)}%`, color }
}

export default function ItemTrends() {
  const [groupBy, setGroupBy] = useState<Grouping>('month')
  const [metric, setMetric]   = useState<Metric>('qty')
  const [category, setCategory] = useState('biryani')
  const [search, setSearch]   = useState('')
  const [data, setData]       = useState<{ periods: PeriodMeta[]; items: Item[] }>({ periods: [], items: [] })
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Summary section state — independent of the main table filters
  const [summarySearch, setSummarySearch] = useState('blue moon, bluemoon')
  const [summaryFrom, setSummaryFrom]     = useState('')   // YYYY-MM, empty = first available
  const [summaryTo, setSummaryTo]         = useState('')   // YYYY-MM, empty = last available
  // Day-level date range (overrides month range when both are set)
  const [rangeStart, setRangeStart] = useState('')   // YYYY-MM-DD
  const [rangeEnd, setRangeEnd]     = useState('')   // YYYY-MM-DD
  const [rangeData, setRangeData]   = useState<{ items: Array<{ name: string; qty: number; revenue: number }> } | null>(null)
  const [rangeLoading, setRangeLoading] = useState(false)

  // Fetch custom-range item data when both dates are set
  useEffect(() => {
    if (!rangeStart || !rangeEnd) { setRangeData(null); return }
    if (rangeStart > rangeEnd) { setRangeData(null); return }
    setRangeLoading(true)
    fetch(`/api/items-range?from=${rangeStart}&to=${rangeEnd}`)
      .then(r => r.json())
      .then(d => setRangeData({ items: d.items ?? [] }))
      .catch(() => setRangeData(null))
      .finally(() => setRangeLoading(false))
  }, [rangeStart, rangeEnd])

  const load = () => {
    setLoading(true)
    fetch(`/api/item-trends?groupBy=${groupBy}&from=2025-08`)
      .then(r => r.json())
      .then(d => {
        setData({ periods: d.periods ?? [], items: d.items ?? [] })
        setLastUpdated(new Date())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [groupBy])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.items
      .filter(it => categoryMatch(it.name, category))
      .filter(it => !q || it.name.toLowerCase().includes(q))
  }, [data.items, category, search])

  // Configurable summary — search (comma = OR), month range, OR day-level range.
  // If both rangeStart and rangeEnd are set, uses the fetched rangeData (day granularity, single column).
  // Otherwise uses the monthly bucketed data with from/to month dropdowns.
  const summary = useMemo(() => {
    const q = summarySearch.trim().toLowerCase()
    if (!q) return null
    // Split by comma for OR matching: "blue moon, bluemoon" matches items containing either term
    const terms = q.split(',').map(t => t.trim()).filter(Boolean)
    if (terms.length === 0) return null

    const matches = (name: string) => terms.some(t => name.toLowerCase().includes(t))
    const sizePattern = /(\d{1,2})\s*oz|\bcan\b/i
    const groupOf = (name: string, hasSizes: boolean): string => {
      if (hasSizes) {
        const n = name.toLowerCase()
        const m = n.match(/(\d{1,2})\s*oz/)
        if (m) return `${m[1]} oz`
        if (n.includes('can')) return 'Can'
        return 'Other'
      }
      return name
    }
    const sortGroups = (keys: string[], hasSizes: boolean, totals: Record<string, { qty: number; revenue: number }>) =>
      keys.sort((a, b) => {
        if (hasSizes) {
          const oa = a.match(/(\d+)/), ob = b.match(/(\d+)/)
          if (oa && ob) return parseInt(oa[1]) - parseInt(ob[1])
          if (oa) return -1
          if (ob) return 1
          return a.localeCompare(b)
        }
        return totals[b][metric] - totals[a][metric]
      })

    // ── Day-level range mode (uses fetched rangeData) ─────────────────────────
    if (rangeStart && rangeEnd && rangeData) {
      const matchingItems = rangeData.items.filter(it => matches(it.name))
      if (matchingItems.length === 0) return null
      const hasSizes = matchingItems.some(it => sizePattern.test(it.name))
      const groupTotals: Record<string, { qty: number; revenue: number }> = {}
      for (const it of matchingItems) {
        const g = groupOf(it.name, hasSizes)
        if (!groupTotals[g]) groupTotals[g] = { qty: 0, revenue: 0 }
        groupTotals[g].qty     += it.qty
        groupTotals[g].revenue += it.revenue
      }
      const sortedGroups = sortGroups(Object.keys(groupTotals), hasSizes, groupTotals)
      return {
        mode: 'range' as const,
        hasSizes, groupTotals, sortedGroups,
        itemCount: matchingItems.length,
        rangeLabel: `${rangeStart} → ${rangeEnd}`,
      }
    }

    // ── Monthly mode (uses bucketed data) ─────────────────────────────────────
    const fromKey = summaryFrom || data.periods[0]?.key
    const toKey   = summaryTo   || data.periods[data.periods.length - 1]?.key
    const visiblePeriods = data.periods.filter(p =>
      (!fromKey || p.key >= fromKey) && (!toKey || p.key <= toKey)
    )
    const matchingItems = data.items.filter(it => matches(it.name))
    if (matchingItems.length === 0) return null

    const hasSizes = matchingItems.some(it => sizePattern.test(it.name))
    const groups: Record<string, Record<string, { qty: number; revenue: number }>> = {}
    const groupTotals: Record<string, { qty: number; revenue: number }> = {}
    for (const it of matchingItems) {
      const g = groupOf(it.name, hasSizes)
      if (!groups[g]) { groups[g] = {}; groupTotals[g] = { qty: 0, revenue: 0 } }
      for (const p of visiblePeriods) {
        const v = it.byPeriod[p.key]
        if (!v) continue
        if (!groups[g][p.key]) groups[g][p.key] = { qty: 0, revenue: 0 }
        groups[g][p.key].qty     += v.qty
        groups[g][p.key].revenue += v.revenue
        groupTotals[g].qty       += v.qty
        groupTotals[g].revenue   += v.revenue
      }
    }
    const sortedGroups = sortGroups(Object.keys(groups), hasSizes, groupTotals)
    return {
      mode: 'monthly' as const,
      hasSizes, groups, groupTotals, sortedGroups, visiblePeriods,
      itemCount: matchingItems.length,
    }
  }, [data.items, data.periods, summarySearch, summaryFrom, summaryTo, metric, rangeStart, rangeEnd, rangeData])

  const overallDelta = (it: Item) => {
    if (data.periods.length < 2) return null
    const first = it.byPeriod[data.periods[0].key]?.[metric] ?? 0
    const last  = it.byPeriod[data.periods[data.periods.length - 1].key]?.[metric] ?? 0
    return deltaBadge(last, first)
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Item Trends</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Quantity sold and revenue per item, from Aug 2025 to today
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button onClick={load} className="text-purple-600 hover:text-purple-800 font-medium">Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex items-center gap-3 flex-wrap">
        {/* Group by */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">By</label>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['month', 'week'] as const).map(g => (
              <button key={g} onClick={() => setGroupBy(g)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize ${
                  groupBy === g ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'
                }`}>
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Metric */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Show</label>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['qty', 'revenue'] as const).map(m => (
              <button key={m} onClick={() => setMetric(m)}
                className={`px-3 py-1 rounded-md text-xs font-medium ${
                  metric === m ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'
                }`}>
                {m === 'qty' ? 'Quantity' : 'Revenue'}
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Items</option>
            <option value="biryani">Biryanis</option>
            <option value="appetizer">Appetizers</option>
            <option value="breakfast">Breakfast</option>
            <option value="snacks">Snacks</option>
            <option value="curry">Curries</option>
            <option value="bread">Breads</option>
            <option value="dessert">Desserts</option>
            <option value="drink">Drinks</option>
          </select>
        </div>

        {/* Search */}
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-purple-500" />
      </div>

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading {groupBy === 'month' ? 'monthly' : 'weekly'} item data — this can take ~30s for the full date range…</p>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-400 text-sm">
          No items match this filter.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left sticky left-0 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[200px]">Item</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trend</th>
                  {data.periods.map(p => (
                    <th key={p.key} className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {p.label}
                    </th>
                  ))}
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-purple-50">Total</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-purple-50">Overall Δ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => {
                  const overall = overallDelta(it)
                  // Build series of values across all periods for the sparkline
                  const series = data.periods.map(p => it.byPeriod[p.key]?.[metric] ?? 0)
                  const first = series[0] ?? 0
                  const last  = series[series.length - 1] ?? 0
                  const lineColor = last > first * 1.05 ? '#16A34A'
                                  : last < first * 0.95 ? '#DC2626'
                                  : '#9CA3AF'
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2 sticky left-0 bg-white font-medium text-gray-800">{it.name}</td>
                      <td className="px-3 py-2 text-center">
                        <Sparkline data={series} color={lineColor} />
                      </td>
                      {data.periods.map((p, idx) => {
                        const cur = it.byPeriod[p.key]?.[metric] ?? 0
                        const prev = idx > 0 ? (it.byPeriod[data.periods[idx - 1].key]?.[metric] ?? 0) : null
                        const d = prev !== null ? deltaBadge(cur, prev) : null
                        return (
                          <td key={p.key} className="px-3 py-2 text-right whitespace-nowrap">
                            <div className="text-gray-800">{metric === 'qty' ? cur : fmt(cur)}</div>
                            {d && <div className={`text-[10px] ${d.color}`}>{d.text}</div>}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right font-bold text-purple-700 bg-purple-50 whitespace-nowrap">
                        {metric === 'qty' ? it.totalQty : fmt(it.totalRevenue)}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold bg-purple-50 ${overall?.color ?? ''}`}>
                        {overall?.text ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 bg-gray-50">
            Δ shows % change from the previous period. <strong>Overall Δ</strong> compares the latest period to the first period.
            Green = ≥ 5% up, Red = ≥ 5% down.
          </p>
        </div>
      )}

      {/* Configurable item summary — search + month-range pickers */}
      {!loading && data.periods.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-gray-100 border-l-4 border-l-yoi-purple">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div>
                <h3 className="font-semibold text-gray-800">📊 Item Summary</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Type any item name to aggregate. Auto-groups by size if multiple sizes detected.
                </p>
              </div>
              {summary && (
                <span className="text-xs text-gray-400">
                  {summary.itemCount} matching item{summary.itemCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <input
                type="text"
                value={summarySearch}
                onChange={e => setSummarySearch(e.target.value)}
                placeholder="Search items (comma for multiple: blue moon, bluemoon)"
                className="flex-1 min-w-[240px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yoi-purple"
              />
            </div>

            {/* Month range (default) */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Months:</span>
              <label className="text-xs text-gray-500">From</label>
              <select
                value={summaryFrom}
                onChange={e => setSummaryFrom(e.target.value)}
                disabled={!!(rangeStart && rangeEnd)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yoi-purple disabled:opacity-50"
              >
                <option value="">Earliest</option>
                {data.periods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <label className="text-xs text-gray-500">To</label>
              <select
                value={summaryTo}
                onChange={e => setSummaryTo(e.target.value)}
                disabled={!!(rangeStart && rangeEnd)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yoi-purple disabled:opacity-50"
              >
                <option value="">Latest</option>
                {data.periods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>

            {/* Day-level date range (overrides month range when set) */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Or exact dates:</span>
              <label className="text-xs text-gray-500">From</label>
              <input
                type="date"
                value={rangeStart}
                onChange={e => setRangeStart(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yoi-purple"
              />
              <label className="text-xs text-gray-500">To</label>
              <input
                type="date"
                value={rangeEnd}
                onChange={e => setRangeEnd(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yoi-purple"
              />
              {(rangeStart || rangeEnd) && (
                <button
                  onClick={() => { setRangeStart(''); setRangeEnd('') }}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                >Clear dates</button>
              )}
              {rangeLoading && <span className="text-xs text-gray-400 animate-pulse">Fetching…</span>}
            </div>

            {(summarySearch !== 'blue moon, bluemoon' || summaryFrom || summaryTo || rangeStart || rangeEnd) && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    setSummarySearch('blue moon, bluemoon')
                    setSummaryFrom(''); setSummaryTo('')
                    setRangeStart(''); setRangeEnd('')
                  }}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                >Reset all</button>
              </div>
            )}
          </div>

          {!summary && (
            <div className="px-6 py-6 text-sm text-gray-400 text-center">
              No items match &ldquo;{summarySearch}&rdquo;.
            </div>
          )}

          {summary && summary.mode === 'monthly' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[120px]">
                      {summary.hasSizes ? 'Size' : 'Item'}
                    </th>
                    {summary.visiblePeriods.map(p => (
                      <th key={p.key} className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {p.label}
                      </th>
                    ))}
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-yoi-purple-light">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.sortedGroups.map(g => {
                    const row = summary.groups[g]
                    const total = summary.groupTotals[g]
                    return (
                      <tr key={g} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-semibold text-gray-800">{g}</td>
                        {summary.visiblePeriods.map(p => {
                          const v = row[p.key]?.[metric] ?? 0
                          return (
                            <td key={p.key} className="px-3 py-2.5 text-right text-gray-800 whitespace-nowrap">
                              {v > 0 ? (metric === 'qty' ? v : fmt(v)) : '—'}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2.5 text-right font-bold text-yoi-purple bg-yoi-purple-light whitespace-nowrap">
                          {metric === 'qty' ? total.qty : fmt(total.revenue)}
                        </td>
                      </tr>
                    )
                  })}
                  {summary.sortedGroups.length > 1 && (
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                      <td className="px-4 py-2.5 text-gray-900">All matching</td>
                      {summary.visiblePeriods.map(p => {
                        const sum = summary.sortedGroups.reduce((s, g) => s + (summary.groups[g][p.key]?.[metric] ?? 0), 0)
                        return (
                          <td key={p.key} className="px-3 py-2.5 text-right text-gray-900 whitespace-nowrap">
                            {sum > 0 ? (metric === 'qty' ? sum : fmt(sum)) : '—'}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 text-right text-purple-800 bg-purple-100 whitespace-nowrap">
                        {metric === 'qty'
                          ? summary.sortedGroups.reduce((s, g) => s + summary.groupTotals[g].qty, 0)
                          : fmt(summary.sortedGroups.reduce((s, g) => s + summary.groupTotals[g].revenue, 0))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {summary && summary.mode === 'range' && (
            <div className="overflow-x-auto">
              <div className="px-4 py-2 text-xs text-gray-500 bg-yoi-purple-light border-b border-purple-100">
                Range: <strong>{summary.rangeLabel}</strong>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[120px]">
                      {summary.hasSizes ? 'Size' : 'Item'}
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-yoi-purple-light">
                      Range Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.sortedGroups.map(g => {
                    const total = summary.groupTotals[g]
                    return (
                      <tr key={g} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-semibold text-gray-800">{g}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-yoi-purple bg-yoi-purple-light whitespace-nowrap">
                          {metric === 'qty' ? total.qty : fmt(total.revenue)}
                        </td>
                      </tr>
                    )
                  })}
                  {summary.sortedGroups.length > 1 && (
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                      <td className="px-4 py-2.5 text-gray-900">All matching</td>
                      <td className="px-3 py-2.5 text-right text-purple-800 bg-purple-100 whitespace-nowrap">
                        {metric === 'qty'
                          ? summary.sortedGroups.reduce((s, g) => s + summary.groupTotals[g].qty, 0)
                          : fmt(summary.sortedGroups.reduce((s, g) => s + summary.groupTotals[g].revenue, 0))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
