import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { listCabins } from '@/lib/services/catalog'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/cabins — active cabins (seeds defaults on first call)
export async function GET() {
  try {
    const data = await listCabins(DEFAULT_BUSINESS_ID)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/cabins  { name }
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json()
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 })

    const db = createServerClient()
    const { count } = await db
      .from('cabins')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .is('deleted_at', null)

    const { data, error } = await db
      .from('cabins')
      .insert({ business_id: DEFAULT_BUSINESS_ID, name: trimmed, sort_order: count ?? 0 })
      .select('id, business_id, name, sort_order, created_at')
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
