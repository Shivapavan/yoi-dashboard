'use client'

import { ReactNode } from 'react'

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
      style={{ color: '#94A3B8' }}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  )
}

interface SectionCardProps {
  title?: string
  subtitle?: string
  accent?: string
  summary?: ReactNode
  className?: string
  children?: ReactNode
}

export function SectionCard({ title, subtitle, accent, summary, className, children }: SectionCardProps) {
  return (
    <div
      className={`rounded-xl overflow-hidden ${className ?? 'mt-4'}`}
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
    >
      {(title || summary) && (
        <div
          className="px-6 py-4 flex items-center justify-between gap-3"
          style={{
            borderBottom: '1px solid #E4E7F3',
            borderLeft: accent ? `4px solid ${accent.replace('border-l-', '').replace('border-l-yoi-primary', '#0D9488').replace('border-l-yoi-accent', '#D97706')}` : undefined,
          }}
        >
          <div className="min-w-0">
            {title && <h3 className="font-semibold text-sm" style={{ color: '#1E1B4B' }}>{title}</h3>}
            {subtitle && <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{subtitle}</p>}
          </div>
          {summary && <div className="flex items-center gap-3 text-sm flex-shrink-0">{summary}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

interface CollapsibleSectionProps extends Omit<SectionCardProps, 'className'> {
  open: boolean
  onToggle: () => void
  className?: string
}

export function CollapsibleSection({
  title, subtitle, accent, summary, open, onToggle, className, children,
}: CollapsibleSectionProps) {
  const accentColor = accent?.includes('yoi-primary') ? '#0D9488' : accent?.includes('yoi-accent') ? '#D97706' : '#0D9488'

  return (
    <div
      className={`rounded-xl overflow-hidden ${className ?? 'mt-4'}`}
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 transition-colors text-left"
        style={{
          borderBottom: '1px solid #E4E7F3',
          borderLeft: `4px solid ${accentColor}`,
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F5F6FD')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <div className="min-w-0">
          <span className="font-semibold text-sm" style={{ color: '#1E1B4B' }}>{title}</span>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 text-sm flex-shrink-0">
          {summary}
          <Chevron open={open} />
        </div>
      </button>
      {open && children}
    </div>
  )
}
