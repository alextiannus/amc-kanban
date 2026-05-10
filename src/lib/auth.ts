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

export async function encrypt(payload: any) {
  const key = getJwtKey()
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key)
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
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.split(' ')[1]
  if (!token || token.length < 20) return null
  return token
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

    return agent;
  } catch {
    return null
  }
}
