import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

// API routes reachable without a merchant session. Each one authenticates
// its caller another way:
//   - jobs/*              → CRON_SECRET (Vercel cron)
//   - whatsapp/webhook    → Meta verify token
//   - calendar/*/webhook  → Google / Microsoft push notifications
//   - client/*            → client magic_token (public portal)
//   - coupons/generate-code → called from the public portal with a coupon UUID
// Every other /api route requires an authenticated Supabase user.
const PUBLIC_API_PREFIXES = [
  '/api/jobs/',
  '/api/whatsapp/webhook',
  '/api/calendar/google/webhook',
  '/api/calendar/microsoft/webhook',
  '/api/client/',
  '/api/loyalty/coupons/generate-code',
]

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith('/api/')

  if (isApi && isPublicApi(pathname)) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser() validates the session server-side — never trust getSession() alone.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!login|auth|u/|c/|_next/static|_next/image|favicon\\.ico).*)',
  ],
}
