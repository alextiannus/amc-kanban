#!/usr/bin/env node

import { prisma } from '../src/lib/prisma.ts'
import { syncBrandDraftStatuses } from '../src/lib/syncDraftStatuses.ts'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const dryRun = args.includes('--dry-run') || !apply
const brandFlag = args.findIndex((value) => value === '--brand' || value === '--brand-id')
const brandId = brandFlag >= 0 ? args[brandFlag + 1] : undefined
const summaryOnly = args.includes('--summary-only')

if (apply && args.includes('--dry-run')) {
  throw new Error('Choose either --dry-run or --apply, not both.')
}
if (brandFlag >= 0 && !brandId) {
  throw new Error('--brand requires a brand ID.')
}

const brands = await prisma.brand.findMany({
  where: {
    ...(brandId ? { id: brandId } : {}),
    postfastApiKey: { not: null },
    contents: {
      some: { status: { in: ['scheduled', 'publishing'] } },
    },
  },
  select: { id: true, name: true, postfastApiKey: true },
  orderBy: { name: 'asc' },
})

const totals = {
  brands: brands.length,
  checked: 0,
  wouldUpdate: 0,
  updated: 0,
  published: 0,
  failed: 0,
  waiting: 0,
  unresolved: 0,
  skipped: 0,
  providerErrors: 0,
}

console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', brandId: brandId ?? null, brands: brands.length }))

for (const brand of brands) {
  if (!brand.postfastApiKey) continue
  const result = await syncBrandDraftStatuses(brand.id, brand.postfastApiKey, { apply, quiet: summaryOnly })
  totals.checked += result.checked
  totals.wouldUpdate += result.wouldUpdate
  totals.updated += result.updated
  totals.published += result.published
  totals.failed += result.failed
  totals.waiting += result.waiting
  totals.unresolved += result.unresolved
  totals.skipped += result.skipped
  totals.providerErrors += result.providerErrors

  console.log(JSON.stringify(summaryOnly ? {
    brandId: brand.id,
    brandName: brand.name,
    checked: result.checked,
    wouldUpdate: result.wouldUpdate,
    updated: result.updated,
    published: result.published,
    failed: result.failed,
    waiting: result.waiting,
    unresolved: result.unresolved,
    skipped: result.skipped,
    providerErrors: result.providerErrors,
    errors: result.errors,
  } : {
    brandId: brand.id,
    brandName: brand.name,
    ...result,
  }))
}

console.log(JSON.stringify({ summary: totals, mode: dryRun ? 'dry-run' : 'apply' }))
await prisma.$disconnect()

if (totals.providerErrors > 0) process.exitCode = 2
