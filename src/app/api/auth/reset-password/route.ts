import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth-v2'

export const dynamic = 'force-dynamic'

// GET /api/auth/reset-password?token=xxx — validate a token
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')?.trim() || ''

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true, nickname: true } } },
  })

  if (!record) {
    return NextResponse.json({ error: 'Invalid or expired reset link. Please request a new one.' }, { status: 404 })
  }
  if (record.usedAt) {
    return NextResponse.json({ error: 'This reset link has already been used. Please request a new one.' }, { status: 410 })
  }
  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This reset link has expired. Please request a new one.' }, { status: 410 })
  }

  return NextResponse.json({
    ok: true,
    email: record.user.email,
    nickname: record.user.nickname ?? record.user.email.split('@')[0],
  })
}

// POST /api/auth/reset-password — consume token and set new password
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!token) return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true } } },
    })

    if (!record) {
      return NextResponse.json({ error: 'Invalid or expired reset link.' }, { status: 404 })
    }
    if (record.usedAt) {
      return NextResponse.json({ error: 'This reset link has already been used.' }, { status: 410 })
    }
    if (record.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This reset link has expired. Please request a new one.' }, { status: 410 })
    }

    const hashedPassword = await hashPassword(password)

    // Atomically: update password + mark token used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { password: hashedPassword, authVersion: { increment: 1 } },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[reset-password] error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
