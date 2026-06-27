import { NextResponse } from 'next/server'

const MAIN_APP_URL = process.env.MAIN_APP_URL || 'http://localhost:3000'

/**
 * Local logout handler for the brand-owner app.
 *
 * Next.js route files take precedence over rewrites(), so this runs on
 * amc-mm.immedi.ai instead of being forwarded to the main app.
 *
 * Steps:
 *   1. Call the main app's logout API server-side to get the Set-Cookie
 *      headers that clear the session cookie.
 *   2. Forward those clearing headers back to the browser.
 *   3. Redirect the browser to /login (brand-owner login page).
 */
async function handleLogout(request: Request) {
  const clearHeaders = new Headers()

  try {
    // Forward the session cookie (if any) so the main app knows which domain
    // to target when building the clearing headers.
    const cookieHeader = request.headers.get('cookie') || ''

    const res = await fetch(`${MAIN_APP_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        host: new URL(request.url).host,
      },
    })

    // Copy every Set-Cookie header from the main app's response so the
    // browser actually clears the session cookie.
    res.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        clearHeaders.append('set-cookie', value)
      }
    })
  } catch (err) {
    console.error('[brand-owner /api/logout] Failed to call main app logout:', err)
  }

  // Always redirect to the brand-owner login page regardless of errors above.
  clearHeaders.set('location', '/login')
  return new NextResponse(null, { status: 302, headers: clearHeaders })
}

export const GET = handleLogout
export const POST = handleLogout
