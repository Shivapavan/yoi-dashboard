'use client'

export type Tab = 'end-of-day' | 'sales-trend' | 'top-items' | 'item-trends' | 'catering' | 'table-reservations' | 'visitors' | 'emp-shdt' | 'expenses' | 'containers' | 'reviews' | 'activity' | 'menu-editor' | 'events-space' | 'instagram' | 'tiktok' | 'local-intel' | 'scraper' | 'blog'

interface Props { active: Tab; onChange: (t: Tab) => void; isAdmin?: boolean; canEditMenu?: boolean; canScrape?: boolean }

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'end-of-day',   label: 'End of Day' },
  { id: 'sales-trend',  label: 'Sales Trend' },
  { id: 'top-items',    label: 'Top Items' },
  { id: 'item-trends',  label: 'Item Trends' },
  { id: 'catering',            label: 'Catering' },
  { id: 'table-reservations', label: '🍽️ Table Reservations' },
  { id: 'events-space',       label: 'Events Space' },
  { id: 'blog',         label: 'Blog' },
  { id: 'containers',   label: 'Containers' },
  { id: 'reviews',      label: 'Reviews' },
  { id: 'visitors',     label: 'Visitors' },
  { id: 'emp-shdt',     label: 'Staff' },
  { id: 'expenses',     label: 'Expenses' },
  { id: 'instagram',   label: 'Instagram' },
  { id: 'tiktok',      label: 'TikTok' },
  { id: 'local-intel', label: '🗺 Local Intel' },
]

const MENU_TAB: { id: Tab; label: string } = { id: 'menu-editor', label: 'Menu' }
const ADMIN_ONLY_TABS: { id: Tab; label: string }[] = [
  { id: 'activity', label: 'Activity' },
]
const SCRAPER_TAB: { id: Tab; label: string } = { id: 'scraper', label: '🕷 Scraper' }

export default function TabNav({ active, onChange, isAdmin, canEditMenu, canScrape }: Props) {
  const tabs = [
    ...BASE_TABS,
    ...(canEditMenu ? [MENU_TAB] : []),
    ...(isAdmin ? ADMIN_ONLY_TABS : []),
    ...(canScrape ? [SCRAPER_TAB] : []),
  ]

  return (
    <div className="relative mb-6 -mx-6 px-6" style={{ borderBottom: '1px solid #E4E7F3', backgroundColor: '#FFFFFF' }}>
      <div className="overflow-x-auto scrollbar-none pb-3">
        <div className="flex gap-1 min-w-max pt-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              aria-current={active === t.id ? 'page' : undefined}
              className="px-3.5 py-1.5 text-sm font-medium transition-all whitespace-nowrap rounded-full"
              style={
                active === t.id
                  ? { background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: '#fff', boxShadow: '0 2px 8px rgba(79,70,229,0.35)' }
                  : { color: '#64748B', backgroundColor: 'transparent' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10" style={{ background: 'linear-gradient(to left, #FFFFFF, transparent)' }} />
    </div>
  )
}
