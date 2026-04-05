import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PATHS = [
  '/',
  '/dashboard',
  '/data',
  '/review',
  '/examples',
  '/medical-examples',
  '/agent',
  '/diagram',
  '/faq',
  '/lightrag',
  '/obsidian-graph',
]

const PUBLIC_PATHS = [
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
]

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
}

function sanitizeNext(next: string | null): string {
  if (!next) return '/'
  // Must start with '/', must not contain '://', must not start with '//'
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('://')) {
    return '/'
  }
  return next
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always pass through: auth routes, Next internals, static assets, API docs, favicon
  if (
    isPublicPath(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/docs') ||
    pathname.startsWith('/api/openapi') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next({ request })
  }

  // If Supabase env vars are not configured, skip auth entirely (local dev without Supabase)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request })
  }

  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Use getUser() (not getSession()) — verifies token and refreshes cookie
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user === null && isProtectedPath(pathname)) {
    const next = sanitizeNext(pathname)
    const signInUrl = request.nextUrl.clone()
    signInUrl.pathname = '/sign-in'
    signInUrl.search = `?next=${encodeURIComponent(next)}`
    return NextResponse.redirect(signInUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|api/docs|api/openapi).*)'],
}
