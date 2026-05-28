import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchGoogleLocations } from '@/lib/integrations/google'
import { getSession } from '@/lib/auth'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'
import { cookies } from 'next/headers'

function isLocalUrl(url: string) {
  return /localhost|127\.0\.0\.1/i.test(url)
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '')
}

function resolvePublicBaseUrl(request: Request) {
  const requestUrl = new URL(request.url)
  const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`
  const configuredHost = process.env.NEXT_PUBLIC_KANBAN_HOST?.trim()

  if (!configuredHost) return requestOrigin
  if (process.env.NODE_ENV === 'production' && isLocalUrl(configuredHost)) return requestOrigin
  return normalizeBaseUrl(configuredHost)
}

function resolveGoogleRedirectUri(request: Request) {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim()
  if (configured && !(process.env.NODE_ENV === 'production' && isLocalUrl(configured))) {
    return configured
  }
  return `${resolvePublicBaseUrl(request)}/api/integrations/google/oauth/callback`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')

  if (!code || !stateParam) {
    return NextResponse.json({ error: 'code and state parameters required' }, { status: 400 })
  }

  // 1. Authenticate user session
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.type === 'AI_AGENT') {
    return NextResponse.json({ error: 'AI Agent not permitted' }, { status: 403 })
  }

  // 2. Retrieve and verify state from cookie (CSRF protection)
  const cookieStore = await cookies()
  const stateCookieVal = cookieStore.get('google_oauth_state')?.value
  if (!stateCookieVal) {
    return NextResponse.json({ error: 'Missing OAuth session state cookie' }, { status: 400 })
  }

  let oauthSession: { state: string; brandId: string }
  try {
    oauthSession = JSON.parse(stateCookieVal)
  } catch (e) {
    return NextResponse.json({ error: 'Invalid OAuth session state cookie' }, { status: 400 })
  }

  if (oauthSession.state !== stateParam) {
    return NextResponse.json({ error: 'CSRF validation failed: state mismatch' }, { status: 403 })
  }

  const brandId = oauthSession.brandId

  // 3. Clear the cookie immediately to prevent replay
  cookieStore.delete('google_oauth_state')

  // 4. Verify user has write access to this brand
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Verify brand exists
    const brand = await prisma.brand.findUnique({ where: { id: brandId } })
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Real OAuth Flow
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = resolveGoogleRedirectUri(request)

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'System OAuth environment parameters are not configured.' }, { status: 500 })
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      return NextResponse.json({ error: `Google Token exchange failed: ${tokenRes.status} - ${errText}` }, { status: 502 })
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token // Note: Google only sends this on the first consent

    if (!refreshToken) {
      console.warn('Warning: Google did not return a refresh token. Make sure prompt=consent is active.')
    }

    // Fetch GBP locations available
    const locations = await fetchGoogleLocations(accessToken)
    if (locations.length === 0) {
      return NextResponse.json({ error: 'No Google Business locations found under this account.' }, { status: 422 })
    }

    // Sync the first location automatically
    const firstLocation = locations[0]

    await prisma.brand.update({
      where: { id: brandId },
      data: {
        ...(refreshToken && { googleRefreshToken: refreshToken }),
        googleAccountId: firstLocation.accountId, // Persist the actual Google account ID discoverable by locations API
        googleLocationId: firstLocation.id,
        googleLocationName: firstLocation.name,
      },
    })

    const redirectUrl = new URL('/board', url.origin)
    redirectUrl.searchParams.set('google_success', 'true')
    return NextResponse.redirect(redirectUrl)
  } catch (e: any) {
    console.error('[Google OAuth Callback Error]', e)
    return NextResponse.json({ error: e.message || 'OAuth callback failed' }, { status: 500 })
  }
}
