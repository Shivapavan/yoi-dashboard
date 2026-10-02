import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { findStaffByToken, DAYS, type ShiftValue } from '@/lib/schedule'
import TimeOffForm from './TimeOffForm'

function getWeekDates(): Record<string, string> {
  const now = new Date()
  const dow = now.getDay()
  const daysFromMon = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysFromMon)
  const result: Record<string, string> = {}
  DAYS.forEach((day, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    result[day] = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })
  return result
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface Props {
  params: Promise<{ token: string }>
}

function ShiftBlock({ value }: { value: ShiftValue }) {
  if (value === null) {
    return <span className="text-gray-400 italic text-sm">Not set</span>
  }
  if (value === 'Off') {
    return <span className="text-gray-400 text-sm">Off</span>
  }
  if (Array.isArray(value)) {
    return (
      <span className="text-sm leading-relaxed font-medium" style={{ color: '#1E1B4B' }}>
        {value[0]}<br />{value[1]}
      </span>
    )
  }
  return <span className="text-sm font-medium" style={{ color: '#1E1B4B' }}>{value}</span>
}

export default async function MySchedulePage({ params }: Props) {
  const { token } = await params
  const person = await findStaffByToken(token)
  if (!person) notFound()

  const weekDates = getWeekDates()

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F0F2FA' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)', boxShadow: '0 2px 8px rgba(13,148,136,0.25)' }}>
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yum_logo.png" alt="Yum of India" className="h-10 w-auto" />
          <div>
            <p className="text-teal-100 text-xs uppercase tracking-widest">Yum of India</p>
            <h1 className="text-white font-bold text-lg leading-tight">Your Schedule</h1>
          </div>
        </div>
      </div>

      {/* Name banner */}
      <div className="max-w-lg mx-auto px-4 pt-5">
        <div
          className="rounded-xl px-5 py-4 mb-4"
          style={{ background: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
        >
          <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: '#64748B' }}>Staff member</p>
          <p className="text-xl font-bold" style={{ color: '#1E1B4B' }}>{person.name}</p>
        </div>

        {/* Weekly schedule cards */}
        <div className="grid grid-cols-1 gap-3 mb-6">
          {DAYS.map(day => {
            const shift = person.schedule[day] ?? null
            const isOff = shift === 'Off'
            const isUnset = shift === null
            return (
              <div
                key={day}
                className="rounded-xl px-5 py-4 flex items-start justify-between"
                style={{
                  background: isOff || isUnset ? '#F9FAFB' : '#FFFFFF',
                  border: `1px solid ${isOff || isUnset ? '#E5E7EB' : '#C7D2FE'}`,
                  borderLeft: `4px solid ${isOff || isUnset ? '#D1D5DB' : '#4F46E5'}`,
                  boxShadow: isOff || isUnset ? 'none' : '0 1px 4px rgba(79,70,229,0.08)',
                }}
              >
                <div className="shrink-0 w-16">
                  <div className="text-sm font-semibold" style={{ color: isOff || isUnset ? '#9CA3AF' : '#4F46E5' }}>{day}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{weekDates[day]}</div>
                </div>
                <div className="flex-1 text-right">
                  <ShiftBlock value={shift} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Time-off request */}
      <TimeOffForm token={token} employeeName={person.name} />
    </div>
  )
}
