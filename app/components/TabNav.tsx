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
    <div className="relative mb-6 -mx-6 px-6" style={{ borderBottom: '1px solid #21262D' }}>
      <div className="overflow-x-auto scrollbar-none pb-3">
        <div className="flex gap-1 min-w-max">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              aria-current={active === t.id ? 'page' : undefined}
              className="px-3.5 py-1.5 text-sm font-medium transition-all whitespace-nowrap rounded-full"
              style={
                active === t.id
                  ? { backgroundColor: '#0D9488', color: '#fff', boxShadow: '0 0 12px rgba(13,148,136,0.4)' }
                  : { color: '#8B949E', backgroundColor: 'transparent' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10" style={{ background: 'linear-gradient(to left, #0D1117, transparent)' }} />
    </div>
  )
}
