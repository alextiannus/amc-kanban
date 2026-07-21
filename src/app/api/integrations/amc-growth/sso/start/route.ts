import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth-v2'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['ADMIN', 'AMC_PRINCIPAL'])

export async function GET(request: Request) {
  const growthUrl = configuredGrowthUrl()
  const requestUrl = new URL(request.url)
  const returnTo = safeGrowthReturnTo(requestUrl.searchParams.get('returnTo'), growthUrl)
  const principal = await authenticateRequest(request)

  if (!principal) {
    const resumePath = `${requestUrl.pathname}?returnTo=${encodeURIComponent(returnTo)}`
    const loginUrl = new URL('/', requestUrl.origin)
    loginUrl.searchParams.set('returnTo', resumePath)
    return NextResponse.redirect(loginUrl)
  }

  if (principal.source !== 'session' || principal.actorType !== 'HUMAN') {
    return NextResponse.json({ error: 'growth_human_session_required' }, { status: 401 })
  }

  const roles = principal.globalRoles.filter((role) => ALLOWED_ROLES.has(role))
  if (roles.length === 0) {
    return NextResponse.redirect(new URL('/dashboard/access-denied?reason=role', growthUrl))
  }

  const secret = process.env.AMC_GROWTH_SSO_SECRET?.trim()
  if (!secret) {
    console.error('AMC_GROWTH_SSO_SECRET is not configured')
    return NextResponse.json({ error: 'growth_sso_not_configured' }, { status: 503 })
  }

  const ticket = await new SignJWT({
    email: principal.email,
    roles,
    authVersion: principal.authVersion,
    actorType: principal.actorType,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(principal.userId)
    .setAudience('amc-growth')
    .setIssuer('amc-kanban')
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(new TextEncoder().encode(secret))

  const callback = new URL('/v1/auth/sso/callback', growthUrl)
  callback.searchParams.set('ticket', ticket)
  callback.searchParams.set('returnTo', returnTo)
  return NextResponse.redirect(callback)
}

function configuredGrowthUrl() {
  const raw = process.env.AMC_GROWTH_URL?.trim() || 'https://amc-growth.immedi.ai'
  const url = new URL(raw)
  return `${url.protocol}//${url.host}`
}

function safeGrowthReturnTo(raw: string | null, growthUrl: string) {
  try {
    const url = new URL(raw || '/dashboard', growthUrl)
    if (url.origin !== growthUrl || !url.pathname.startsWith('/dashboard')) return '/dashboard'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/dashboard'
  }
}
