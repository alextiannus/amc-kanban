#!/usr/bin/env node

import {
  MANUAL_HISTORICAL_POST_MARKER,
  chooseTikTokRepairAccount,
  inspectManualHistoricalDraft,
} from '../src/lib/manualHistoricalPlatformRepair.ts'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const dryRun = args.includes('--dry-run') || !apply
const brandFlag = args.findIndex(value => value === '--brand' || value === '--brand-id')
const brandId = brandFlag >= 0 ? args[brandFlag + 1] : undefined

if (apply && args.includes('--dry-run')) throw new Error('Choose either --dry-run or --apply, not both.')
if (brandFlag >= 0 && !brandId) throw new Error('--brand requires a brand ID.')
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Run this command only in the target Kanban environment.')
}

const { prisma } = await import('../src/lib/prisma.ts')

const candidateSelect = {
  id: true,
  brandId: true,
  accountId: true,
  status: true,
  agentNote: true,
  platformPostId: true,
  postUrl: true,
  publishedAt: true,
  createdAt: true,
  account: { select: { id: true, platformId: true, handle: true, displayName: true } },
  postfastDeliveryJobs: { select: { id: true } },
  brand: { select: { id: true, name: true } },
} as const

async function findCandidates() {
  return prisma.contentDraft.findMany({
    where: {
      ...(brandId ? { brandId } : {}),
      agentNote: MANUAL_HISTORICAL_POST_MARKER,
      status: 'published',
      account: { is: { platformId: 'instagram', handle: 'unconfigured' } },
    },
    select: candidateSelect,
    orderBy: [{ brandId: 'asc' }, { createdAt: 'asc' }],
  })
}

function inspect(candidate: Awaited<ReturnType<typeof findCandidates>>[number]) {
  return inspectManualHistoricalDraft({
    agentNote: candidate.agentNote,
    status: candidate.status,
    platformPostId: candidate.platformPostId,
    postUrl: candidate.postUrl,
    deliveryJobCount: candidate.postfastDeliveryJobs.length,
    account: candidate.account,
  })
}

async function loadTikTokAccounts(brandIds: string[]) {
  const accounts = brandIds.length
    ? await prisma.socialAccount.findMany({
        where: { brandId: { in: brandIds }, platformId: 'tiktok' },
        select: { id: true, brandId: true, platformId: true, handle: true },
      })
    : []
  const byBrand = new Map<string, typeof accounts>()
  for (const account of accounts) {
    byBrand.set(account.brandId, [...(byBrand.get(account.brandId) ?? []), account])
  }
  return byBrand
}

const candidates = await findCandidates()
const inspections = candidates.map(candidate => ({ candidate, inspection: inspect(candidate) }))
const repairable = inspections.filter(item => item.inspection.kind === 'repair')
const review = inspections.filter(item => item.inspection.kind === 'review')
const ignored = inspections.filter(item => item.inspection.kind === 'ignore')
const accountsByBrand = await loadTikTokAccounts([...new Set(candidates.map(candidate => candidate.brandId))])

console.log(JSON.stringify({
  event: 'manual_historical_platform_repair_start',
  mode: dryRun ? 'dry-run' : 'apply',
  brandId: brandId ?? null,
  scanned: candidates.length,
  repairable: repairable.length,
  review: review.length,
  ignored: ignored.length,
}))

for (const { candidate, inspection } of repairable) {
  const existingTarget = chooseTikTokRepairAccount(accountsByBrand.get(candidate.brandId) ?? [], inspection.tiktokHandle)
  console.log(JSON.stringify({
    event: 'repair_candidate',
    draftId: candidate.id,
    brandId: candidate.brandId,
    brandName: candidate.brand.name,
    postUrl: candidate.postUrl,
    publishedAt: candidate.publishedAt,
    oldAccountId: candidate.accountId,
    targetAccountId: existingTarget?.id ?? null,
    targetAccountMode: existingTarget
      ? existingTarget.handle === 'unconfigured' ? 'existing_placeholder' : 'matched_handle'
      : 'create_placeholder',
  }))
}

for (const { candidate, inspection } of review) {
  console.log(JSON.stringify({
    event: 'manual_review_required',
    reason: inspection.reason,
    draftId: candidate.id,
    brandId: candidate.brandId,
    brandName: candidate.brand.name,
    postUrl: candidate.postUrl,
    publishedAt: candidate.publishedAt,
    accountId: candidate.accountId,
  }))
}

let updated = 0
let skipped = 0
let failed = 0

if (apply) {
  for (const { candidate } of repairable) {
    try {
      const result = await prisma.$transaction(async tx => {
        const current = await tx.contentDraft.findUnique({
          where: { id: candidate.id },
          select: candidateSelect,
        })
        if (!current) return { status: 'skipped', reason: 'draft_missing' } as const

        const currentInspection = inspect(current)
        if (currentInspection.kind !== 'repair') {
          return { status: 'skipped', reason: `no_longer_repairable:${currentInspection.reason}` } as const
        }

        const tiktokAccounts = await tx.socialAccount.findMany({
          where: { brandId: current.brandId, platformId: 'tiktok' },
          select: { id: true, platformId: true, handle: true },
        })
        let target = chooseTikTokRepairAccount(tiktokAccounts, currentInspection.tiktokHandle)
        if (!target) {
          target = await tx.socialAccount.upsert({
            where: {
              brandId_platformId_handle: {
                brandId: current.brandId,
                platformId: 'tiktok',
                handle: 'unconfigured',
              },
            },
            create: {
              brandId: current.brandId,
              platformId: 'tiktok',
              handle: 'unconfigured',
              displayName: 'TikTok (未配置)',
            },
            update: {},
            select: { id: true, platformId: true, handle: true },
          })
        }

        const changed = await tx.contentDraft.updateMany({
          where: { id: current.id, accountId: current.accountId },
          data: { accountId: target.id },
        })
        if (changed.count !== 1) throw new Error('Draft changed concurrently before repair.')

        await tx.auditLog.create({
          data: {
            actorType: 'SYSTEM',
            actorName: 'repair-manual-historical-platforms',
            action: 'repair_manual_historical_platform',
            resourceId: current.id,
            resourceType: 'ContentDraft',
            oldValue: {
              accountId: current.accountId,
              platformId: current.account?.platformId ?? null,
              handle: current.account?.handle ?? null,
            },
            newValue: {
              accountId: target.id,
              platformId: target.platformId,
              handle: target.handle ?? null,
            },
            reason: 'Manual historical TikTok post was saved against the Instagram placeholder account.',
            metadata: {
              postUrl: current.postUrl,
              matchedTikTokHandle: currentInspection.tiktokHandle ?? null,
              script: 'repair-manual-historical-platforms',
            },
          },
        })

        return { status: 'updated', targetAccountId: target.id } as const
      })

      if (result.status === 'updated') {
        updated += 1
        console.log(JSON.stringify({ event: 'repair_applied', draftId: candidate.id, targetAccountId: result.targetAccountId }))
      } else {
        skipped += 1
        console.log(JSON.stringify({ event: 'repair_skipped', draftId: candidate.id, reason: result.reason }))
      }
    } catch (error) {
      failed += 1
      console.error(JSON.stringify({
        event: 'repair_failed',
        draftId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }
}

const remaining = (await findCandidates()).filter(candidate => inspect(candidate).kind === 'repair').length
console.log(JSON.stringify({
  event: 'manual_historical_platform_repair_summary',
  mode: dryRun ? 'dry-run' : 'apply',
  scanned: candidates.length,
  repairable: repairable.length,
  review: review.length,
  ignored: ignored.length,
  updated,
  skipped,
  failed,
  remainingRepairable: remaining,
}))

await prisma.$disconnect()
if (failed > 0 || (apply && remaining > 0)) process.exitCode = 2
