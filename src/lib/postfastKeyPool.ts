import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'

type PrismaLike = typeof prisma

export const POSTFAST_KEY_STATUSES = ['AVAILABLE', 'ASSIGNED', 'RETIRED'] as const
export type PostfastKeyStatus = (typeof POSTFAST_KEY_STATUSES)[number]

export function normalizePostfastApiKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function hashPostfastApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function maskPostfastApiKey(token: string | null | undefined): string | null {
  if (!token) return null
  const trimmed = token.trim()
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 4)}••••••${trimmed.slice(-4)}`
}

export function getPostfastKeyParts(token: string) {
  const trimmed = token.trim()
  return {
    prefix: trimmed.slice(0, Math.min(6, trimmed.length)) || null,
    last4: trimmed.slice(-4) || null,
  }
}

function sanitizePoolRecord(record: any) {
  return {
    id: record.id,
    label: record.label,
    maskedKey: maskPostfastApiKey(record.token),
    prefix: record.prefix,
    last4: record.last4,
    status: record.status,
    assignedBrandId: record.assignedBrandId,
    assignedUserId: record.assignedUserId,
    assignedAt: record.assignedAt,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    assignedBrand: record.assignedBrand ?? null,
  }
}

export function sanitizePostfastPoolRecords(records: any[]) {
  return records.map(sanitizePoolRecord)
}

export async function createPostfastPoolKeys(input: {
  tokens: string[]
  label?: string | null
  notes?: string | null
  createdById?: string | null
}) {
  const cleanTokens = Array.from(new Set(input.tokens.map(normalizePostfastApiKey).filter(Boolean)))
  const created: any[] = []
  const duplicates: string[] = []

  for (const token of cleanTokens) {
    const tokenHash = hashPostfastApiKey(token)
    const parts = getPostfastKeyParts(token)
    try {
      const record = await (prisma as any).postfastApiKeyPool.create({
        data: {
          label: input.label?.trim() || null,
          token,
          tokenHash,
          prefix: parts.prefix,
          last4: parts.last4,
          status: 'AVAILABLE',
          notes: input.notes?.trim() || null,
          createdById: input.createdById || null,
        },
      })
      created.push(record)
    } catch (error: any) {
      if (error?.code === 'P2002') duplicates.push(maskPostfastApiKey(token) || 'duplicate')
      else throw error
    }
  }

  return { created: sanitizePostfastPoolRecords(created), duplicates }
}

export async function provisionPostfastKeyForBrand(input: {
  brandId: string
  userId?: string | null
  tx?: PrismaLike
}) {
  const db: any = input.tx || prisma
  const brand = await db.brand.findUnique({
    where: { id: input.brandId },
    select: { id: true, postfastApiKey: true, ownerId: true },
  })
  if (!brand) return { ok: false as const, reason: 'brand_not_found' as const }
  if (brand.postfastApiKey) return { ok: true as const, skipped: true as const, reason: 'brand_already_configured' as const }

  const existing = await db.postfastApiKeyPool.findFirst({
    where: { assignedBrandId: input.brandId, status: 'ASSIGNED' },
    orderBy: { assignedAt: 'desc' },
  })
  if (existing) {
    await db.brand.update({
      where: { id: input.brandId },
      data: { postfastApiKey: existing.token },
    })
    return { ok: true as const, keyId: existing.id, restored: true as const }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const available = await db.postfastApiKeyPool.findFirst({
      where: { status: 'AVAILABLE', assignedBrandId: null },
      orderBy: { createdAt: 'asc' },
    })
    if (!available) return { ok: false as const, reason: 'no_available_key' as const }

    const assignedUserId = input.userId || brand.ownerId || null
    const updated = await db.postfastApiKeyPool.updateMany({
      where: { id: available.id, status: 'AVAILABLE', assignedBrandId: null },
      data: {
        status: 'ASSIGNED',
        assignedBrandId: input.brandId,
        assignedUserId,
        assignedAt: new Date(),
      },
    })
    if (updated.count === 0) continue

    await db.brand.update({
      where: { id: input.brandId },
      data: { postfastApiKey: available.token },
    })
    return { ok: true as const, keyId: available.id, assigned: true as const }
  }

  return { ok: false as const, reason: 'assignment_conflict' as const }
}
