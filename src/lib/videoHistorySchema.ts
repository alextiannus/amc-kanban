import { prisma } from './prisma'

/** Additive, idempotent migration completed before this instance accepts traffic. */
export async function ensureVideoHistorySchema() {
  const rows = await prisma.$queryRawUnsafe(`SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='VideoProductionJob' AND column_name='historyDeletedAt'
  ) AS ready`) as Array<{ ready: boolean }>
  if (rows[0]?.ready) return
  await prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='5s'")
    await tx.$executeRawUnsafe('ALTER TABLE "VideoProductionJob" ADD COLUMN IF NOT EXISTS "historyDeletedAt" TIMESTAMP(3)')
  })
}
