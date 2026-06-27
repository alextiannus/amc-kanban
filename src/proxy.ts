import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const session = request.cookies.get('session')?.value
  if (!session) return false
  try {
    const secretKey = process.env.JWT_SECRET
    if (!secretKey) {
      console.error('JWT_SECRET environment variable is missing')
      return false
    }
    const key = new TextEncoder().encode(secretKey)
    await jwtVerify(session, key, { algorithms: ['HS256'] })
    return true
  } catch (e) {
    return false
  }
}

export default async function proxy(request: NextRequest) {
  const hostname = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const isBrandOwnerDomain = hostname === 'amc-mm.immedi.ai' || hostname.startsWith('amc-mm.')
  const pathname = request.nextUrl.pathname

  // ── Brand-owner subdomain ─────────────────────────────────────────────────
  if (isBrandOwnerDomain) {
    const isPublic =
      pathname === '/login' ||
      pathname === '/register' ||
      pathname.startsWith('/api/') ||        // all API routes (incl. /api/logout)
      pathname.startsWith('/_next/') ||
      pathname === '/favicon.ico'

    // Auth guard: redirect unauthenticated users to /login on this domain
    if (!isPublic) {
      const sessionExists = await hasValidSession(request)
      if (!sessionExists) {
        const loginUrl = new URL('/login', request.url)
        return NextResponse.redirect(loginUrl)
      }
    }

    // Rewrite all other requests to the brand-owner Next.js app
    const brandOwnerUrl = process.env.BRAND_OWNER_URL || 'http://localhost:3001'
    const targetUrl = new URL(pathname + request.nextUrl.search, brandOwnerUrl)
    return NextResponse.rewrite(targetUrl, {
      request: { headers: new Headers(request.headers) },
    })
  }

  // ── Main app (immedi.ai) ──────────────────────────────────────────────────
  const isPublicPage = pathname === '/game' || pathname.startsWith('/game/')
  const isApiRoute = pathname.startsWith('/api')

  // Bypass API and public routes
  if (isApiRoute || isPublicPage) {
    return NextResponse.next()
  }

  const sessionExists = await hasValidSession(request)

  // Root path: redirect to /board if already logged in
  if (pathname === '/') {
    if (sessionExists) {
      return NextResponse.redirect(new URL('/board', request.url))
    }
    return NextResponse.next()
  }

  // Other paths: redirect to / if not logged in
  if (!sessionExists) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
