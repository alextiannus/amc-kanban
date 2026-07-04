import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendResetPasswordLinkEmail } from '@/lib/email'

const SELF_SERVICE_TTL_MS = 15 * 60 * 1000 // 15 minutes

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Always return 200 to prevent account enumeration attacks
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, nickname: true },
    })

    if (!user) {
      return NextResponse.json({ ok: true })
    }

    // Revoke existing pending tokens
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })

    // Create new token
    const rawToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SELF_SERVICE_TTL_MS)
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: rawToken, expiresAt },
    })

    const requestUrl = new URL(request.url)
    const baseUrl =
      process.env.NEXT_PUBLIC_KANBAN_HOST ||
      (requestUrl.hostname !== 'localhost' ? requestUrl.origin : 'https://amc-kanban.immedi.ai')

    const resetLink = `${baseUrl}/reset-password/${rawToken}`

    sendResetPasswordLinkEmail({
      to: user.email,
      nickname: user.nickname ?? user.email.split('@')[0],
      resetLink,
      expiresInMinutes: 15,
      adminTriggered: false,
    }).catch((err) => console.error('[forgot-password] email send failed:', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[forgot-password] error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
