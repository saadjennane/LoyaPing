import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_CLIENT_FIELD_CONFIG } from '@/lib/context/client-field-config'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('client_field_config')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({
      data: data ?? { business_id: DEFAULT_BUSINESS_ID, ...DEFAULT_CLIENT_FIELD_CONFIG },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      detail_email, detail_birthday, detail_notes, detail_last_activity,
      list_email, list_birthday, list_last_activity,
    } = body

    const db = createServerClient()
    const { data, error } = await db
      .from('client_field_config')
      .upsert({
        business_id:          DEFAULT_BUSINESS_ID,
        detail_email:         Boolean(detail_email),
        detail_birthday:      Boolean(detail_birthday),
        detail_notes:         Boolean(detail_notes),
        detail_last_activity: Boolean(detail_last_activity),
        list_email:           Boolean(list_email),
        list_birthday:        Boolean(list_birthday),
        list_last_activity:   Boolean(list_last_activity),
        updated_at:           new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
