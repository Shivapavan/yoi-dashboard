// SERVER-ONLY — never import from a client component
import 'server-only'

export type ShiftValue = string | string[] | null

export interface StaffEntry {
  name: string
  token: string
  schedule: Record<string, ShiftValue>
}

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type Day = typeof DAYS[number]

export const STAFF: StaffEntry[] = [
  {
    name: 'Vaishu',
    token: 'p2Hds3wfRUGHjdDTgQ4ymoh66mo',
    schedule: {
      Mon: null, Tue: 'Off', Wed: 'Off', Thu: '5-10 PM', Fri: '5-10:30 PM',
      Sat: ['9:15 AM-3 PM', '5-10 PM'], Sun: ['9:15 AM-3 PM', '5-10 PM'],
    },
  },
  {
    name: 'Pradeep',
    token: 'zXWCqY_ODMbQW66HbOdY0d1egW4',
    schedule: {
      Mon: '5-10 PM', Tue: '5-10 PM', Wed: '5-10 PM', Thu: 'Off',
      Fri: '5-10 PM', Sat: '5-10 PM', Sun: 'Off',
    },
  },
  {
    name: 'Sanvitha',
    token: 'ZpFpGgBx3jAdvTG-Bcwk4PwkMOY',
    schedule: {
      Mon: 'Off', Tue: 'Off', Wed: '5-10 PM', Thu: '5-10 PM', Fri: 'Off',
      Sat: ['9:15 AM-3 PM', '5-10 PM'], Sun: ['9:15 AM-3 PM', '5-10 PM'],
    },
  },
  {
    name: 'Vaisnavi',
    token: 'kSS84Q2V5KVjKdCl-zhch8YLXHs',
    schedule: {
      Mon: '5:30-10 PM', Tue: 'Off', Wed: '5:30-10 PM', Thu: '5:30-10 PM',
      Fri: '6-10:30 PM', Sat: 'Off', Sun: 'Off',
    },
  },
  {
    name: 'Madhurya',
    token: 'Hqdut_LMU0DEKbBRs0o2F2qG39E',
    schedule: {
      Mon: '5:30-10 PM', Tue: 'Off', Wed: '5:30-10 PM', Thu: '5:30-10 PM',
      Fri: '6-10:30 PM', Sat: 'Off', Sun: 'Off',
    },
  },
  {
    name: 'Janvi',
    token: 'zd3VNfp8VceF8rKHBPAXwJzsFBU',
    schedule: {
      Mon: 'Off', Tue: '5-10 PM', Wed: 'Off', Thu: 'Off', Fri: '6 PM-Close',
      Sat: ['11:30 AM-4 PM', '6:30 PM-Close'], Sun: ['11:30 AM-4 PM', '6:30 PM-Close'],
    },
  },
  {
    name: 'Charan',
    token: 'Js46LkVdVFZWqLmaRvwrja_L3zg',
    schedule: {
      Mon: 'Off', Tue: 'Off', Wed: 'Off', Thu: 'Off', Fri: '6:30 PM-Close',
      Sat: ['12:30-4 PM', '7 PM-Close'], Sun: ['12:30-4 PM', '7 PM-Close'],
    },
  },
  {
    name: 'Rahul',
    token: 'v_CmxFXc8pQsYv80TDkzDiM9uoM',
    schedule: {
      Mon: 'Off', Tue: 'Off', Wed: 'Off', Thu: 'Off', Fri: '6:30 PM-Close',
      Sat: ['12:30-4 PM', '6:30 PM-Close'], Sun: ['12:30-4 PM', '6:30 PM-Close'],
    },
  },
]

export function findByToken(token: string): StaffEntry | undefined {
  return STAFF.find(s => s.token === token)
}
