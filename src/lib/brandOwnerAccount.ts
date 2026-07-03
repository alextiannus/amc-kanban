import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from './prisma'

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
  // bcryptjs is pure-JS (not native) — it blocks the event loop during hashing.
  // Cost factor 12 takes 15-30s on Render's throttled CPU. Use 8 for auto-generated
  // temporary passwords: still secure (2^8=256 rounds), ~50ms even on slow hardware.
  const hashedPassword = await bcrypt.hash(temporaryPassword, 8)
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
