import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/settings/profile
export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('business_profile')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    if (error) throw error

    // Return defaults if no row yet (before migration bootstrap runs)
    return NextResponse.json({
      data: data ?? {
        business_id:         DEFAULT_BUSINESS_ID,
        name:                '',
        logo_url:            null,
        phone:               null,
        email:               null,
        website:             null,
        currency:            'MAD',
        order_number_prefix: 'CMD',
        order_number_next:   1,
        address:             null,
        primary_color:       null,
        secondary_color:     null,
        default_phone_prefix: '+33',
        google_maps_url:     null,
        waze_url:            null,
        instagram_url:       null,
        tiktok_url:          null,
        facebook_url:        null,
        youtube_url:         null,
        timezone:            'Africa/Casablanca',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/settings/profile
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name, logo_url, phone, email, website, currency,
      order_number_prefix, order_number_next,
      address, primary_color, secondary_color, default_phone_prefix,
      google_maps_url, waze_url,
      instagram_url, tiktok_url, facebook_url, youtube_url,
      timezone, industry,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Le nom de l\'entreprise est requis' }, { status: 400 })
    }
    if (!currency?.trim()) {
      return NextResponse.json({ error: 'La devise est requise' }, { status: 400 })
    }

    // Validate timezone: must be a non-empty IANA identifier supported by Intl.
    const tz = (timezone ?? 'Africa/Casablanca').trim()
    if (!tz) {
      return NextResponse.json({ error: 'Le fuseau horaire est requis' }, { status: 400 })
    }
    try {
      Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    } catch {
      return NextResponse.json({ error: `Fuseau horaire invalide : ${tz}` }, { status: 400 })
    }

    const prefix = (order_number_prefix ?? '').trim().toUpperCase()

    const upsertData: Record<string, unknown> = {
      business_id:  DEFAULT_BUSINESS_ID,
      name:         name.trim(),
      logo_url:     logo_url?.trim()  || null,
      phone:        phone?.trim()     || null,
      email:        email?.trim()     || null,
      website:      website?.trim()   || null,
      currency:     currency.trim().toUpperCase(),
      order_number_prefix: prefix,
      address:        address?.trim()              || null,
      primary_color:  primary_color?.trim()        || null,
      secondary_color: secondary_color?.trim()     || null,
      default_phone_prefix: default_phone_prefix?.trim() || '+33',
      google_maps_url: google_maps_url?.trim()     || null,
      waze_url:        waze_url?.trim()            || null,
      instagram_url:   instagram_url?.trim()       || null,
      tiktok_url:      tiktok_url?.trim()          || null,
      facebook_url:    facebook_url?.trim()        || null,
      youtube_url:     youtube_url?.trim()         || null,
      timezone:        tz,
      industry:        industry?.trim() || null,
      updated_at:   new Date().toISOString(),
    }

    // Allow resetting the counter when the user explicitly sets a next number
    if (order_number_next !== undefined) {
      const n = parseInt(String(order_number_next), 10)
      if (!isNaN(n) && n >= 1) upsertData.order_number_next = n
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('business_profile')
      .upsert(upsertData)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
