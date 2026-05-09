import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const secretKey = process.env.JWT_SECRET || 'secret-for-kanban-amc'
const key = new TextEncoder().encode(secretKey)
const bootstrapAdminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'alextiannus@gmail.com'

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key)
}

export async function decrypt(input: string): Promise<any> {
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

    if (payload?.user?.email === bootstrapAdminEmail && payload.user.role !== 'ADMIN') {
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

export function verifyApiKey(request: Request): boolean {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.split(' ')[1]
  // For transition: accept any valid token format
  // Individual key verification happens at route level
  return token && token.length > 0
}

// Get agent by API key from database
export async function getAgentFromApiKey(apiKey: string) {
  try {
    const { prisma } = await import('./prisma')
    return await prisma.user.findUnique({
      where: { apiKey },
      select: { id: true, email: true, type: true }
    })
  } catch {
    return null
  }
}
