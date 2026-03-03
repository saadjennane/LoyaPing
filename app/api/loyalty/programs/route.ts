import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}

export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('loyalty_programs')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: extractMessage(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      type,
      currency,
      conversion_rate,
      conversion_amount_per_point,
      points_per_visit,
      notify_on_tier,
      birthday_reward_enabled,
      birthday_reward_title,
      birthday_message_enabled,
      birthday_message_template,
      birthday_send_hour,
    } = body

    if (!type || !['passage', 'montant'].includes(type)) {
      return NextResponse.json({ error: 'type must be "passage" or "montant"' }, { status: 400 })
    }

    const db = createServerClient()

    const { data, error } = await db
      .from('loyalty_programs')
      .upsert({
        business_id: DEFAULT_BUSINESS_ID,
        type,
        currency: currency ?? null,
        conversion_rate: conversion_rate ?? null,
        conversion_amount_per_point: conversion_amount_per_point ?? null,
        points_per_visit: points_per_visit ?? 1,
        notify_on_tier: notify_on_tier ?? true,
        birthday_reward_enabled:  Boolean(birthday_reward_enabled),
        birthday_reward_title:    birthday_reward_title    ?? null,
        birthday_message_enabled: Boolean(birthday_message_enabled),
        birthday_message_template: birthday_message_template ?? null,
        birthday_send_hour: Math.min(23, Math.max(0, parseInt(String(birthday_send_hour ?? 9), 10) || 9)),
        is_active: true,
      }, { onConflict: 'business_id' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: extractMessage(err) }, { status: 500 })
  }
}
