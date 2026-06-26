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
  const pathname = request.nextUrl.pathname
  const sessionExists = await hasValidSession(request)

  const isPublicPage = pathname === '/game' || pathname.startsWith('/game/')
  const isApiRoute = pathname.startsWith('/api')

  // Proxy/Rewrite API and public game routes to the main application
  if (isApiRoute || isPublicPage) {
    const mainAppUrl = process.env.APP_BASE_URL || 'http://localhost:3000'
    const targetUrl = new URL(pathname + request.nextUrl.search, mainAppUrl)
    return NextResponse.rewrite(targetUrl)
  }

  // Root path (Login page): redirect to dashboard if logged in
  if (pathname === '/') {
    if (sessionExists) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  // Protected dashboard paths: redirect to login if not logged in
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    if (!sessionExists) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // Fallback redirect to login
  if (!sessionExists) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
