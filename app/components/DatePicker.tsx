'use client'

interface Props { value: string; onChange: (d: string) => void; min?: string }

export default function DatePicker({ value, onChange, min }: Props) {
  const today = new Date().toISOString().split('T')[0]
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">📅 Date:</span>
      <input type="date" value={value} min={min} max={today}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
      <button onClick={() => onChange(today)}
        className="bg-gray-900 text-white text-sm font-semibold px-4 py-1.5 rounded hover:bg-gray-700 transition-colors">
        Today
      </button>
      {value === today && <span className="text-sm font-semibold text-gray-700 ml-auto">Today&apos;s data</span>}
    </div>
  )
}
