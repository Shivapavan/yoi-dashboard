'use client'

export type Tab = 'end-of-day' | 'sales-trend' | 'top-items' | 'item-trends' | 'catering' | 'visitors' | 'emp-shdt' | 'expenses' | 'containers' | 'reviews' | 'activity' | 'menu-editor' | 'events-space'

interface Props { active: Tab; onChange: (t: Tab) => void; isAdmin?: boolean; canEditMenu?: boolean }

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'end-of-day',   label: 'End of Day' },
  { id: 'sales-trend',  label: 'Sales Trend' },
  { id: 'top-items',    label: 'Top Items' },
  { id: 'item-trends',  label: 'Item Trends' },
  { id: 'catering',     label: 'Catering' },
  { id: 'events-space', label: 'Events Space' },
  { id: 'containers',   label: 'Containers' },
  { id: 'reviews',      label: 'Reviews' },
  { id: 'visitors',     label: 'Visitors' },
  { id: 'emp-shdt',     label: 'Staff' },
  { id: 'expenses',     label: 'Expenses' },
]

const MENU_TAB: { id: Tab; label: string } = { id: 'menu-editor', label: 'Menu' }
const ADMIN_ONLY_TABS: { id: Tab; label: string }[] = [
  { id: 'activity', label: 'Activity' },
]

export default function TabNav({ active, onChange, isAdmin, canEditMenu }: Props) {
  const tabs = [
    ...BASE_TABS,
    ...(canEditMenu ? [MENU_TAB] : []),
    ...(isAdmin ? ADMIN_ONLY_TABS : []),
  ]

  return (
    <div className="relative border-b border-gray-200 mb-6">
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex gap-1 min-w-max">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => onChange(t.id)}
              aria-current={active === t.id ? 'page' : undefined}
              className={`pb-3 px-3 text-sm font-medium transition-colors whitespace-nowrap ${
                active === t.id ? 'border-b-2 border-yoi-primary text-yoi-primary' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent" />
    </div>
  )
}
