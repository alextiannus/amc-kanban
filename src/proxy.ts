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
  const sessionExists = await hasValidSession(request)

  // For brand-owner subdomain: intercept /api/auth/logout here so we can
  // clear the cookie AND redirect back to the brand-owner login page,
  // instead of letting the main app's logout handler redirect to immedi.ai.
  if (isBrandOwnerDomain && pathname === '/api/auth/logout') {
    const brandOwnerOrigin = `${request.nextUrl.protocol}//${hostname}`
    const loginUrl = new URL('/login', brandOwnerOrigin)
    const response = NextResponse.redirect(loginUrl)
    // Clear the session cookie across all relevant domain variants
    const cookieOpts = 'Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax'
    response.headers.append('Set-Cookie', `session=; ${cookieOpts}`)
    response.headers.append('Set-Cookie', `session=; ${cookieOpts}; Secure`)
    response.headers.append('Set-Cookie', `session=; ${cookieOpts}; Domain=${hostname}`)
    response.headers.append('Set-Cookie', `session=; ${cookieOpts}; Domain=.immedi.ai`)
    response.headers.append('Set-Cookie', `session=; ${cookieOpts}; Secure; Domain=.immedi.ai`)
    return response
  }

  // Bypass API and public routes
  if (isApiRoute || isPublicPage) {
    return NextResponse.next()
  }


  // Route brand owner subdomain requests to the brand-owner sub-app
  if (isBrandOwnerDomain) {
    const brandOwnerUrl = process.env.BRAND_OWNER_URL || 'http://localhost:3001'
    const targetUrl = new URL(pathname + request.nextUrl.search, brandOwnerUrl)
    const requestHeaders = new Headers(request.headers)
    return NextResponse.rewrite(targetUrl, {
      request: {
        headers: requestHeaders,
      }
    })
  }

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
