import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'
import { cookies } from 'next/headers'
import crypto from 'crypto'

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
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.type === 'AI_AGENT') {
    return NextResponse.json({ error: 'AI Agent not permitted' }, { status: 403 })
  }

  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  }

  // Verify brand exists
  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  // Verify user has access to this brand
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Generate a cryptographically secure state nonce for CSRF prevention
  const stateNonce = crypto.randomUUID()

  // Save the state nonce and brandId in a secure cookie
  const cookieStore = await cookies()
  cookieStore.set('google_oauth_state', JSON.stringify({ state: stateNonce, brandId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5 minutes
  })

  const clientId = brand.googleClientId?.trim()
  const clientSecret = brand.googleClientSecret?.trim()
  const redirectUri = resolveGoogleRedirectUriFromBrand(request, brand.googleRedirectUri)

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured for this brand: googleClientId / googleClientSecret are required in brand settings.' },
      { status: 400 }
    )
  }

  // Construct real Google OAuth 2.0 URL
  const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  oauthUrl.searchParams.set('client_id', clientId)
  oauthUrl.searchParams.set('redirect_uri', redirectUri)
  oauthUrl.searchParams.set('response_type', 'code')
  oauthUrl.searchParams.set('access_type', 'offline')
  oauthUrl.searchParams.set('prompt', 'consent')
  oauthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/business.manage')
  oauthUrl.searchParams.set('state', stateNonce)

  return NextResponse.redirect(oauthUrl)
}
