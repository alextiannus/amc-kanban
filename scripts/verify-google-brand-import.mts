import { prisma } from '../src/lib/prisma.ts'
import { queueGoogleBrandImport, runGoogleBrandImport } from '../src/lib/googleBrandImport.ts'
const index = process.argv.indexOf('--brand')
const brandId = index >= 0 ? process.argv[index + 1] : ''
if (!brandId) throw new Error('--brand is required; never select a brand by fuzzy name')
try {
  if (process.argv.includes('--apply')) {
    await queueGoogleBrandImport(brandId, true)
    await runGoogleBrandImport(brandId)
  }
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { name: true, address: true, googleLocationName: true, googleBusinessUrl: true, googleBrandImport: { select: { status: true, lastError: true, result: true } }, knowledge: { select: { menuItems: true } }, growthSyncState: true } })
  console.log(JSON.stringify({ brandId, name: brand.name, address: brand.address, googleLocationName: brand.googleLocationName, hasGoogleBusinessUrl: !!brand.googleBusinessUrl, import: brand.googleBrandImport, skuNames: Array.isArray(brand.knowledge?.menuItems) ? brand.knowledge.menuItems.map((x: any) => x.name) : [] }))
} finally { await prisma.$disconnect() }
