import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const RECORD_TTL_MS = 30 * 24 * 60 * 60 * 1000

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function requestHash(payload: unknown) {
  return createHash('sha256').update(stableJson(payload)).digest('hex')
}

export type PublishReservation =
  | { reserved: true }
  | { conflict: true }
  | { pending: true }
  | { replay: { response: Record<string, unknown>; statusCode: number } }

/**
 * Unlike inbox operations, an incomplete publish reservation is never leased
 * or reclaimed automatically. PostFast does not document social-post create
 * idempotency, so retrying after a lost response could create a duplicate.
 */
export async function reservePostfastPublish(input: { scope: string; key: string; payload: unknown }): Promise<PublishReservation> {
  const hash = requestHash(input.payload)
  const inspectExisting = async (tx: Prisma.TransactionClient): Promise<PublishReservation | null> => {
    const existing = await tx.idempotencyRecord.findUnique({
      where: { scope_key: { scope: input.scope, key: input.key } },
    })
    if (!existing) return null
    if (existing.requestHash !== hash) return { conflict: true }
    if (existing.response !== null && existing.statusCode !== null) {
      return {
        replay: {
          response: existing.response as Record<string, unknown>,
          statusCode: existing.statusCode,
        },
      }
    }
    return { pending: true }
  }

  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await inspectExisting(tx)
      if (existing) return existing
      await tx.idempotencyRecord.create({
        data: {
          scope: input.scope,
          key: input.key,
          requestHash: hash,
          expiresAt: new Date(Date.now() + RECORD_TTL_MS),
        },
      })
      return { reserved: true }
    })
  } catch (error: unknown) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => inspectExisting(tx) ?? { pending: true })
  }
}

export async function completePostfastPublish(
  scope: string,
  key: string,
  response: Record<string, unknown>,
  statusCode: number,
) {
  await prisma.idempotencyRecord.update({
    where: { scope_key: { scope, key } },
    data: { response: response as Prisma.InputJsonValue, statusCode },
  })
}