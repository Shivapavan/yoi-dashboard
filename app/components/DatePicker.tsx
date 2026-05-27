'use client'

interface Props { value: string; onChange: (d: string) => void; min?: string; max?: string }

export default function DatePicker({ value, onChange, min, max }: Props) {
  // Use caller-supplied max (CDT business day) — falls back to UTC date if not provided
  const today = max || new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600 font-medium">Date</label>
      <input type="date" value={value} min={min} max={today}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select date"
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yoi-purple" />
      <button onClick={() => onChange(today)}
        className="bg-yoi-purple text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-yoi-purple-dark transition-colors">
        Today
      </button>
      {value === today && <span className="text-sm font-semibold text-gray-700 ml-auto">Today&apos;s data</span>}
    </div>
  )
}
