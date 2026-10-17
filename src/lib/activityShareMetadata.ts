import { cache } from 'react'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { normalizeActivityPage } from '@/lib/activityPage'
import { activitySharePresentation } from '@/lib/activitySharePresentation'
import { configuredBrandColor } from '@/lib/brandEntryTheme'

export const getActivityShareBrand = cache(async (brandId: string) => {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true, status: true, activityPage: true, knowledge: { select: { marketingSolution: true } } } })
  if (!brand || brand.status === 'ARCHIVED') return null
  return { name: brand.name, page: normalizeActivityPage(brand.activityPage), color: configuredBrandColor(brand.knowledge?.marketingSolution) }
})
export function activityShareImageUrl(brandId: string, brand: NonNullable<Awaited<ReturnType<typeof getActivityShareBrand>>>, locale: 'zh' | 'en') {
  const copy = activitySharePresentation(brand.name, brand.page, locale)
  const version = createHash('sha256').update(JSON.stringify([brand.name, brand.color, copy])).digest('hex').slice(0, 12)
  return `https://amc.immedi.ai/game/${encodeURIComponent(brandId)}/share-image?lang=${locale}&v=${version}`
}
