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
    await jwtVerify(session, key, {
      algorithms: ['HS256'],
      issuer: 'amc-kanban',
      audience: 'amc-users',
    })
    return true
  } catch (e) {
    return false
  }
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ── Main app (immedi.ai) ──────────────────────────────────────────────────
  const isPublicPage = 
    pathname === '/tiktokWdXr977VBxysOGiXvrulDAH3ZeoG1iAD.txt' ||
    pathname === '/terms' ||
    pathname === '/privacy' ||
    pathname === '/game' || 
    pathname.startsWith('/game/') ||
    pathname.startsWith('/board/game/poster/') ||
    pathname.startsWith('/presentation/') ||
    pathname.startsWith('/reset-password/') || // token-based reset (no session needed)
    pathname.startsWith('/invite/') ||             // invitation acceptance
    // Static assets & PWA files (do not redirect to login page)
    pathname === '/manifest.json' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/favicon.ico' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/workbox-') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/logos/') ||
    pathname.startsWith('/uploads/') ||
    pathname.startsWith('/snapshots/')
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
