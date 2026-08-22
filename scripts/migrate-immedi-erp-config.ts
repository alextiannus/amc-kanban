/**
 * One-time migration: add Immedi ERP fields to SystemConfig
 * Run: npx tsx scripts/migrate-immedi-erp-config.ts
 */
import { PrismaClient } from '@prisma/client'

const PROD_URL = "postgresql://amc_user:g1fb8GblaOI4feUcObfk0fvuWsESDjRP@dpg-d7v9ec7aqgkc73915tcg-a.oregon-postgres.render.com:5432/amc_cupw"

const prisma = new PrismaClient({
  datasources: { db: { url: PROD_URL } },
})

async function main() {
  console.log('🔌 Connecting to production DB...')

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpApiKey" TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpBaseUrl" TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpEnabled" BOOLEAN DEFAULT false`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpItemCodeMap" JSONB`
  )
  console.log('✅ Migration applied — ERP columns added to SystemConfig')

  // Seed the API key
  await prisma.$executeRawUnsafe(`
    UPDATE "SystemConfig"
    SET "immediErpApiKey"  = 'imx_QJ7U_bCGeDq9cF6548s-qdEccH3mdPiwTEl2_JlU-2E',
        "immediErpBaseUrl" = 'https://today.immedi.ai/external/v1',
        "immediErpEnabled" = true
    WHERE id = 'default'
  `)

  const rows = await prisma.$queryRaw<Array<{
    id: string; immediErpEnabled: boolean; immediErpBaseUrl: string; key_prefix: string
  }>>`
    SELECT id,
           "immediErpEnabled",
           "immediErpBaseUrl",
           LEFT("immediErpApiKey", 14) AS key_prefix
    FROM   "SystemConfig"
    WHERE  id = 'default'
  `
  console.log('📦 Current ERP config:', rows[0])
  console.log('🎉 Done!')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
