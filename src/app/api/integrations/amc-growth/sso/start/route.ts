import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth-v2'
import { ensureGrowthMerchantByBrandId } from '@/lib/growthDataCenter'
import { prisma } from '@/lib/prisma'
import { publicKanbanOrigin } from '@/lib/publicKanbanOrigin'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['ADMIN', 'AMC_PRINCIPAL'])

export async function GET(request: Request) {
  const growthUrl = configuredGrowthUrl()
  const requestUrl = new URL(request.url)
  const principal = await authenticateRequest(request)

  if (!principal) {
    const resumePath = `${requestUrl.pathname}${requestUrl.search}`
    const loginUrl = new URL('/', publicKanbanOrigin(request))
    loginUrl.searchParams.set('returnTo', resumePath)
    return NextResponse.redirect(loginUrl)
  }

  if (principal.source !== 'session' || principal.actorType !== 'HUMAN') {
    return NextResponse.json({ error: 'growth_human_session_required' }, { status: 401 })
  }

  const roles = principal.globalRoles.filter((role) => ALLOWED_ROLES.has(role))
  if (roles.length === 0) {
    const fallback = safeKanbanReportFallback(requestUrl.searchParams.get('fallback'))
    if (fallback) return NextResponse.redirect(new URL(fallback, publicKanbanOrigin(request)))
    return NextResponse.redirect(new URL('/dashboard/access-denied?reason=role', growthUrl))
  }

  const returnTo = safeGrowthReturnTo(requestUrl.searchParams.get('returnTo'), growthUrl)
  const brandKeys = roles.includes('ADMIN') ? ['*'] : await scopedGrowthBrandKeys(principal)
  const secret = process.env.AMC_GROWTH_SSO_SECRET?.trim()

  if (!secret) {
    console.error('AMC_GROWTH_SSO_SECRET is not configured')
    return NextResponse.json({ error: 'growth_sso_not_configured' }, { status: 503 })
  }

  const ticket = await new SignJWT({
    email: principal.email,
    roles,
    brandKeys,
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

async function scopedGrowthBrandKeys(principal: NonNullable<Awaited<ReturnType<typeof authenticateRequest>>>) {
  const userIds = [principal.userId, principal.linkedHumanUserId || ''].filter(Boolean)
  const brands: Array<{ id: string; growthBrandKey: string | null }> = await prisma.brand.findMany({
    where: {
      OR: [
        { crew: { members: { some: { active: true, userId: { in: userIds } } } } },
        { crew: { members: { some: { active: true, user: { organizationMembers: { some: { memberId: { in: userIds } } } } } } } },
      ],
    },
    select: { id: true, growthBrandKey: true },
  })
  const keys = await Promise.all(brands.map(async (brand) => (
    brand.growthBrandKey || await ensureGrowthMerchantByBrandId(brand.id).catch(() => '')
  )))
  return [...new Set(keys.filter(Boolean))]
}

function configuredGrowthUrl() {
  const raw = process.env.AMC_GROWTH_URL?.trim() || 'https://amc-growth.immedi.ai'
  const url = new URL(raw)
  return `${url.protocol}//${url.host}`
}

function safeGrowthReturnTo(raw: string | null, growthUrl: string) {
  try {
    const url = new URL(raw || '/dashboard', growthUrl)
    const isDashboardPath = url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')
    if (url.origin !== growthUrl || !isDashboardPath) return '/dashboard'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/dashboard'
  }
}

function safeKanbanReportFallback(raw: string | null) {
  if (!raw) return ''
  try {
    const url = new URL(raw, 'https://amc-kanban.invalid')
    const isReportPath = /^\/dashboard\/brands\/[^/]+\/research-report$/.test(url.pathname)
    if (url.origin !== 'https://amc-kanban.invalid' || !isReportPath) return ''
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return ''
  }
}
