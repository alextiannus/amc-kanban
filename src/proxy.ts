import { currentBinding, signBinding } from './lib/global-text/policy'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { authenticateRequest } from './lib/auth-v2/authenticate'
import { allows } from './lib/role-permissions/store'
import { kanbanRoutePermission } from './lib/role-permissions/routes'

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
  const publicGameConfig = pathname === '/api/game/config' && request.method === 'GET' && request.nextUrl.searchParams.get('public') === 'true'
  // The identity handler authenticates the current session (not API keys), checks
  // brand scope and live video grants, and returns no-store structured errors.
  const contentIdentity = pathname === '/api/content/access-identity'
  // Subscription operations do not execute AI and must survive text-policy outages.
  const brandOperations = pathname === '/api/brand-operations' || /^\/api\/brand-operations\/[^/]+\/principal$/.test(pathname)
  const permission = publicGameConfig || contentIdentity ? null : kanbanRoutePermission(pathname, request.method)
  if (permission) {
    try {
      const principal = await authenticateRequest(request)
      if (!principal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (!await allows(principal, permission)) return NextResponse.json({ error: '当前角色未获授权', permission }, { status: 403 })
    } catch { return NextResponse.json({ error: '权限服务暂不可用' }, { status: 503 }) }
  }
  const requestHeaders = new Headers(request.headers)
  const requestId = requestHeaders.get('x-amc-request-id') || crypto.randomUUID()
  requestHeaders.set('x-amc-request-id', requestId)

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

  // Bind API work once; gateway/admin endpoints manage their own signed snapshots.
  if (isApiRoute && !contentIdentity && !brandOperations && !pathname.startsWith('/api/internal/access/') && !pathname.startsWith('/api/internal/global-text') && !pathname.startsWith('/api/internal/model-') && pathname !== '/api/internal/content-brand-voices' && !pathname.startsWith('/api/admin/')) {
    try {
      requestHeaders.set('x-amc-text-binding', signBinding(await currentBinding(request.headers.get('x-client-type') === 'mm' ? 'mm' : 'kanban')))
    } catch { return NextResponse.json({ error: 'Text policy unavailable' }, { status: 503 }) }
  }

  // Bypass API and public routes
  if (isApiRoute || isPublicPage) {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set('x-amc-request-id', requestId)
    return response
  }

  const sessionExists = await hasValidSession(request)

  // Root path: redirect to /board if already logged in
  if (pathname === '/') {
    if (sessionExists) {
      return NextResponse.redirect(new URL('/board', request.url))
    }
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set('x-amc-request-id', requestId)
    return response
  }

  // Other paths: redirect to / if not logged in
  if (!sessionExists) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('x-amc-request-id', requestId)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
