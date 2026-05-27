'use client'

import { ReactNode } from 'react'

/** Single source of truth for the chevron used on every expandable section. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
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
  /** Tailwind left-border accent class, e.g. "border-l-yoi-purple". */
  accent?: string
  /** Right-aligned header content (counts, totals, badges). */
  summary?: ReactNode
  /** Outer wrapper classes — defaults to the standard top margin between sections. */
  className?: string
  children?: ReactNode
}

/** A static (non-collapsible) white section card with an optional accented header. */
export function SectionCard({ title, subtitle, accent, summary, className, children }: SectionCardProps) {
  return (
    <div className={`bg-white rounded-lg shadow-sm overflow-hidden ${className ?? 'mt-4'}`}>
      {(title || summary) && (
        <div className={`px-6 py-4 border-b border-gray-100 ${accent ? `border-l-4 ${accent}` : ''} flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            {title && <h3 className="font-semibold text-gray-800">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
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

/** A section card whose header is a button that expands/collapses its children. */
export function CollapsibleSection({
  title, subtitle, accent = 'border-l-yoi-purple', summary, open, onToggle, className, children,
}: CollapsibleSectionProps) {
  return (
    <div className={`bg-white rounded-lg shadow-sm overflow-hidden ${className ?? 'mt-4'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-3 px-6 py-4 border-l-4 ${accent} border-b border-gray-100 hover:bg-gray-50 transition-colors text-left`}
      >
        <div className="min-w-0">
          <span className="font-semibold text-gray-800">{title}</span>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
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
