import { NextRequest, NextResponse } from 'next/server'
import { getPortalGlobalData } from '@/lib/services/clients'

// GET /api/client/global?token=...
// Returns all portal data for a client (multi-business)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

  const data = await getPortalGlobalData(token)
  if (!data) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  return NextResponse.json({ data })
}
