import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { authenticateApiKey, authenticateCurrentSession } from './auth-v2/index.ts'

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
  userRoles?: string[]
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

export async function getSession(): Promise<Session | null> {
  const principal = await authenticateCurrentSession()
  if (!principal) return null
  return {
    sub: principal.userId,
    user: {
      id: principal.userId,
      email: principal.email,
      role: principal.globalRoles.includes('ADMIN') ? 'ADMIN' : 'USER',
      type: principal.actorType === 'AMC_AGENT' ? 'AI_AGENT' : 'HUMAN',
      userRoles: principal.globalRoles,
    },
  }
}

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

  // Backward compatibility: allow passing raw API key in Authorization header.
  return authHeader.length >= 20 ? authHeader : null
}

// Get agent by API key from database
export async function getAgentFromApiKey(apiKey: string) {
  const principal = await authenticateApiKey(apiKey)
  if (!principal || principal.actorType !== 'AMC_AGENT') return null
  return {
    id: principal.userId,
    email: principal.email,
    type: 'AI_AGENT',
    role: principal.globalRoles.includes('ADMIN') ? 'ADMIN' : 'USER',
    userRoles: principal.globalRoles,
  }
}
