import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import type { CustomerIndexItem } from '@/lib/types'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// GET /api/customers/index
// Returns a lightweight array of CustomerIndexItem for instant client-side search.
// Supports ETag to avoid re-downloading unchanged data.
export async function GET(req: NextRequest) {
  try {
    const db = createServerClient()
    const { data, error } = await db
      .from('clients')
      .select('id, first_name, last_name, phone_number, created_at')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = data ?? []

    // Simple ETag: count + newest created_at
    const etag = `"${rows.length}-${rows[0]?.created_at ?? 'empty'}"`
    const ifNoneMatch = req.headers.get('If-None-Match')
    if (ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 })
    }

    const items: CustomerIndexItem[] = rows.map((row) => {
      const display_name =
        [row.first_name, row.last_name].filter(Boolean).join(' ') || row.phone_number
      const phone_digits = row.phone_number.replace(/\D/g, '')
      return {
        id:               row.id,
        display_name,
        phone:            row.phone_number,
        phone_digits,
        phone_last4:      phone_digits.slice(-4),
        last_activity_at: row.created_at,
      }
    })

    return NextResponse.json({ data: items }, {
      headers: {
        ETag:            etag,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
