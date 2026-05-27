'use client'

import { useState } from 'react'

interface MetricCardProps {
  label: string
  value: number
  borderColor: string
  note?: string
  formula?: string  // hover/tap to see explanation
  breakdown?: string  // numerical breakdown shown under the value, e.g. "= $X + $Y + $Z"
  deltaPct?: number | null  // % vs 14-day average. null = no comparison data yet.
  inverse?: boolean  // true for metrics where "higher is worse" (voids, discounts, etc.)
}

export default function MetricCard({
  label, value, borderColor, note, formula, breakdown, deltaPct, inverse,
}: MetricCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

  // Color logic: positive delta is green for normal metrics, red for inverse (voids/discounts)
  const showDelta = typeof deltaPct === 'number' && isFinite(deltaPct)
  const isUp = (deltaPct ?? 0) >= 0
  const isGood = inverse ? !isUp : isUp
  const deltaColor = isGood ? 'text-success' : 'text-danger'
  const arrow = isUp ? '▲' : '▼'

  return (
    <div
      className="relative bg-white rounded-lg p-5 shadow-sm"
      style={{ borderLeft: `4px solid ${borderColor}` }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
        {formula && (
          <button
            type="button"
            onClick={() => setShowTooltip(v => !v)}
            className="w-6 h-6 -mr-1 rounded-full border border-gray-300 text-gray-500 text-[11px] leading-none flex items-center justify-center hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label={`Show how ${label} is calculated`}
          >
            ?
          </button>
        )}
      </div>
      <p className="text-3xl font-bold text-gray-900">{formatted}</p>
      {showDelta && (
        <div className="text-xs font-medium mt-1.5 flex items-center gap-1">
          <span className={deltaColor}>{arrow} {Math.abs(deltaPct!).toFixed(1)}%</span>
          <span className="text-gray-400 font-normal">vs 14d avg</span>
        </div>
      )}
      {breakdown && <p className="text-xs text-gray-500 mt-1.5 font-mono">{breakdown}</p>}
      {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}

      {formula && showTooltip && (
        <div className="absolute z-20 left-3 right-3 top-full mt-1 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg leading-relaxed pointer-events-none">
          {formula}
          {breakdown && <div className="mt-2 pt-2 border-t border-gray-700 font-mono text-[11px]">{breakdown}</div>}
          <div className="absolute -top-1 left-6 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  )
}
