import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import crypto from 'crypto'

function getJwtKey() {
  const secretKey = process.env.JWT_SECRET
  if (!secretKey) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  return new TextEncoder().encode(secretKey)
}
const bootstrapAdminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim()

export async function encrypt(payload: any, expiresIn: string = '7d') {
  const key = getJwtKey()
  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
  if (expiresIn) {
    builder.setExpirationTime(expiresIn)
  }
  return await builder.sign(key)
}

export async function decrypt(input: string): Promise<any> {
  const key = getJwtKey()
  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  })
  return payload
}

export async function getSession() {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')?.value
  if (!session) return null
  try {
    const payload = await decrypt(session)

    if (bootstrapAdminEmail && payload?.user?.email === bootstrapAdminEmail && payload.user.role !== 'ADMIN') {
      return {
        ...payload,
        user: {
          ...payload.user,
          role: 'ADMIN'
        }
      }
    }

    return payload
  } catch (error) {
    return null
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
  try {
    const { prisma } = await import('./prisma')
    
    // 1. Try finding it as plaintext (new format)
    let agent = await prisma.user.findUnique({
      where: { apiKey },
      select: { id: true, email: true, type: true }
    })

    // 2. Fallback to hashed format (legacy support)
    if (!agent) {
      const hashedApiKey = crypto.createHash('sha256').update(apiKey).digest('hex')
      agent = await prisma.user.findUnique({
        where: { apiKey: hashedApiKey },
        select: { id: true, email: true, type: true }
      })
    }

    // 3. Fallback: decrypt as JWT if it starts with eyJ
    if (!agent && apiKey.startsWith('eyJ')) {
      try {
        const payload = await decrypt(apiKey)
        if (payload && payload.agentId) {
          agent = await prisma.user.findUnique({
            where: { id: payload.agentId },
            select: { id: true, email: true, type: true }
          })
        }
      } catch {
        // Failed to decrypt or verify
      }
    }

    return agent;
  } catch {
    return null
  }
}
