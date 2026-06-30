'use client'

interface Props { value: string; onChange: (d: string) => void; min?: string; max?: string }

export default function DatePicker({ value, onChange, min, max }: Props) {
  // Use caller-supplied max (CDT business day) — falls back to UTC date if not provided
  const today = max || new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium" style={{ color: '#8B949E' }}>Date</label>
      <input type="date" value={value} min={min} max={today}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select date"
        className="rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yoi-primary"
        style={{ backgroundColor: '#0D1117', border: '1px solid #30363D', color: '#E6EDF3', colorScheme: 'dark' }} />
      <button onClick={() => onChange(today)}
        className="text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        style={{ backgroundColor: '#0D9488' }}>
        Today
      </button>
      {value === today && <span className="text-sm font-semibold ml-auto" style={{ color: '#8B949E' }}>Today&apos;s data</span>}
    </div>
  )
}
