'use client'

interface Props { value: string; onChange: (d: string) => void; min?: string; max?: string }

export default function DatePicker({ value, onChange, min, max }: Props) {
  const today = max || new Date(Date.now() - 4 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium" style={{ color: '#64748B' }}>Date</label>
      <input type="date" value={value} min={min} max={today}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select date"
        className="rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        style={{ backgroundColor: '#F5F6FD', border: '1px solid #E4E7F3', color: '#1E1B4B' }} />
      <button onClick={() => onChange(today)}
        className="text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        style={{ background: 'linear-gradient(135deg, #4F46E5, #7C3AED)' }}>
        Today
      </button>
      {value === today && <span className="text-sm font-semibold ml-auto" style={{ color: '#64748B' }}>Today&apos;s data</span>}
    </div>
  )
}
