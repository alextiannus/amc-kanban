import crypto from 'crypto'
import { prisma } from './prisma'
import { hashPassword } from './auth-v2/password'

export type BrandOwnerAccountResult =
  | { ok: true; user: { id: string; email: string }; created: boolean }
  | { ok: false; reason: 'invalid_email' | 'existing_non_human' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function findOrCreateBrandOwnerAccount(email: string): Promise<BrandOwnerAccountResult> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalizedEmail)) return { ok: false, reason: 'invalid_email' }

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, type: true },
  })

  if (existing) {
    if (existing.type !== 'HUMAN') return { ok: false, reason: 'existing_non_human' }

    await prisma.userBusinessRole.upsert({
      where: { userId_role: { userId: existing.id, role: 'BRAND_OWNER' } },
      create: { userId: existing.id, role: 'BRAND_OWNER' },
      update: {},
    })

    return { ok: true, user: { id: existing.id, email: existing.email }, created: false }
  }

  const temporaryPassword = crypto.randomBytes(18).toString('base64url')
  const hashedPassword = await hashPassword(temporaryPassword)
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      password: hashedPassword,
      type: 'HUMAN',
      role: 'USER',
      businessRoles: { create: { role: 'BRAND_OWNER' } },
    },
    select: { id: true, email: true },
  })

  return { ok: true, user, created: true }
}
