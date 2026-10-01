import { cookies, headers } from 'next/headers'
import { prisma } from '../prisma.ts'
import { authenticateApiKey } from './api-key.ts'
import { AuthenticationError } from './errors.ts'
import {
  readSessionTokenFromRequest,
  sessionCookieName,
  verifySessionToken,
} from './session.ts'
import { principalFromUser, type AuthPrincipal } from './types.ts'

export function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  const apiKey = request.headers.get('x-api-key')?.trim()
  if (authorization !== null) {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim())
    if (!match || (request.headers.has('x-api-key') && apiKey !== match[1])) return null
    return match[1]
  }
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
      ownerId: true,
      owner: {
        select: {
          id: true,
          role: true,
          businessRoles: { select: { role: true } },
        },
      },
    },
  })
  if (!user || user.status !== 'ACTIVE') return null
  if (claims.authVersion > 0 && claims.authVersion !== user.authVersion) return null
  return principalFromUser(user, 'session')
}

export async function authenticateRequest(request: Request): Promise<AuthPrincipal | null> {
  const explicitKey = request.headers.has('authorization') || request.headers.has('x-api-key')
  const apiKey = extractBearerToken(request)
  if (explicitKey) {
    if (!apiKey) return null
    const principal = await authenticateApiKey(apiKey)
    if (!principal) return null
    return principal
  }

  const sessionToken = readSessionTokenFromRequest(request)
  if (!sessionToken) return null
  return principalFromSessionToken(sessionToken)
}

export async function authenticateCurrentSession(): Promise<AuthPrincipal | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(sessionCookieName)?.value
  if (!token) return null
  return principalFromSessionToken(token)
}

export async function authenticateCurrentRequest(): Promise<AuthPrincipal | null> {
  return authenticateRequest(new Request('http://amc.internal', { headers: await headers() }))
}

export async function requirePrincipal(request: Request): Promise<AuthPrincipal> {
  const principal = await authenticateRequest(request)
  if (!principal) throw new AuthenticationError()
  return principal
}
