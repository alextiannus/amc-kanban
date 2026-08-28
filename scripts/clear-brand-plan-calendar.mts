#!/usr/bin/env node

import type { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma.ts'
import { runBrandPlanAction } from '../src/lib/brand-plan/service.ts'

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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const brandId = option('--brand-id')
const month = option('--month')

if (!brandId) throw new Error('--brand-id is required.')
if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error('--month=YYYY-MM is required.')

try {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      knowledge: { select: { brandPlan: true, marketingSolution: true } },
    },
  })
  if (!brand) throw new Error(`brand_not_found:${brandId}`)

  const workspace = {
    ...objectValue(brand.knowledge?.brandPlan),
    ...objectValue(brand.knowledge?.marketingSolution),
  }
  const calendar = objectValue(workspace.publishingCalendar)
  const months = objectValue(calendar.months)
  const items = months[month]
  const itemCount = Array.isArray(items) ? items.length : 0

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    brandId: brand.id,
    brandName: brand.name,
    month,
    itemCount,
    preserves: ['researchReport', 'annualPlan', 'quarterlyPlans', 'publishingFreq', 'otherCalendarMonths'],
  }, null, 2))

  if (!apply) process.exitCode = 0
  else {
    const backup = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const previous = await transaction.brandMarketingSolution.findFirst({
        where: { brandId, kind: 'CALENDAR', period: month },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      return transaction.brandMarketingSolution.create({
        data: {
          brandId,
          kind: 'CALENDAR',
          period: month,
          version: (previous?.version || 0) + 1,
          input: {
            operation: 'brand-plan-calendar-clear-v1',
            snapshotType: 'BEFORE_CLEAR',
            capturedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          output: { month, items: Array.isArray(items) ? items : [] } as Prisma.InputJsonValue,
          generationMode: 'MANUAL_EDIT',
        },
        select: { id: true, version: true, generatedAt: true },
      })
    })

    await runBrandPlanAction({
      brandId,
      action: 'save_workspace_patch',
      body: { target: 'calendar_month', month, value: [] },
    })

    const persisted = await prisma.brandKnowledge.findUnique({
      where: { brandId },
      select: { marketingSolution: true },
    })
    const persistedCalendar = objectValue(objectValue(persisted?.marketingSolution).publishingCalendar)
    const persistedItems = objectValue(persistedCalendar.months)[month]
    if (!Array.isArray(persistedItems) || persistedItems.length !== 0) {
      throw new Error(`calendar_clear_readback_failed:${brandId}:${month}`)
    }

    console.log(JSON.stringify({
      status: 'completed',
      brandId,
      month,
      removedItems: itemCount,
      backup,
    }, null, 2))
  }
} finally {
  await prisma.$disconnect()
}
