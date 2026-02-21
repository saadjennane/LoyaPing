import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('reminder_configs')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .order('reminder_order', { ascending: true })

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { reminder_order, offset_minutes, message } = body

    if (!reminder_order || offset_minutes == null || !message) {
      return NextResponse.json({ error: 'reminder_order, offset_minutes, message are required' }, { status: 400 })
    }

    if (reminder_order < 1 || reminder_order > 3) {
      return NextResponse.json({ error: 'reminder_order must be between 1 and 3' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('reminder_configs')
      .upsert({
        business_id: DEFAULT_BUSINESS_ID,
        reminder_order,
        offset_minutes,
        message,
        is_active: true,
      }, { onConflict: 'business_id,reminder_order' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
