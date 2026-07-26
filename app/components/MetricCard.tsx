'use client'

import { useState } from 'react'
import { computeDelta } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: number
  borderColor: string
  note?: string
  formula?: string
  breakdown?: string
  avg?: number | null
  inverse?: boolean
  deltaPct?: number | null
  sourceBreakdown?: string
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function MetricCard({
  label, value, borderColor, note, formula, breakdown, avg, inverse, sourceBreakdown,
}: MetricCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const formatted = currency.format(value)

  const delta = computeDelta(value, avg)
  const showDelta = delta !== null
  const isUp = (delta?.diff ?? 0) >= 0
  const isGood = inverse ? !isUp : isUp
  const arrow = isUp ? '▲' : '▼'
  const deltaText = delta?.useAbs
    ? `${isUp ? '+' : '−'}${currency.format(Math.abs(delta.diff))} vs avg`
    : `${arrow} ${Math.abs(delta?.pct ?? 0).toFixed(1)}%`

  return (
    <div
      className="relative rounded-xl p-5 transition-all duration-200"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E4E7F3',
        borderTop: `3px solid ${borderColor}`,
        boxShadow: '0 1px 4px rgba(79,70,229,0.06)',
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#94A3B8' }}>{label}</p>
        {formula && (
          <button
            type="button"
            onClick={() => setShowTooltip(v => !v)}
            className="w-5 h-5 -mr-0.5 -mt-0.5 rounded-full text-[10px] leading-none flex items-center justify-center transition-colors"
            style={{ border: '1px solid #E4E7F3', color: '#94A3B8', backgroundColor: '#F5F6FD' }}
            aria-label={`Show how ${label} is calculated`}
          >
            ?
          </button>
        )}
      </div>

      <p className="text-3xl font-bold tracking-tight mb-2" style={{ color: '#1E1B4B' }}>{formatted}</p>

      {showDelta && (
        <span
          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
          style={
            isGood
              ? { backgroundColor: 'rgba(22,163,74,0.1)', color: '#16A34A' }
              : { backgroundColor: 'rgba(220,38,38,0.1)', color: '#DC2626' }
          }
        >
          {deltaText} <span className="font-normal opacity-70">vs 14d avg</span>
        </span>
      )}

      {breakdown && <p className="text-xs mt-2 font-mono" style={{ color: '#94A3B8' }}>{breakdown}</p>}
      {sourceBreakdown && <p className="text-xs mt-1 font-mono" style={{ color: '#94A3B8' }}>{sourceBreakdown}</p>}
      {note && <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{note}</p>}

      {formula && showTooltip && (
        <div
          className="absolute z-20 left-3 right-3 top-full mt-2 text-xs rounded-xl p-3 shadow-xl leading-relaxed pointer-events-none"
          style={{ backgroundColor: '#1E1B4B', border: '1px solid #312E81', color: '#E0E7FF' }}
        >
          {formula}
          {breakdown && (
            <div className="mt-2 pt-2 font-mono text-[11px]" style={{ borderTop: '1px solid #312E81', color: '#A5B4FC' }}>
              {breakdown}
            </div>
          )}
          <div className="absolute -top-1.5 left-6 w-2.5 h-2.5 rotate-45" style={{ backgroundColor: '#1E1B4B', borderLeft: '1px solid #312E81', borderTop: '1px solid #312E81' }} />
        </div>
      )}
    </div>
  )
}
