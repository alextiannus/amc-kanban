#!/usr/bin/env node

import type { Prisma } from '@prisma/client'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { prisma } from '../src/lib/prisma.ts'
import { runBrandPlanAction } from '../src/lib/brand-plan/service.ts'
import {
  executeCalendarRecoveryTargets,
  inspectCalendarInspirationIdentity,
  minimumCompleteCalendarMonthValue,
  selectCalendarRecoveryTargets,
  type CalendarRecoveryBrand,
  type CalendarRecoveryCheckpointEntry,
  type CalendarRecoveryItem,
  type CalendarRecoveryTarget,
} from '../src/lib/brand-plan/calendarRecovery.ts'

type CheckpointFile = {
  version: 1
  recovery: 'brand-plan-inspiration-identity-v1'
  updatedAt: string
  entries: Record<string, CalendarRecoveryCheckpointEntry>
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const explicitDryRun = args.includes('--dry-run')

if (apply && explicitDryRun) throw new Error('Choose either --dry-run or --apply, not both.')

function option(name: string) {
  const inline = args.find((value) => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1).trim() || undefined
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1]?.trim() || undefined : undefined
}

const brandId = option('--brand-id')
const brandName = option('--brand-name')
const month = option('--month')
const checkpointOption = option('--checkpoint')
const maxAttemptsValue = option('--max-attempts')
const maxAttempts = maxAttemptsValue ? Number(maxAttemptsValue) : 2

if (month && !/^\d{4}-\d{2}$/.test(month)) throw new Error('--month must use YYYY-MM.')
if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
  throw new Error('--max-attempts must be an integer from 1 to 5.')
}
if (apply && !checkpointOption) {
  throw new Error('--apply requires --checkpoint=<durable-json-path>.')
}

const checkpointPath = checkpointOption ? resolve(checkpointOption) : undefined

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalJson(nested)])
  )
}

function workspaceFromKnowledge(knowledge: { brandPlan?: unknown; marketingSolution?: unknown } | null) {
  return {
    ...objectValue(knowledge?.brandPlan),
    ...objectValue(knowledge?.marketingSolution),
  } as CalendarRecoveryBrand['marketingSolution']
}

async function loadCheckpoint(): Promise<CheckpointFile> {
  if (!checkpointPath) {
    return { version: 1, recovery: 'brand-plan-inspiration-identity-v1', updatedAt: new Date(0).toISOString(), entries: {} }
  }
  try {
    const parsed = JSON.parse(await readFile(checkpointPath, 'utf8')) as CheckpointFile
    if (parsed.version !== 1 || parsed.recovery !== 'brand-plan-inspiration-identity-v1' || !parsed.entries) {
      throw new Error('checkpoint_format_invalid')
    }
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, recovery: 'brand-plan-inspiration-identity-v1', updatedAt: new Date(0).toISOString(), entries: {} }
    }
    throw error
  }
}

async function saveCheckpoint(checkpoint: CheckpointFile) {
  if (!checkpointPath) return
  checkpoint.updatedAt = new Date().toISOString()
  await mkdir(dirname(checkpointPath), { recursive: true })
  const temporaryPath = `${checkpointPath}.tmp-${process.pid}`
  await writeFile(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, checkpointPath)
}

async function saveRecoveryBackup(target: CalendarRecoveryTarget) {
  return prisma.$transaction(async (transaction: typeof prisma) => {
    const previous = await transaction.brandMarketingSolution.findFirst({
      where: { brandId: target.brandId, kind: 'CALENDAR', period: target.month },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    return transaction.brandMarketingSolution.create({
      data: {
        brandId: target.brandId,
        kind: 'CALENDAR',
        period: target.month,
        version: (previous?.version || 0) + 1,
        input: {
          recovery: 'brand-plan-inspiration-identity-v1',
          snapshotType: 'BEFORE_REGENERATION',
          capturedAt: new Date().toISOString(),
          previousCalendarGeneratedAt: target.generatedAt || null,
        } as Prisma.InputJsonValue,
        output: {
          month: target.month,
          items: target.items,
        } as Prisma.InputJsonValue,
        generationMode: 'MANUAL_EDIT',
      },
      select: { id: true, version: true, generatedAt: true },
    })
  })
}

async function loadCurrentTarget(initialTarget: CalendarRecoveryTarget) {
  const knowledge = await prisma.brandKnowledge.findUnique({
    where: { brandId: initialTarget.brandId },
    select: { brandPlan: true, marketingSolution: true, publishingFreq: true },
  })
  const workspace = workspaceFromKnowledge(knowledge)
  const calendar = objectValue(workspace?.publishingCalendar)
  const months = objectValue(calendar.months)
  const items = months[initialTarget.month]
  if (!Array.isArray(items)) throw new Error(`calendar_month_no_longer_exists:${initialTarget.key}`)
  return {
    ...initialTarget,
    publishingFreq: knowledge?.publishingFreq,
    generatedAt: typeof calendar.generatedAt === 'string' ? calendar.generatedAt : undefined,
    items: items as CalendarRecoveryItem[],
    inspection: inspectCalendarInspirationIdentity(items as CalendarRecoveryItem[]),
  }
}

async function verifyPersistedMonth(target: CalendarRecoveryTarget, generatedItems: CalendarRecoveryItem[]) {
  const [knowledge, version] = await Promise.all([
    prisma.brandKnowledge.findUnique({
      where: { brandId: target.brandId },
      select: { brandPlan: true, marketingSolution: true },
    }),
    prisma.brandMarketingSolution.findFirst({
      where: { brandId: target.brandId, kind: 'CALENDAR', period: target.month },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, generationMode: true, generatedAt: true },
    }),
  ])
  const workspace = workspaceFromKnowledge(knowledge)
  const persistedItems = objectValue(objectValue(workspace?.publishingCalendar).months)[target.month]
  if (!Array.isArray(persistedItems)) throw new Error(`calendar_readback_missing:${target.key}`)
  const inspection = inspectCalendarInspirationIdentity(persistedItems as CalendarRecoveryItem[])
  if (inspection.issues.length) throw new Error(`calendar_readback_invalid:${JSON.stringify(inspection.issues)}`)
  if (JSON.stringify(canonicalJson(persistedItems)) !== JSON.stringify(canonicalJson(generatedItems))) {
    throw new Error(`calendar_readback_changed:${target.key}`)
  }
  if (!version || version.generationMode !== 'AMC_CONTENT_ASSISTED') {
    throw new Error(`calendar_version_missing:${target.key}`)
  }
  return version
}

const brands = await prisma.brand.findMany({
  select: {
    id: true,
    name: true,
    knowledge: {
      select: { brandPlan: true, marketingSolution: true, publishingFreq: true },
    },
  },
  orderBy: [{ name: 'asc' }, { id: 'asc' }],
})

if (brandName) {
  const matchingBrands = brands.filter((brand: { name: string }) => brand.name === brandName)
  if (matchingBrands.length !== 1) {
    throw new Error(`--brand-name must match exactly one brand; matched ${matchingBrands.length}. Use --brand-id instead.`)
  }
}

const minimumMonth = minimumCompleteCalendarMonthValue()
const targets = selectCalendarRecoveryTargets({
  brands: brands.map((brand: { id: string; name: string; knowledge: { brandPlan: unknown; marketingSolution: unknown; publishingFreq: unknown } | null }) => ({
    brandId: brand.id,
    brandName: brand.name,
    publishingFreq: brand.knowledge?.publishingFreq,
    marketingSolution: workspaceFromKnowledge(brand.knowledge),
  })),
  minimumMonth,
  brandId,
  brandName,
  month,
})

const issueTotals = targets.reduce((total, target) => total + target.inspection.issues.length, 0)
console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  minimumMonth,
  filters: { brandId: brandId || null, brandName: brandName || null, month: month || null },
  brands: new Set(targets.map((target) => target.brandId)).size,
  months: targets.length,
  items: targets.reduce((total, target) => total + target.items.length, 0),
  inspirationIdentityIssues: issueTotals,
  checkpointPath: checkpointPath || null,
}, null, 2))

for (const target of targets) {
  console.log(JSON.stringify({
    target: target.key,
    brandName: target.brandName,
    month: target.month,
    itemCount: target.items.length,
    inspirationIdentityIssues: target.inspection.issues.length,
    issueCodes: [...new Set(target.inspection.issues.map((issue) => issue.code))],
  }))
}

const checkpoint = await loadCheckpoint()
const completedKeys = Object.entries(checkpoint.entries)
  .filter(([, entry]) => entry.status === 'completed')
  .map(([key]) => key)

try {
  const result = await executeCalendarRecoveryTargets({
    targets,
    apply,
    completedKeys,
    maxAttempts,
    operations: {
      async prepare(initialTarget) {
        const target = await loadCurrentTarget(initialTarget)
        const backup = await saveRecoveryBackup(target)
        console.log(JSON.stringify({ target: target.key, stage: 'backup_saved', backup }))
        return { target, backup }
      },
      async generate(target, attempt) {
        console.log(JSON.stringify({ target: target.key, stage: 'regenerating', attempt }))
        const result = await runBrandPlanAction({
          brandId: target.brandId,
          action: 'generate_publishing_calendar',
          body: {
            month: target.month,
            ...(target.publishingFreq ? { publishingFreqOverride: target.publishingFreq } : {}),
          },
        })
        return result.marketingSolution?.publishingCalendar?.months?.[target.month] || []
      },
      verify: verifyPersistedMonth,
      async checkpoint(entry) {
        checkpoint.entries[entry.target.key] = entry
        await saveCheckpoint(checkpoint)
        console.log(JSON.stringify({
          target: entry.target.key,
          stage: entry.status,
          attempts: entry.attempts,
          error: entry.error || null,
        }))
      },
    },
  })
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', summary: result }, null, 2))
} finally {
  await prisma.$disconnect()
}
