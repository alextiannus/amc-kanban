import 'dotenv/config'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

dotenv.config({ path: '.env.local' })
dotenv.config()

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

const brandOwners: Array<{ email: string; brands: string[] }> = [
  { email: 'songxiangzhang123@gmail.com', brands: ['天合酒业 TianHe Winery'] },
  { email: 'bainengsg9@gmail.com', brands: ['百能白钢装修'] },
  { email: '345278905jinjin@gmail.com', brands: ['普拉提 Pilates'] },
  { email: 'lisa198218@gmail.com', brands: ['黑丫丫活海鲜私房菜'] },
  { email: 'sgkeevan@gmail.com', brands: [] },
  { email: 'tianye@deliverychinatown.com', brands: ['AMC Immedi AI', '成都滋味烤鱼', '12Eat 唐人街外卖'] },
]

const principalEmails = [
  'alextiannus@gmail.com',
  'lluuwww77@gmail.com',
  'liwei@deliverychinatown.com',
  'zhangyi@12eat.ai',
  'aliciachen@deliverychinatown.com',
  'iamgaoshanwudi@gmail.com',
]

const systemAdminEmails = ['alextiannus@gmail.com']

type UserRef = { id: string; email: string; type: string; role: string }
type BrandRef = { id: string; name: string; ownerId: string | null }

function normalizedEmail(email: string) {
  return email.trim().toLowerCase()
}

async function findHuman(email: string): Promise<UserRef | null> {
  return prisma.user.findFirst({
    where: { email: normalizedEmail(email), type: 'HUMAN' },
    select: { id: true, email: true, type: true, role: true },
  })
}

async function findBrand(name: string): Promise<BrandRef | null> {
  const exact = await prisma.brand.findFirst({
    where: { name },
    select: { id: true, name: true, ownerId: true },
  })
  if (exact) return exact
  return prisma.brand.findFirst({
    where: { name: { contains: name } },
    select: { id: true, name: true, ownerId: true },
  })
}

async function ensureBusinessRole(userId: string, role: 'BRAND_OWNER' | 'AMC_PRINCIPAL') {
  if (!apply) return
  await prisma.userBusinessRole.upsert({
    where: { userId_role: { userId, role } },
    create: { userId, role },
    update: {},
  })
}

async function ensureBrandOwner(user: UserRef, brand: BrandRef) {
  if (!apply) return
  await prisma.$transaction([
    prisma.userBusinessRole.upsert({
      where: { userId_role: { userId: user.id, role: 'BRAND_OWNER' } },
      create: { userId: user.id, role: 'BRAND_OWNER' },
      update: {},
    }),
    prisma.brandOwner.upsert({
      where: { brandId_userId: { brandId: brand.id, userId: user.id } },
      create: { brandId: brand.id, userId: user.id, role: 'owner' },
      update: { role: 'owner' },
    }),
    prisma.brand.update({
      where: { id: brand.id },
      data: { ownerId: user.id },
    }),
  ])
}

async function main() {
  console.log(`[sync-user-role-roster] mode=${apply ? 'apply' : 'dry-run'}`)

  for (const email of systemAdminEmails) {
    const user = await findHuman(email)
    if (!user) {
      console.warn(`[missing user] system admin ${email}`)
      continue
    }
    console.log(`[system admin] ${user.email}: ${user.role} -> ADMIN`)
    if (apply && user.role !== 'ADMIN') {
      await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
    }
  }

  for (const entry of brandOwners) {
    const user = await findHuman(entry.email)
    if (!user) {
      console.warn(`[missing user] brand owner ${entry.email}`)
      continue
    }
    console.log(`[brand owner] ${user.email}${entry.brands.length ? ` brands=${entry.brands.join(', ')}` : ' brands=(none yet)'}`)
    await ensureBusinessRole(user.id, 'BRAND_OWNER')

    for (const brandName of entry.brands) {
      const brand = await findBrand(brandName)
      if (!brand) {
        console.warn(`[missing brand] ${brandName} for ${user.email}`)
        continue
      }
      console.log(`  [brand link] ${brand.name}: ownerId ${brand.ownerId || '(none)'} -> ${user.id}`)
      await ensureBrandOwner(user, brand)
    }
  }

  for (const email of principalEmails) {
    const user = await findHuman(email)
    if (!user) {
      console.warn(`[missing user] AMC Principal ${email}`)
      continue
    }
    console.log(`[amc principal] ${user.email}`)
    await ensureBusinessRole(user.id, 'AMC_PRINCIPAL')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
