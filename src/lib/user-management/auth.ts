import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import crypto from 'crypto'
import { prisma } from '../prisma.ts'
import { isSystemAdminEmail } from '../amcOperator.ts'

function getJwtKey() {
  const secretKey = process.env.JWT_SECRET
  if (!secretKey) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  return new TextEncoder().encode(secretKey)
}

type SessionPayload = JWTPayload & {
  user?: {
    id?: string
    email?: string
    role?: string
    type?: string
    [key: string]: unknown
  }
  agentId?: string
}

export type SessionUser = {
  id: string
  email?: string
  role: string
  type: string
  [key: string]: unknown
}

export type Session = Omit<SessionPayload, 'user'> & {
  user: SessionUser
}

export async function encrypt(payload: JWTPayload, expiresIn: string = '7d') {
  const key = getJwtKey()
  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
  if (expiresIn) {
    builder.setExpirationTime(expiresIn)
  }
  return await builder.sign(key)
}

export async function decrypt(input: string): Promise<SessionPayload> {
  const key = getJwtKey()
  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  })
  return payload as SessionPayload
}

/** Check NextAuth cookie-based session */
export async function getSession(): Promise<Session | null> {
  let cookieStore
  try {
    const { cookies: getCookies } = await import('next/headers')
    cookieStore = await getCookies()
  } catch (e) {
    return null
  }
  const session = cookieStore.get('session')?.value
  if (!session) return null
  try {
    const payload = await decrypt(session)
    if (!payload.user || typeof payload.user.id !== 'string') {
      return null
    }

    const normalizedUser: SessionUser = {
      ...payload.user,
      id: payload.user.id,
      email: typeof payload.user.email === 'string' ? payload.user.email : undefined,
      role: typeof payload.user.role === 'string' ? payload.user.role : 'USER',
      type: typeof payload.user.type === 'string' ? payload.user.type : 'HUMAN',
    }

    if (isSystemAdminEmail(normalizedUser.email) && normalizedUser.role !== 'ADMIN') {
      return {
        ...payload,
        user: {
          ...normalizedUser,
          role: 'ADMIN'
        }
      }
    }

    return {
      ...payload,
      user: normalizedUser,
    }
  } catch {
    return null
  }
}

/** Helper to extract API Key from headers */
export function extractApiKey(request: Request): string | null {
  const apiKeyHeader = request.headers.get('x-api-key')?.trim()
  if (apiKeyHeader && apiKeyHeader.length >= 20) {
    return apiKeyHeader
  }

  const authHeader = request.headers.get('Authorization')?.trim()
  if (!authHeader) return null

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    return token.length >= 20 ? token : null
  }

  return authHeader.length >= 20 ? authHeader : null
}

/** Verify a personal User API Key, returning the associated human User */
export async function verifyUserApiKey(token: string): Promise<SessionUser | null> {
  try {
    const apiKeyRecord = await prisma.userApiKey.findUnique({
      where: { token },
      include: {
        user: {
          select: { id: true, email: true, role: true, type: true }
        }
      }
    })

    if (apiKeyRecord) {
      // Update lastUsedAt asynchronously
      prisma.userApiKey.update({
        where: { id: apiKeyRecord.id },
        data: { lastUsedAt: new Date() }
      }).catch((err: any) => console.error('Failed to update UserApiKey lastUsedAt:', err))

      return {
        id: apiKeyRecord.user.id,
        email: apiKeyRecord.user.email,
        role: apiKeyRecord.user.role,
        type: apiKeyRecord.user.type,
      }
    }

    // Fallback: Legacy Direct Agent API Key resolution (for backward compatibility / transitioning)
    let agent = await prisma.user.findFirst({
      where: { apiKey: token, type: 'AI_AGENT' },
      select: { id: true, email: true, role: true, type: true }
    })

    if (!agent) {
      const hashedApiKey = crypto.createHash('sha256').update(token).digest('hex')
      agent = await prisma.user.findFirst({
        where: { apiKey: hashedApiKey, type: 'AI_AGENT' },
        select: { id: true, email: true, role: true, type: true }
      })
    }

    if (agent) {
      return {
        id: agent.id,
        email: agent.email,
        role: agent.role,
        type: agent.type,
      }
    }

    return null;
  } catch (error) {
    console.error('Error verifying UserApiKey:', error)
    return null
  }
}

export type AuthContext = {
  user: SessionUser
  agentId: string | null
}

/** Resolves the request context from either cookie session (human) or API key (agent delegation) */
export async function resolveSessionOrApiKey(request: Request): Promise<AuthContext | null> {
  // 1. Try resolving via session cookie (Web UI / human)
  const session = await getSession()
  if (session) {
    return {
      user: session.user,
      agentId: null
    }
  }

  // 2. Try resolving via Bearer token / API Key (AI agent delegation)
  const apiKey = extractApiKey(request)
  if (apiKey) {
    const delegatedUser = await verifyUserApiKey(apiKey)
    if (delegatedUser) {
      const agentId = request.headers.get('x-agent-id')?.trim() || null
      return {
        user: delegatedUser, // Backend treats permissions as the delegated human user
        agentId // AI Agent ID acting as the avatar
      }
    }
  }

  return null
}
