import crypto from 'crypto'
import { prisma } from '../prisma.ts'
import { principalFromUser, type AuthPrincipal } from './types.ts'

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000

export function hashApiKeyToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function apiKeyPrefix(token: string): string {
  return token.slice(0, 12)
}

export function createApiKeyToken(prefix = 'amc_key'): string {
  return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`
}

function isActiveDateRange(expiresAt: Date | null, revokedAt: Date | null): boolean {
  if (revokedAt) return false
  return !expiresAt || expiresAt.getTime() > Date.now()
}

function scheduleLastUsedUpdate(id: string, lastUsedAt: Date | null) {
  if (lastUsedAt && Date.now() - lastUsedAt.getTime() < LAST_USED_WRITE_INTERVAL_MS) return
  void prisma.userApiKey
    .update({ where: { id }, data: { lastUsedAt: new Date() } })
    .catch((error: unknown) => console.error('[auth-v2] API key lastUsedAt update failed', error))
}

export async function authenticateApiKey(token: string): Promise<AuthPrincipal | null> {
  const tokenHash = hashApiKeyToken(token)
  const key = await prisma.userApiKey.findFirst({
    where: { OR: [{ tokenHash }, { token }] },
    select: {
      id: true,
      token: true,
      tokenHash: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          type: true,
          role: true,
          status: true,
          authVersion: true,
          businessRoles: { select: { role: true } },
        },
      },
    },
  })

  if (key) {
    if (key.user.status !== 'ACTIVE') return null
    if (!isActiveDateRange(key.expiresAt, key.revokedAt)) return null

    if (!key.tokenHash) {
      try {
        await prisma.userApiKey.update({
          where: { id: key.id },
          data: { tokenHash, prefix: apiKeyPrefix(token) },
        })
      } catch (error: unknown) {
        console.error('[auth-v2] legacy API key hash migration failed', error)
      }
    }
    scheduleLastUsedUpdate(key.id, key.lastUsedAt)
    return principalFromUser(key.user, 'api_key', key.id)
  }
  return null
}
