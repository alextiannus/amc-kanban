import { PrismaClient } from '@prisma/client'
import { sendBrandOnboardingWelcomeEmail } from '../src/lib/email'

const prisma = new PrismaClient()

async function main() {
  const email = 'alextiannus@gmail.com'
  const brandName = '测试店铺'
  const planName = '自媒体基础运营'

  console.log(`Searching for owner user: ${email}`)
  const owner = await prisma.user.findUnique({
    where: { email }
  })
  if (!owner) {
    console.error(`User not found: ${email}`)
    process.exit(1)
  }

  console.log(`Sending welcome onboarding email to: ${email} for brand: ${brandName}`)
  const mmHost = process.env.NEXT_PUBLIC_MM_HOST || 'https://amc-mm.immedi.ai'
  const result = await sendBrandOnboardingWelcomeEmail({
    to: email,
    nickname: email.split('@')[0],
    brandName,
    temporaryPassword: '(您之前已设置过密码，请使用已有密码登录)',
    mmInviteLink: mmHost,
    planName,
  })

  console.log('Email sent successfully:', result)
}

main()
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
