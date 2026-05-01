'use client'

export type Tab = 'end-of-day' | 'sales-trend' | 'top-items'

interface Props { active: Tab; onChange: (t: Tab) => void }

const TABS: { id: Tab; label: string }[] = [
  { id: 'end-of-day', label: 'End of Day' },
  { id: 'sales-trend', label: 'Sales Trend' },
  { id: 'top-items', label: 'Top Items' },
]

export default function TabNav({ active, onChange }: Props) {
  return (
    <div className="flex gap-6 border-b border-gray-200 mb-6">
      {TABS.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`pb-3 text-sm font-medium transition-colors ${
            active === t.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
