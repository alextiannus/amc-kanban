import type { Prisma } from '@prisma/client'
import { queueGoogleBrandImport } from '@/lib/googleBrandImport'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchGoogleLocations } from '@/lib/integrations/google'
import { getSession } from '@/lib/auth'
import { canWriteBrandProject } from '@/lib/brandAccess'
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

function resolveGoogleRedirectUriFromBrand(request: Request, brandRedirectUri?: string | null) {
  const configured = brandRedirectUri?.trim()
  if (configured && !(process.env.NODE_ENV === 'production' && isLocalUrl(configured))) {
    return configured
  }
  return resolveGoogleRedirectUri(request)
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

  // 2. Retrieve and verify state from cookie (CSRF protection)
  const cookieStore = await cookies()
  const stateCookieVal = cookieStore.get('google_oauth_state')?.value
  if (!stateCookieVal) {
    return NextResponse.json({ error: 'Missing OAuth session state cookie' }, { status: 400 })
  }

  let oauthSession: { state: string; brandId: string }
  try {
    oauthSession = JSON.parse(stateCookieVal)
  } catch {
    return NextResponse.json({ error: 'Invalid OAuth session state cookie' }, { status: 400 })
  }

  if (oauthSession.state !== stateParam) {
    return NextResponse.json({ error: 'CSRF validation failed: state mismatch' }, { status: 403 })
  }

  const brandId = oauthSession.brandId

  // 3. Clear the cookie immediately to prevent replay
  cookieStore.delete('google_oauth_state')

  // 4. Verify user has write access to this brand
  if (!(await canWriteBrandProject(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Verify brand exists
    const brand = await prisma.brand.findUnique({ where: { id: brandId } })
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Real OAuth Flow (brand-level OAuth credentials)
    const clientId = brand.googleClientId?.trim()
    const clientSecret = brand.googleClientSecret?.trim()
    const redirectUri = resolveGoogleRedirectUriFromBrand(request, brand.googleRedirectUri)

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Brand OAuth parameters are not configured.' }, { status: 400 })
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
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
      return NextResponse.json({ error: `Google Token exchange failed: ${tokenRes.status}` }, { status: 502 })
    }

    const tokenData = await tokenRes.json() as { access_token: string; refresh_token?: string | null }
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token // Note: Google only sends this on the first consent

    if (!refreshToken) {
      console.warn('Warning: Google did not return a refresh token. Make sure prompt=consent is active.')
    }

    // Preserve an exact existing binding. Never select the first of several locations.
    const locations = await fetchGoogleLocations(accessToken)
    const previous = locations.find(l => l.id === brand.googleLocationId && l.accountId === brand.googleAccountId?.replace(/^accounts\//, ''))
    const selected = previous || (locations.length === 1 ? locations[0] : null)
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.brand.update({ where: { id: brandId }, data: {
        ...(refreshToken && { googleRefreshToken: refreshToken }),
        googleAccountId: selected?.accountId || null,
        googleLocationId: selected?.id || null,
        googleLocationName: selected?.name || null,
      } })
      await queueGoogleBrandImport(brandId, true, tx)
    })

    const redirectUrl = new URL('/board', url.origin)
    redirectUrl.searchParams.set('google_success', 'true')
    return NextResponse.redirect(redirectUrl)
  } catch (e: unknown) {
    const message = 'Google authorization could not be completed. Please reconnect.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
