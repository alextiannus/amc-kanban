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

export default async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const pathname = request.nextUrl.pathname
  const isBrandOwnerDomain = hostname === 'amc-mm.immedi.ai' || hostname.startsWith('amc-mm.')
  const sessionExists = await hasValidSession(request)

  const isPublicPage = pathname === '/game' || pathname.startsWith('/game/')
  const isApiRoute = pathname.startsWith('/api')

  // Let API routes and public pages bypass domain-based page routing constraints.
  // (Both domains share the same backend APIs like /api/auth/login and /api/brands)
  if (isApiRoute || isPublicPage) {
    return NextResponse.next()
  }

  const protocol = request.nextUrl.protocol || 'http:'

  if (isBrandOwnerDomain) {
    // -------------------------------------------------------------
    // BRAND OWNER PORTAL ROUTING (amc-mm.immedi.ai)
    // -------------------------------------------------------------
    
    // Root path: redirect based on session
    if (pathname === '/') {
      if (sessionExists) {
        return NextResponse.redirect(new URL('/dashboard/brand-owner', request.url))
      } else {
        return NextResponse.redirect(new URL('/dashboard/brand-owner/login', request.url))
      }
    }

    // Login page: redirect to dashboard if already logged in
    if (pathname === '/dashboard/brand-owner/login') {
      if (sessionExists) {
        return NextResponse.redirect(new URL('/dashboard/brand-owner', request.url))
      }
      return NextResponse.next()
    }

    // Dashboard or its sub-paths: redirect to login if not logged in
    if (pathname === '/dashboard/brand-owner' || pathname.startsWith('/dashboard/brand-owner/')) {
      if (!sessionExists) {
        return NextResponse.redirect(new URL('/dashboard/brand-owner/login', request.url))
      }
      return NextResponse.next()
    }

    // Any other paths (e.g. /board, /connect, /learn, etc.) are operator-only.
    // Block or redirect them on the brand owner portal.
    if (sessionExists) {
      return NextResponse.redirect(new URL('/dashboard/brand-owner', request.url))
    } else {
      return NextResponse.redirect(new URL('/dashboard/brand-owner/login', request.url))
    }

  } else {
    // -------------------------------------------------------------
    // OPERATOR KANBAN BOARD ROUTING (amc-kanban.immedi.ai)
    // -------------------------------------------------------------

    // Redirect brand owner paths to the dedicated Brand Owner domain
    if (pathname.startsWith('/dashboard/brand-owner')) {
      const brandOwnerHost = hostname.includes('localhost')
        ? `amc-mm.localhost:${hostname.split(':')[1] || '3000'}`
        : hostname.includes('lvh.me')
        ? `amc-mm.lvh.me:${hostname.split(':')[1] || '3000'}`
        : 'amc-mm.immedi.ai'
      
      const targetUrl = `${protocol}//${brandOwnerHost}${pathname}${request.nextUrl.search}`
      return NextResponse.redirect(new URL(targetUrl))
    }

    // Root path: redirect to /board if logged in, otherwise stay on / (operator login)
    if (pathname === '/') {
      if (sessionExists) {
        return NextResponse.redirect(new URL('/board', request.url))
      }
      return NextResponse.next()
    }

    // Other paths: redirect to / (login) if not logged in
    if (!sessionExists) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    return NextResponse.next()
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
