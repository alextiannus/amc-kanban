import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { authenticateApiKey } from './api-key'
import { AuthenticationError } from './errors'
import {
  readSessionTokenFromRequest,
  sessionCookieName,
  verifySessionToken,
} from './session'
import { principalFromUser, type AuthPrincipal } from './types'

export function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')?.trim()
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const value = authorization.slice(7).trim()
    return value || null
  }

  const apiKey = request.headers.get('x-api-key')?.trim()
  return apiKey || null
}

async function principalFromSessionToken(token: string): Promise<AuthPrincipal | null> {
  const claims = await verifySessionToken(token)
  if (!claims) return null

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      email: true,
      type: true,
      role: true,
      status: true,
      authVersion: true,
      businessRoles: { select: { role: true } },
    },
  })
  if (!user || user.status !== 'ACTIVE') return null
  if (claims.authVersion > 0 && claims.authVersion !== user.authVersion) return null
  return principalFromUser(user, 'session')
}

export async function authenticateRequest(request: Request): Promise<AuthPrincipal | null> {
  const apiKey = extractBearerToken(request)
  if (apiKey) {
    const principal = await authenticateApiKey(apiKey)
    if (!principal) return null

    const delegatedAgentId = request.headers.get('x-agent-id')?.trim()
    if (!delegatedAgentId) return principal
    if (principal.actorType !== 'HUMAN' || !isLegacyDelegationActive()) return null

    const agent = await prisma.user.findFirst({
      where: {
        id: delegatedAgentId,
        ownerId: principal.userId,
        type: 'AI_AGENT',
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        type: true,
        role: true,
        status: true,
        authVersion: true,
        businessRoles: { select: { role: true } },
      },
    })
    return agent ? principalFromUser(agent, 'legacy_api_key', principal.credentialId) : null
  }

  const sessionToken = readSessionTokenFromRequest(request)
  if (!sessionToken) return null
  return principalFromSessionToken(sessionToken)
}

export function isLegacyDelegationActive(now = Date.now()): boolean {
  if (process.env.AUTH_V2_LEGACY_KEYS !== 'true') return false
  const cutoff = process.env.AUTH_V2_LEGACY_KEY_CUTOFF_AT
  if (!cutoff) return false
  const cutoffAt = Date.parse(cutoff)
  return Number.isFinite(cutoffAt) && now < cutoffAt
}

export async function authenticateCurrentSession(): Promise<AuthPrincipal | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(sessionCookieName)?.value
  if (!token) return null
  return principalFromSessionToken(token)
}

export async function requirePrincipal(request: Request): Promise<AuthPrincipal> {
  const principal = await authenticateRequest(request)
  if (!principal) throw new AuthenticationError()
  return principal
}
