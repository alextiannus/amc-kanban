import { NextResponse } from 'next/server'
import { sendBrandOnboardingWelcomeEmail } from '@/lib/email'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (body?.secretKey !== 'amc-resend-secret-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const email = body.email || 'alextiannus@gmail.com'
  const brandName = body.brandName || '测试店铺'
  const planName = body.planName || '自媒体基础运营'

  const owner = await prisma.user.findUnique({
    where: { email }
  })
  if (!owner) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const mmHost = process.env.NEXT_PUBLIC_MM_HOST || 'https://amc-mm.immedi.ai'
  const result = await sendBrandOnboardingWelcomeEmail({
    to: email,
    nickname: email.split('@')[0],
    brandName,
    temporaryPassword: '(您之前已设置过密码，请使用已有密码登录)',
    mmInviteLink: mmHost,
    planName,
  })

  return NextResponse.json({ success: true, result })
}
