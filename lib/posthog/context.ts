import { createServerClient } from '@/lib/supabase/server'

export type AccountContext = {
  account_id:   string
  industry:     string | null
  loyalty_mode: string | null
  plan:         string | null
}

// In-memory singleton cache — reused across warm lambda invocations
let _cache: { ctx: AccountContext; expiry: number } | null = null
const TTL_MS = 5 * 60 * 1_000 // 5 minutes

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? 'unknown'

export async function getAccountContext(): Promise<AccountContext> {
  const now = Date.now()
  if (_cache && _cache.expiry > now) return _cache.ctx

  const db = createServerClient()

  const [profileRes, programRes] = await Promise.all([
    db
      .from('business_profile')
      .select('industry')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle(),
    db
      .from('loyalty_programs')
      .select('type')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  const ctx: AccountContext = {
    account_id:   DEFAULT_BUSINESS_ID,
    industry:     (profileRes.data as { industry?: string } | null)?.industry ?? null,
    loyalty_mode: (programRes.data as { type?: string } | null)?.type ?? null,
    plan:         null, // No subscription system yet
  }

  _cache = { ctx, expiry: now + TTL_MS }
  return ctx
}
