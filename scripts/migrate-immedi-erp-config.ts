/** Legacy schema bootstrap; credentials come from the deployment environment. */
import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const prisma = new PrismaClient()
async function main() {
  await prisma.$executeRawUnsafe('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpApiKey" TEXT')
  await prisma.$executeRawUnsafe('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpBaseUrl" TEXT')
  await prisma.$executeRawUnsafe('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpEnabled" BOOLEAN DEFAULT false')
  await prisma.$executeRawUnsafe('ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpItemCodeMap" JSONB')
  console.log('Legacy ERP configuration columns verified; credentials were not changed.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => prisma.$disconnect())
