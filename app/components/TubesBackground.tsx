'use client'

import { useState } from 'react'

interface Props {
  children?: React.ReactNode
  className?: string
  enableClick?: boolean
}

// Three YOI-themed dark palettes — click cycles through them
const PALETTES = [
  { bg: '#07051A', a: 'rgba(79,70,229,0.22)', b: 'rgba(13,148,136,0.15)', c: 'rgba(217,119,6,0.10)' },
  { bg: '#03100F', a: 'rgba(13,148,136,0.25)', b: 'rgba(79,70,229,0.12)', c: 'rgba(244,114,182,0.12)' },
  { bg: '#120A03', a: 'rgba(217,119,6,0.22)', b: 'rgba(147,51,234,0.14)', c: 'rgba(13,148,136,0.10)' },
]

export default function TubesBackground({ children, className, enableClick = true }: Props) {
  const [idx, setIdx] = useState(0)
  const p = PALETTES[idx]

  return (
    <div
      className={`relative overflow-hidden ${className ?? ''}`}
      onClick={enableClick ? () => setIdx(i => (i + 1) % PALETTES.length) : undefined}
      style={{ backgroundColor: p.bg, cursor: enableClick ? 'default' : undefined, transition: 'background-color 0.8s ease' }}
    >
      {/* Ambient glow layers — pure CSS, zero external deps */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 120% 80% at 50% 110%, ${p.a} 0%, transparent 60%)` }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 70% 60% at 15% 15%, ${p.b} 0%, transparent 65%)` }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 50% 55% at 85% 25%, ${p.c} 0%, transparent 65%)` }} />
      {/* Subtle noise texture via SVG filter (no external fetch) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.03,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
        backgroundSize: '200px 200px' }} />

      <div className="relative z-10 w-full pointer-events-none">
        {children}
      </div>
    </div>
  )
}
