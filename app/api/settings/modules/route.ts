import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { Analytics, type ModuleName } from '@/lib/posthog/analytics'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/settings/modules
export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('business_modules')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({
      data: data ?? {
        business_id:          DEFAULT_BUSINESS_ID,
        orders_enabled:       true,
        appointments_enabled: true,
        loyalty_enabled:      true,
        reviews_enabled:      false,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/settings/modules
export async function PATCH(req: NextRequest) {
  try {
    const { orders_enabled, appointments_enabled, loyalty_enabled, reviews_enabled } = await req.json()

    if (!orders_enabled && !appointments_enabled && !loyalty_enabled) {
      return NextResponse.json(
        { error: 'Au moins un module doit rester actif' },
        { status: 400 }
      )
    }

    const db = createServerClient()

    // Fetch current state to detect newly enabled modules
    const { data: current } = await db
      .from('business_modules')
      .select('orders_enabled, appointments_enabled, loyalty_enabled, reviews_enabled')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    const { data, error } = await db
      .from('business_modules')
      .upsert({
        business_id:          DEFAULT_BUSINESS_ID,
        orders_enabled:       Boolean(orders_enabled),
        appointments_enabled: Boolean(appointments_enabled),
        loyalty_enabled:      Boolean(loyalty_enabled),
        reviews_enabled:      Boolean(reviews_enabled ?? false),
        updated_at:           new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Fire module_enabled for each module that was just switched on
    type ModuleKey = 'orders_enabled' | 'appointments_enabled' | 'loyalty_enabled' | 'reviews_enabled'
    const checks: Array<{ key: ModuleKey; name: ModuleName; next: unknown }> = [
      { key: 'orders_enabled',       name: 'orders',       next: orders_enabled },
      { key: 'appointments_enabled', name: 'appointments', next: appointments_enabled },
      { key: 'loyalty_enabled',      name: 'loyalty',      next: loyalty_enabled },
      { key: 'reviews_enabled',      name: 'reviews',      next: reviews_enabled },
    ]
    for (const { key, name, next } of checks) {
      if (next && !current?.[key]) Analytics.moduleEnabled(name)
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
