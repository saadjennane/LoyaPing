import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('loyalty_tiers')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .order('tier_order', { ascending: true })

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      tier_order, required_points, reward_title,
      reward_description, validity_days,
      notification_message_template, is_enabled,
    } = body

    if (!tier_order || !required_points || !reward_description) {
      return NextResponse.json({ error: 'tier_order, required_points, reward_description are required' }, { status: 400 })
    }
    if (tier_order < 1 || tier_order > 5) {
      return NextResponse.json({ error: 'tier_order must be between 1 and 5' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('loyalty_tiers')
      .upsert({
        business_id: DEFAULT_BUSINESS_ID,
        tier_order,
        required_points,
        reward_title: reward_title ?? null,
        reward_description: reward_description ?? '',
        validity_days: validity_days ?? null,
        notification_message_template: notification_message_template ?? '',
        is_enabled: is_enabled ?? true,
      }, { onConflict: 'business_id,tier_order' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PUT /api/loyalty/tiers — bulk replace all tiers (used by settings page)
export async function PUT(req: NextRequest) {
  try {
    const { tiers } = await req.json() as {
      tiers: Array<{
        tier_order: number
        required_points: number
        reward_title: string | null
        reward_description: string
        validity_days: number | null
        notification_message_template: string
        is_enabled: boolean
      }>
    }

    if (!Array.isArray(tiers) || tiers.length > 5) {
      return NextResponse.json({ error: 'tiers must be an array of max 5 items' }, { status: 400 })
    }

    const db = createServerClient()
    await db.from('loyalty_tiers').delete().eq('business_id', DEFAULT_BUSINESS_ID)

    if (tiers.length > 0) {
      const rows = tiers.map((t) => ({
        business_id: DEFAULT_BUSINESS_ID,
        tier_order: t.tier_order,
        required_points: t.required_points,
        reward_title: t.reward_title ?? null,
        reward_description: t.reward_description ?? '',
        validity_days: t.validity_days ?? null,
        notification_message_template: t.notification_message_template ?? '',
        is_enabled: t.is_enabled ?? true,
      }))
      const { error } = await db.from('loyalty_tiers').insert(rows)
      if (error) throw error
    }

    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const tierId = searchParams.get('id')
    if (!tierId) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const db = createServerClient()
    const { error } = await db.from('loyalty_tiers').delete().eq('id', tierId).eq('business_id', DEFAULT_BUSINESS_ID)
    if (error) throw error
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
