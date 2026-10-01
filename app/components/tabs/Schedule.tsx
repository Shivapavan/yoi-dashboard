'use client'

import { useState } from 'react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

type ShiftValue = string | string[] | null

interface StaffRow {
  name: string
  token: string
  schedule: Record<string, ShiftValue>
}

// Static data duplicated here (client-safe — no server-only import).
// Tokens are not secret (they're the share links), just stable identifiers.
const STAFF: StaffRow[] = [
  {
    name: 'Vaishu', token: 'p2Hds3wfRUGHjdDTgQ4ymoh66mo',
    schedule: { Mon: null, Tue: 'Off', Wed: 'Off', Thu: '5-10 PM', Fri: '5-10:30 PM',
      Sat: ['9:15 AM-3 PM', '5-10 PM'], Sun: ['9:15 AM-3 PM', '5-10 PM'] },
  },
  {
    name: 'Pradeep', token: 'zXWCqY_ODMbQW66HbOdY0d1egW4',
    schedule: { Mon: '5-10 PM', Tue: '5-10 PM', Wed: '5-10 PM', Thu: 'Off',
      Fri: '5-10 PM', Sat: '5-10 PM', Sun: 'Off' },
  },
  {
    name: 'Sanvitha', token: 'ZpFpGgBx3jAdvTG-Bcwk4PwkMOY',
    schedule: { Mon: 'Off', Tue: 'Off', Wed: '5-10 PM', Thu: '5-10 PM', Fri: 'Off',
      Sat: ['9:15 AM-3 PM', '5-10 PM'], Sun: ['9:15 AM-3 PM', '5-10 PM'] },
  },
  {
    name: 'Vaisnavi', token: 'kSS84Q2V5KVjKdCl-zhch8YLXHs',
    schedule: { Mon: '5:30-10 PM', Tue: 'Off', Wed: '5:30-10 PM', Thu: '5:30-10 PM',
      Fri: '6-10:30 PM', Sat: 'Off', Sun: 'Off' },
  },
  {
    name: 'Madhurya', token: 'Hqdut_LMU0DEKbBRs0o2F2qG39E',
    schedule: { Mon: '5:30-10 PM', Tue: 'Off', Wed: '5:30-10 PM', Thu: '5:30-10 PM',
      Fri: '6-10:30 PM', Sat: 'Off', Sun: 'Off' },
  },
  {
    name: 'Janvi', token: 'zd3VNfp8VceF8rKHBPAXwJzsFBU',
    schedule: { Mon: 'Off', Tue: '5-10 PM', Wed: 'Off', Thu: 'Off', Fri: '6 PM-Close',
      Sat: ['11:30 AM-4 PM', '6:30 PM-Close'], Sun: ['11:30 AM-4 PM', '6:30 PM-Close'] },
  },
  {
    name: 'Charan', token: 'Js46LkVdVFZWqLmaRvwrja_L3zg',
    schedule: { Mon: 'Off', Tue: 'Off', Wed: 'Off', Thu: 'Off', Fri: '6:30 PM-Close',
      Sat: ['12:30-4 PM', '7 PM-Close'], Sun: ['12:30-4 PM', '7 PM-Close'] },
  },
  {
    name: 'Rahul', token: 'v_CmxFXc8pQsYv80TDkzDiM9uoM',
    schedule: { Mon: 'Off', Tue: 'Off', Wed: 'Off', Thu: 'Off', Fri: '6:30 PM-Close',
      Sat: ['12:30-4 PM', '6:30 PM-Close'], Sun: ['12:30-4 PM', '6:30 PM-Close'] },
  },
]

function ShiftCell({ value }: { value: ShiftValue }) {
  if (value === null) {
    return <span className="text-xs text-gray-300 italic">—</span>
  }
  if (value === 'Off') {
    return <span className="text-xs text-gray-400">Off</span>
  }
  if (Array.isArray(value)) {
    return (
      <span className="text-xs leading-relaxed">
        {value[0]}<br />{value[1]}
      </span>
    )
  }
  return <span className="text-xs">{value}</span>
}

function CopyButton({ token, name }: { token: string; name: string }) {
  const [copied, setCopied] = useState(false)
  const url = `https://yoi-dashboard.vercel.app/my-schedule/${token}`

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy link for ${name}`}
      className="ml-2 px-2 py-0.5 text-xs rounded transition-colors"
      style={
        copied
          ? { background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7' }
          : { background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE' }
      }
    >
      {copied ? '✓ Copied' : 'Copy link'}
    </button>
  )
}

export default function Schedule() {
  return (
    <div className="mt-4">
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: '#E4E7F3' }}>
          <h2 className="font-semibold text-base" style={{ color: '#1E1B4B' }}>Weekly Staff Schedule</h2>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            Use "Copy link" to send each person their personal schedule page.
          </p>
        </div>

        {/* Scrollable grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: '700px' }}>
            <thead>
              <tr style={{ background: '#F8F9FF' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B', minWidth: '160px' }}>
                  Staff
                </th>
                {DAYS.map(d => (
                  <th key={d} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-center" style={{ color: '#64748B' }}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAFF.map((person, i) => (
                <tr
                  key={person.name}
                  style={{
                    borderTop: i > 0 ? '1px solid #E4E7F3' : undefined,
                    background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFE',
                  }}
                >
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center flex-wrap gap-y-1">
                      <span className="font-medium" style={{ color: '#1E1B4B' }}>{person.name}</span>
                      <CopyButton token={person.token} name={person.name} />
                    </div>
                  </td>
                  {DAYS.map(day => (
                    <td key={day} className="px-3 py-3 text-center align-top" style={{ color: '#374151' }}>
                      <ShiftCell value={person.schedule[day] ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
