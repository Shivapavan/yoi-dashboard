'use client'

import { useState } from 'react'

interface MetricCardProps {
  label: string
  value: number
  borderColor: string
  note?: string
  formula?: string
  breakdown?: string
  deltaPct?: number | null
  inverse?: boolean
}

export default function MetricCard({
  label, value, borderColor, note, formula, breakdown, deltaPct, inverse,
}: MetricCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

  const showDelta = typeof deltaPct === 'number' && isFinite(deltaPct)
  const isUp = (deltaPct ?? 0) >= 0
  const isGood = inverse ? !isUp : isUp
  const arrow = isUp ? '▲' : '▼'
  const deltaText = isGood
    ? `${arrow} ${Math.abs(deltaPct!).toFixed(1)}%`
    : `${arrow} ${Math.abs(deltaPct!).toFixed(1)}%`

  return (
    <div
      className="relative rounded-xl p-5 transition-all duration-200"
      style={{
        backgroundColor: '#161B22',
        border: '1px solid #21262D',
        borderTop: `3px solid ${borderColor}`,
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8B949E' }}>{label}</p>
        {formula && (
          <button
            type="button"
            onClick={() => setShowTooltip(v => !v)}
            className="w-5 h-5 -mr-0.5 -mt-0.5 rounded-full text-[10px] leading-none flex items-center justify-center transition-colors"
            style={{ border: '1px solid #30363D', color: '#6E7681', backgroundColor: '#0D1117' }}
            aria-label={`Show how ${label} is calculated`}
          >
            ?
          </button>
        )}
      </div>

      <p className="text-3xl font-bold tracking-tight mb-2" style={{ color: '#E6EDF3' }}>{formatted}</p>

      {showDelta && (
        <span
          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
          style={
            isGood
              ? { backgroundColor: 'rgba(22,163,74,0.15)', color: '#4ADE80' }
              : { backgroundColor: 'rgba(220,38,38,0.15)', color: '#F87171' }
          }
        >
          {deltaText} <span className="font-normal opacity-70">vs 14d avg</span>
        </span>
      )}

      {breakdown && <p className="text-xs mt-2 font-mono" style={{ color: '#6E7681' }}>{breakdown}</p>}
      {note && <p className="text-xs mt-1" style={{ color: '#6E7681' }}>{note}</p>}

      {formula && showTooltip && (
        <div
          className="absolute z-20 left-3 right-3 top-full mt-2 text-xs rounded-xl p-3 shadow-2xl leading-relaxed pointer-events-none"
          style={{ backgroundColor: '#1C2333', border: '1px solid #30363D', color: '#C9D1D9' }}
        >
          {formula}
          {breakdown && (
            <div className="mt-2 pt-2 font-mono text-[11px]" style={{ borderTop: '1px solid #30363D', color: '#8B949E' }}>
              {breakdown}
            </div>
          )}
          <div className="absolute -top-1.5 left-6 w-2.5 h-2.5 rotate-45" style={{ backgroundColor: '#1C2333', borderLeft: '1px solid #30363D', borderTop: '1px solid #30363D' }} />
        </div>
      )}
    </div>
  )
}
