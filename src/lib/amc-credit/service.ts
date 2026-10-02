import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canStartCreditTask, creditForPlan, cycleBounds, defaultCreditSettings, normalizeCreditPlan, summarizeCredit } from './policy'

type DbClient = Prisma.TransactionClient | typeof prisma

async function latestPlan(brandId: string, db: DbClient) {
  return db.brandSubscription.findFirst({
    where: { brandId, status: 'ACTIVE', OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }] },
    orderBy: { createdAt: 'desc' },
    select: { planId: true, planName: true, billingStartsAt: true, contractStartDate: true, createdAt: true },
  })
}

export async function ensureCreditAccount(brandId: string, db: DbClient = prisma) {
  const existing = await db.amcCreditAccount.findUnique({ where: { brandId } })
  if (existing) return ensureCurrentCycle(existing, db)
  const subscription = await latestPlan(brandId, db)
  const settings = defaultCreditSettings(subscription?.planName || subscription?.planId)
  const anchor = subscription?.billingStartsAt || subscription?.contractStartDate || subscription?.createdAt || new Date()
  const bounds = cycleBounds(anchor)
  const account = await db.amcCreditAccount.upsert({ where: { brandId }, update: {}, create: { brandId, ...settings, cycleAnchor: anchor, currentCycleStart: bounds.startsAt, currentCycleEnd: bounds.endsAt } })
  return ensureCurrentCycle(account, db)
}

async function ensureCurrentCycle(account: any, db: DbClient) {
  const bounds = cycleBounds(account.cycleAnchor)
  const needsUpdate = account.currentCycleStart.getTime() !== bounds.startsAt.getTime() || account.currentCycleEnd?.getTime() !== bounds.endsAt.getTime()
  const updated = needsUpdate ? await db.amcCreditAccount.update({ where: { id: account.id }, data: { currentCycleStart: bounds.startsAt, currentCycleEnd: bounds.endsAt } }) : account
  const cycle = await db.amcCreditCycle.upsert({
    where: { brandId_startsAt: { brandId: account.brandId, startsAt: bounds.startsAt } },
    create: { brandId: account.brandId, accountId: account.id, startsAt: bounds.startsAt, endsAt: bounds.endsAt, includedCredit: account.cycleAllowance },
    update: {},
  })
  return { ...updated, cycles: [cycle] }
}

export async function getCreditSnapshot(brandId: string, db: DbClient = prisma) {
  const account = await ensureCreditAccount(brandId, db)
  const cycle = account.cycles[0]
  const entries = await db.amcCreditLedgerEntry.findMany({ where: { cycleId: cycle.id }, orderBy: { createdAt: 'desc' } })
  return { account, cycle, entries, summary: summarizeCredit(cycle.includedCredit, entries) }
}

export async function reserveCredit(input: { brandId: string; taskType: string; taskId: string; credit: number; idempotencyKey: string; rawUsage?: Prisma.InputJsonValue; metadata?: Prisma.InputJsonValue }) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`amc-credit:${input.brandId}`}))`
    const snapshot = await getCreditSnapshot(input.brandId, tx)
    const prior = await tx.amcCreditLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (prior) {
      if (prior.accountId !== snapshot.account.id || prior.taskId !== input.taskId) throw Object.assign(new Error('AMC Credit idempotency key belongs to another task'), { status: 409 })
      return { entry: prior, snapshot }
    }
    if (!canStartCreditTask({ allowOverage: snapshot.account.allowOverage, includedCredit: snapshot.cycle.includedCredit, entries: snapshot.entries, requestedCredit: input.credit })) {
      throw Object.assign(new Error('AMC Credit 余额不足，当前品牌未允许超额使用。'), { status: 402, code: 'AMC_CREDIT_EXHAUSTED' })
    }
    const entry = await tx.amcCreditLedgerEntry.create({ data: { accountId: snapshot.account.id, cycleId: snapshot.cycle.id, kind: 'RESERVE', taskType: input.taskType, taskId: input.taskId, creditDelta: input.credit, idempotencyKey: input.idempotencyKey, rawUsage: input.rawUsage, metadata: input.metadata } })
    return { entry, snapshot: await getCreditSnapshot(input.brandId, tx) }
  }, { isolationLevel: 'Serializable' })
}

export async function settleCredit(input: { brandId: string; taskType: string; taskId: string; credit: number; idempotencyKey: string; reservationKey?: string; rawUsage?: Prisma.InputJsonValue; internalCostMicros?: bigint; metadata?: Prisma.InputJsonValue }) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`amc-credit:${input.brandId}`}))`
    const snapshot = await getCreditSnapshot(input.brandId, tx)
    const existing = await tx.amcCreditLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) {
      if (existing.accountId !== snapshot.account.id || existing.taskId !== input.taskId) throw Object.assign(new Error('AMC Credit idempotency key belongs to another task'), { status: 409 })
      return { entry: existing, snapshot }
    }
    if (input.reservationKey) {
      const reservation = await tx.amcCreditLedgerEntry.findUnique({ where: { idempotencyKey: input.reservationKey } })
      const reservationEntries = await tx.amcCreditLedgerEntry.findMany({ where: { accountId: snapshot.account.id, taskId: input.taskId, kind: { in: ['RESERVE', 'RELEASE'] } } })
      const reservedBalance = Math.max(0, reservationEntries.reduce((sum, entry) => sum + entry.creditDelta, 0))
      if (reservation?.kind === 'RESERVE' && reservedBalance > 0) await tx.amcCreditLedgerEntry.create({ data: { accountId: snapshot.account.id, cycleId: snapshot.cycle.id, kind: 'RELEASE', taskType: input.taskType, taskId: input.taskId, creditDelta: -Math.min(reservation.creditDelta, reservedBalance), idempotencyKey: `${input.idempotencyKey}:release`, metadata: { reservationKey: input.reservationKey } } })
    }
    const entry = await tx.amcCreditLedgerEntry.create({ data: { accountId: snapshot.account.id, cycleId: snapshot.cycle.id, kind: 'SETTLE', taskType: input.taskType, taskId: input.taskId, creditDelta: input.credit, idempotencyKey: input.idempotencyKey, rawUsage: input.rawUsage, internalCostMicros: input.internalCostMicros, metadata: input.metadata } })
    return { entry, snapshot: await getCreditSnapshot(input.brandId, tx) }
  }, { isolationLevel: 'Serializable' })
}

export async function releaseCredit(input: { brandId: string; taskId: string; reservationKey: string; idempotencyKey: string }) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`amc-credit:${input.brandId}`}))`
    const snapshot = await getCreditSnapshot(input.brandId, tx)
    const existing = await tx.amcCreditLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) {
      if (existing.accountId !== snapshot.account.id || existing.taskId !== input.taskId) throw Object.assign(new Error('AMC Credit idempotency key belongs to another task'), { status: 409 })
      return existing
    }
    const reservation = await tx.amcCreditLedgerEntry.findUnique({ where: { idempotencyKey: input.reservationKey } })
    if (!reservation || reservation.kind !== 'RESERVE') return null
    const reservationEntries = await tx.amcCreditLedgerEntry.findMany({ where: { accountId: snapshot.account.id, taskId: input.taskId, kind: { in: ['RESERVE', 'RELEASE'] } } })
    const reservedBalance = Math.max(0, reservationEntries.reduce((sum, entry) => sum + entry.creditDelta, 0))
    if (!reservedBalance) return null
    return tx.amcCreditLedgerEntry.create({ data: { accountId: snapshot.account.id, cycleId: snapshot.cycle.id, kind: 'RELEASE', taskId: input.taskId, creditDelta: -Math.min(reservation.creditDelta, reservedBalance), idempotencyKey: input.idempotencyKey, metadata: { reservationKey: input.reservationKey } } })
  }, { isolationLevel: 'Serializable' })
}

export async function updateCreditSettings(input: { brandId: string; planId?: unknown; cycleAllowance?: number; allowOverage?: boolean; allowNightlyOverage?: boolean; actorId: string }) {
  const current = await ensureCreditAccount(input.brandId)
  const planId = input.planId === undefined ? current.planId : normalizeCreditPlan(input.planId)
  const cycleAllowance = input.cycleAllowance === undefined ? (input.planId === undefined ? current.cycleAllowance : creditForPlan(planId)) : input.cycleAllowance
  if (!Number.isInteger(cycleAllowance) || cycleAllowance < 0 || cycleAllowance > 10_000_000) throw Object.assign(new Error('Invalid AMC Credit allowance'), { status: 400 })
  return prisma.$transaction(async tx => {
    const account = await tx.amcCreditAccount.update({ where: { brandId: input.brandId }, data: {
      planId, cycleAllowance, updatedById: input.actorId,
      ...(input.allowOverage === undefined ? {} : { allowOverage: input.allowOverage }),
      ...(input.allowNightlyOverage === undefined ? {} : { allowNightlyOverage: input.allowNightlyOverage }),
    } })
    await tx.amcCreditCycle.update({ where: { id: current.cycles[0].id }, data: { includedCredit: cycleAllowance } })
    return account
  })
}

export async function listCreditOverview(brandIds?: string[]) {
  const brands = await prisma.brand.findMany({ where: { status: 'ACTIVE', ...(brandIds ? { id: { in: brandIds } } : {}) }, select: { id: true, name: true } })
  const rows = await Promise.all(brands.map(async brand => {
    const snapshot = await getCreditSnapshot(brand.id)
    return { brandId: brand.id, brandName: brand.name, planId: snapshot.account.planId, allowOverage: snapshot.account.allowOverage, allowNightlyOverage: snapshot.account.allowNightlyOverage, cycleStart: snapshot.cycle.startsAt, cycleEnd: snapshot.cycle.endsAt, ...snapshot.summary }
  }))
  return rows.sort((a, b) => Number(b.overage > 0) - Number(a.overage > 0) || b.usagePercent - a.usagePercent || a.brandName.localeCompare(b.brandName))
}
