import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default function proxy(request: NextRequest) {
  const session = request.cookies.get('session')?.value
  
  const isAuthPage = request.nextUrl.pathname === '/'

  if (!session && !isAuthPage && !request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (session && isAuthPage) {
    return NextResponse.redirect(new URL('/board', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
