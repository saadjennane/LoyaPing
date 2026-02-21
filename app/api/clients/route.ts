import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('v_clients')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone_number, civility, first_name, last_name, email, birthday, notes } = body

    if (!phone_number) {
      return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('clients')
      .insert({
        business_id: DEFAULT_BUSINESS_ID,
        phone_number,
        civility:   civility   || null,
        first_name: first_name || null,
        last_name:  last_name  || null,
        email:      email      || null,
        birthday:   birthday   || null,
        notes:      notes      || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ce numéro est déjà enregistré' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
