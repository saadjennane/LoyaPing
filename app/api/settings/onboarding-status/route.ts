import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

const VALID_STATUSES = ['not_started', 'in_progress', 'completed'] as const
type OnboardingStatus = typeof VALID_STATUSES[number]

export async function GET() {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('business_profile')
      .select('onboarding_status')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()
    if (error) throw error
    const status: OnboardingStatus = (data?.onboarding_status as OnboardingStatus) ?? 'not_started'
    return NextResponse.json({ data: { status } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { status } = await req.json()
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Use "not_started", "in_progress", or "completed".' },
        { status: 400 },
      )
    }
    const db = createServerClient()
    const { error } = await db
      .from('business_profile')
      .update({ onboarding_status: status })
      .eq('business_id', DEFAULT_BUSINESS_ID)
    if (error) throw error
    return NextResponse.json({ data: { status } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
