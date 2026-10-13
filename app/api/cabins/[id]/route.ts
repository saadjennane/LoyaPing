import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/cabins/:id  { name?, sort_order? }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await req.json()
    const updates: Record<string, string | number> = { updated_at: new Date().toISOString() }

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 })
      updates.name = name
    }
    if ('sort_order' in body) updates.sort_order = Number(body.sort_order) || 0

    const db = createServerClient()
    const { data, error } = await db
      .from('cabins')
      .update(updates)
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .is('deleted_at', null)
      .select('id, business_id, name, sort_order, created_at')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Cabine introuvable' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/cabins/:id — soft delete, refused while services are attached
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const db = createServerClient()

    const { count } = await db
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('cabin_id', id)
      .is('deleted_at', null)
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Cette cabine contient encore des soins. Supprimez-les ou déplacez-les d\'abord.' },
        { status: 409 },
      )
    }

    const { error } = await db
      .from('cabins')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', DEFAULT_BUSINESS_ID)
    if (error) throw error
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
