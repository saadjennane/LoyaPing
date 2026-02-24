import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import type {
  DashboardSummary,
  DashboardOrderItem,
  DashboardApptItem,
  DashboardLoyaltyItem,
} from '@/lib/types'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/dashboard/summary
// Returns today's operational summary for all enabled modules.
export async function GET() {
  try {
    const db = createServerClient()

    // ── Phase 1: business meta (always needed) ────────────────────────────────
    const [profileRes, modulesRes] = await Promise.all([
      db.from('business_profile').select('name').eq('business_id', DEFAULT_BUSINESS_ID).single(),
      db.from('business_modules')
        .select('orders_enabled, appointments_enabled, loyalty_enabled')
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .maybeSingle(),
    ])

    if (profileRes.error) throw profileRes.error

    const businessName = profileRes.data.name
    const modules = modulesRes.data ?? {
      orders_enabled: true,
      appointments_enabled: true,
      loyalty_enabled: true,
    }

    // ── Phase 2: today's date boundaries (UTC) ─────────────────────────────────
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const tomorrowStart = new Date(todayStart)
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1)
    const dayAfterStart = new Date(tomorrowStart)
    dayAfterStart.setUTCDate(dayAfterStart.getUTCDate() + 1)

    const todayIso      = todayStart.toISOString()
    const tomorrowIso   = tomorrowStart.toISOString()
    const dayAfterIso   = dayAfterStart.toISOString()

    // ── Phase 2: parallel module queries ──────────────────────────────────────
    const ordersPromise = modules.orders_enabled
      ? db
          .from('orders')
          .select(`
            id, reference, status, ready_at, reminders_count, created_at,
            client:client_id ( first_name, last_name, phone_number )
          `)
          .eq('business_id', DEFAULT_BUSINESS_ID)
          .is('deleted_at', null)
          .in('status', ['ready', 'pending'])
          .order('ready_at', { ascending: true, nullsFirst: false })
      : Promise.resolve(null)

    const apptsTodayPromise = modules.appointments_enabled
      ? db
          .from('appointments')
          .select(`
            id, scheduled_at, status,
            client:client_id ( first_name, last_name, phone_number )
          `)
          .eq('business_id', DEFAULT_BUSINESS_ID)
          .is('deleted_at', null)
          .gte('scheduled_at', todayIso)
          .lt('scheduled_at', tomorrowIso)
          .order('scheduled_at', { ascending: true })
      : Promise.resolve(null)

    const apptsTomorrowCountPromise = modules.appointments_enabled
      ? db
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', DEFAULT_BUSINESS_ID)
          .is('deleted_at', null)
          .gte('scheduled_at', tomorrowIso)
          .lt('scheduled_at', dayAfterIso)
      : Promise.resolve(null)

    const couponsPromise = modules.loyalty_enabled
      ? db
          .from('coupons')
          .select(`
            id, status, expires_at, created_at, source,
            tier:tier_id ( business_id, reward_title ),
            client:client_id ( first_name, last_name, phone_number )
          `)
          .eq('tier.business_id', DEFAULT_BUSINESS_ID)
          .in('status', ['active'])
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve(null)

    const [ordersRes, apptsTodayRes, apptsTomorrowRes, couponsRes] =
      await Promise.all([
        ordersPromise,
        apptsTodayPromise,
        apptsTomorrowCountPromise,
        couponsPromise,
      ])

    // ── Build Orders section ───────────────────────────────────────────────────
    let ordersSection: DashboardSummary['orders'] = undefined
    if (modules.orders_enabled && ordersRes) {
      if (ordersRes.error) throw ordersRes.error
      const rows = ordersRes.data ?? []

      const readyRows   = rows.filter((r) => r.status === 'ready')
      const pendingRows = rows.filter((r) => r.status === 'pending')
      const uncollected = readyRows.filter((r) => r.reminders_count >= 3)
      const createdToday = rows.filter(
        (r) => r.created_at >= todayIso && r.created_at < tomorrowIso,
      )

      const clientName = (c: { first_name: string | null; last_name: string | null; phone_number: string } | null) =>
        c ? ([c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone_number) : '—'

      // Sort pending rows by created_at desc (most recent first)
      const pendingRowsSorted = [...pendingRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )

      // List: ready orders first (oldest = most urgent), then recent pending
      const listRows = [
        ...readyRows.slice(0, 5),
        ...pendingRowsSorted.slice(0, 5),
      ].slice(0, 10)

      const list: DashboardOrderItem[] = listRows.map((r) => ({
        id:              r.id,
        reference:       r.reference,
        client_name:     clientName(Array.isArray(r.client) ? r.client[0] : r.client),
        ready_at:        r.ready_at,
        reminders_count: r.reminders_count,
        status:          r.status as 'pending' | 'ready',
      }))

      ordersSection = {
        metrics: {
          ready_count:            readyRows.length,
          pending_count:          pendingRows.length,
          uncollected_3reminders: uncollected.length,
          created_today:          createdToday.length,
        },
        list,
      }
    }

    // ── Build Appointments section ─────────────────────────────────────────────
    let apptsSection: DashboardSummary['appointments'] = undefined
    if (modules.appointments_enabled && apptsTodayRes) {
      if (apptsTodayRes.error) throw apptsTodayRes.error

      const rows = apptsTodayRes.data ?? []
      const noShowToday  = rows.filter((r) => r.status === 'no_show').length
      const scheduledRows = rows.filter((r) => r.status === 'scheduled')
      const nextAt = scheduledRows[0]?.scheduled_at ?? null

      const tomorrowCount = apptsTomorrowRes
        ? ((apptsTomorrowRes as { count: number | null }).count ?? 0)
        : 0

      const clientName = (c: { first_name: string | null; last_name: string | null; phone_number: string } | null) =>
        c ? ([c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone_number) : '—'

      const list: DashboardApptItem[] = rows.map((r) => ({
        id:           r.id,
        scheduled_at: r.scheduled_at,
        client_name:  clientName(Array.isArray(r.client) ? r.client[0] : r.client),
        status:       r.status as DashboardApptItem['status'],
      }))

      apptsSection = {
        metrics: {
          today_count:    rows.length,
          next_at:        nextAt,
          no_show_today:  noShowToday,
          tomorrow_count: tomorrowCount,
        },
        list,
      }
    }

    // ── Build Loyalty section ─────────────────────────────────────────────────
    let loyaltySection: DashboardSummary['loyalty'] = undefined
    if (modules.loyalty_enabled && couponsRes) {
      if (couponsRes.error) throw couponsRes.error

      // Filter to only coupons belonging to this business (via tier.business_id)
      const rows = (couponsRes.data ?? []).filter((r) => {
        const tier = Array.isArray(r.tier) ? r.tier[0] : r.tier
        return tier?.business_id === DEFAULT_BUSINESS_ID
      })

      const sevenDaysFromNow = new Date(now)
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
      const sevenDaysIso = sevenDaysFromNow.toISOString()

      const expiringSoon    = rows.filter((r) => r.expires_at <= sevenDaysIso)
      const birthdayCoupons = rows.filter((r) => r.source === 'birthday')

      const clientName = (c: { first_name: string | null; last_name: string | null; phone_number: string } | null) =>
        c ? ([c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone_number) : '—'

      const list: DashboardLoyaltyItem[] = rows.slice(0, 8).map((r) => {
        const tier = Array.isArray(r.tier) ? r.tier[0] : r.tier
        return {
          id:           r.id,
          client_name:  clientName(Array.isArray(r.client) ? r.client[0] : r.client),
          reward_title: tier?.reward_title ?? null,
          expires_at:   r.expires_at,
        }
      })

      loyaltySection = {
        metrics: {
          active_coupons:   rows.length,
          birthday_coupons: birthdayCoupons.length,
          expiring_soon:    expiringSoon.length,
        },
        list,
      }
    }

    const summary: DashboardSummary = {
      business: { name: businessName, modules },
      orders:       ordersSection,
      appointments: apptsSection,
      loyalty:      loyaltySection,
    }

    return NextResponse.json({ data: summary }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
