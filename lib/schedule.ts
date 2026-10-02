// SERVER-ONLY — never import from a client component
import 'server-only'
import { getDb } from './db'

export type ShiftValue = string | string[] | null

export interface StaffEntry {
  name: string
  token: string
  schedule: Record<string, ShiftValue>
}

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type Day = typeof DAYS[number]

// Hardcoded fallback — used when DB table has no rows yet
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

async function ensureTable(db: ReturnType<typeof getDb>) {
  await db`
    CREATE TABLE IF NOT EXISTS staff_schedule (
      id         SERIAL      PRIMARY KEY,
      data       JSONB       NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await db`
    CREATE TABLE IF NOT EXISTS time_off_requests (
      id             SERIAL      PRIMARY KEY,
      employee_token TEXT        NOT NULL,
      employee_name  TEXT        NOT NULL,
      request_date   DATE        NOT NULL,
      reason         TEXT,
      submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export async function getStaffSchedule(): Promise<StaffEntry[]> {
  try {
    const db = getDb()
    await ensureTable(db)
    const rows = await db`SELECT data FROM staff_schedule ORDER BY updated_at DESC LIMIT 1`
    if (rows.length > 0) return rows[0].data as StaffEntry[]
  } catch { /* fall through */ }
  return STAFF
}

export async function saveStaffSchedule(staff: StaffEntry[]): Promise<void> {
  const db = getDb()
  await ensureTable(db)
  await db`DELETE FROM staff_schedule`
  await db`INSERT INTO staff_schedule (data) VALUES (${JSON.stringify(staff)}::jsonb)`
}

export async function findStaffByToken(token: string): Promise<StaffEntry | undefined> {
  const staff = await getStaffSchedule()
  return staff.find(s => s.token === token)
}

export interface TimeOffRequest {
  id: number
  employeeToken: string
  employeeName: string
  requestDate: string
  reason: string | null
  submittedAt: string
}

export async function saveTimeOffRequest(req: Omit<TimeOffRequest, 'id' | 'submittedAt'>): Promise<void> {
  const db = getDb()
  await ensureTable(db)
  await db`
    INSERT INTO time_off_requests (employee_token, employee_name, request_date, reason)
    VALUES (${req.employeeToken}, ${req.employeeName}, ${req.requestDate}, ${req.reason ?? null})
  `
}

export async function getTimeOffRequests(): Promise<TimeOffRequest[]> {
  try {
    const db = getDb()
    await ensureTable(db)
    const rows = await db`
      SELECT id, employee_token, employee_name, request_date, reason, submitted_at
      FROM time_off_requests
      ORDER BY submitted_at DESC
      LIMIT 100
    `
    return rows.map(r => ({
      id: r.id,
      employeeToken: r.employee_token,
      employeeName: r.employee_name,
      requestDate: String(r.request_date).slice(0, 10),
      reason: r.reason,
      submittedAt: r.submitted_at,
    }))
  } catch { return [] }
}
