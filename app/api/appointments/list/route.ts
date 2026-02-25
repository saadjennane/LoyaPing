import { NextRequest, NextResponse } from 'next/server'
import { getAppointmentList } from '@/lib/services/appointments'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/appointments/list
// Query params:
//   mode         = 'upcoming' | 'history'                         (required)
//   from         = YYYY-MM-DD                                      (optional, defaults to today / today-30d)
//   to           = YYYY-MM-DD                                      (optional, defaults to today+30d / yesterday)
//   statusFilter = 'all' | 'upcoming' | 'show' | 'no_show'        (default: 'all')
//   notifFilter  = 'all' | 'failed_only'                          (default: 'all')
export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const mode = sp.get('mode') as 'upcoming' | 'history' | null

    if (mode !== 'upcoming' && mode !== 'history') {
      return NextResponse.json({ error: 'mode must be "upcoming" or "history"' }, { status: 400 })
    }

    // Compute default window based on today (server-side UTC date)
    const todayStr = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD" UTC

    function addDays(base: string, days: number): string {
      const d = new Date(base)
      d.setUTCDate(d.getUTCDate() + days)
      return d.toISOString().slice(0, 10)
    }

    const defaultFrom = mode === 'upcoming' ? todayStr            : addDays(todayStr, -30)
    const defaultTo   = mode === 'upcoming' ? addDays(todayStr, 30) : addDays(todayStr, -1)

    const from = sp.get('from') ?? defaultFrom
    const to   = sp.get('to')   ?? defaultTo

    const statusFilter = (sp.get('statusFilter') ?? 'all') as 'all' | 'upcoming' | 'show' | 'no_show' | 'unassigned'
    const notifFilter  = (sp.get('notifFilter')  ?? 'all') as 'all' | 'failed_only'

    const data = await getAppointmentList({
      businessId: DEFAULT_BUSINESS_ID,
      mode,
      from,
      to,
      statusFilter,
      notifFilter,
    })

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
