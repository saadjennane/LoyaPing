import { NextRequest, NextResponse } from 'next/server'
import { getPortalBusinessData } from '@/lib/services/clients'

// GET /api/client/business?token=...&business_id=...
// Returns detailed data for a single business in the portal
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const token      = searchParams.get('token')
  const businessId = searchParams.get('business_id')

  if (!token || !businessId) {
    return NextResponse.json({ error: 'token and business_id are required' }, { status: 400 })
  }

  const result = await getPortalBusinessData(token, businessId)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data: result.data })
}
