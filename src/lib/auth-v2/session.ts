import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const SESSION_ISSUER = 'amc-kanban'
const SESSION_AUDIENCE = 'amc-users'
const SESSION_COOKIE = 'session'

export type SessionClaims = JWTPayload & {
  sub: string
  type: string
  authVersion: number
}

function getJwtKey() {
  const secretKey = process.env.JWT_SECRET
  if (!secretKey) throw new Error('JWT_SECRET environment variable is required')
  return new TextEncoder().encode(secretKey)
}

export async function createSessionToken(input: {
  userId: string
  type: string
  authVersion: number
  expiresIn?: string
}) {
  return new SignJWT({
    type: input.type,
    authVersion: input.authVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(input.expiresIn ?? '7d')
    .sign(getJwtKey())
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtKey(), {
      algorithms: ['HS256'],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    })
    if (
      typeof payload.sub !== 'string' ||
      typeof (payload as SessionClaims).type !== 'string' ||
      !Number.isInteger((payload as SessionClaims).authVersion) ||
      (payload as SessionClaims).authVersion < 1
    ) return null
    return payload as SessionClaims
  } catch {
    return null
  }
}

export function readSessionTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get('cookie') || ''
  for (const part of cookie.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (name === SESSION_COOKIE) return decodeURIComponent(valueParts.join('='))
  }
  return null
}

export const sessionCookieName = SESSION_COOKIE
