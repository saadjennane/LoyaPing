import { createClient } from '@supabase/supabase-js'

// Browser-side client using anon key (read-only public data)
let _client: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  _client = createClient(url, key)
  return _client
}
