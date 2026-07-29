import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const apply = process.argv.includes('--apply')
const limitArg = process.argv.find((value) => value.startsWith('--limit='))
const limit = Math.min(1000, Math.max(1, Number(limitArg?.split('=')[1]) || 100))

if (!process.env.DATABASE_URL) {
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    skipped: true,
    reason: 'DATABASE_URL is not configured',
  }, null, 2))
  process.exitCode = apply ? 1 : 0
} else {
const prisma = new PrismaClient()
const brands = await prisma.brand.findMany({
  where: { growthBrandKey: null },
  select: {
    id: true,
    name: true,
    location: true,
    address: true,
    description: true,
  },
  orderBy: { createdAt: 'asc' },
  take: limit,
})

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  unlinked_count: brands.length,
  brands: brands.map((brand) => ({ id: brand.id, name: brand.name })),
}, null, 2))

if (apply) {
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
  const growthBaseUrl = (process.env.AMC_GROWTH_API_URL || (isProd
    ? 'https://amc-growth.onrender.com'
    : 'http://localhost:4188')).replace(/\/$/, '')
  const token = process.env.AMC_KNOWLEDGE_TOKEN || process.env.AMC_GROWTH_TOKEN || ''
  let linked = 0
  const failures = []
  for (const brand of brands) {
    try {
      const response = await fetch(`${growthBaseUrl}/v1/internal/merchants/upsert`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          source_system: 'amc-kanban',
          external_id: brand.id,
          canonical_name: brand.name,
          market: brand.location || null,
          category: brand.description || null,
          metadata: {
            kanban_brand_id: brand.id,
            address: brand.address || null,
          },
        }),
      })
      const merchant = await response.json().catch(() => null)
      if (!response.ok || !merchant?.brand_key) {
        throw new Error(`growth_merchant_upsert_failed:${response.status}`)
      }
      await prisma.brand.update({
        where: { id: brand.id },
        data: { growthBrandKey: merchant.brand_key },
      })
      linked += 1
      console.log(JSON.stringify({ id: brand.id, growthBrandKey: merchant.brand_key }))
    } catch (error) {
      failures.push({
        id: brand.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  console.log(JSON.stringify({ linked, failed: failures.length, failures }, null, 2))
}

await prisma.$disconnect()
}
