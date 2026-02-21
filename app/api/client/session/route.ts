import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

// GET /api/client/session?token=...
// Validates magic_token and returns phone_number (masked)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

  const db = createServerClient()
  const { data: client } = await db
    .from('clients')
    .select('id, phone_number')
    .eq('magic_token', token)
    .maybeSingle()

  if (!client) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  // Mask phone: keep last 4 digits
  const masked = client.phone_number.replace(/.(?=.{4})/g, '*')

  return NextResponse.json({ data: { phone_masked: masked } })
}
