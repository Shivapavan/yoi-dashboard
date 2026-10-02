import { NextRequest, NextResponse } from 'next/server'
import { getStaffSchedule, saveStaffSchedule, type StaffEntry } from '@/lib/schedule'

export async function GET() {
  try {
    const staff = await getStaffSchedule()
    return NextResponse.json({ staff })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const staff: StaffEntry[] = body.staff
    if (!Array.isArray(staff) || staff.length === 0) {
      return NextResponse.json({ error: 'Invalid staff data' }, { status: 400 })
    }
    await saveStaffSchedule(staff)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
