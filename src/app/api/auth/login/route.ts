import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import {
  createSessionToken,
  hashPassword,
  sessionCookieName,
  verifyPassword,
} from '@/lib/auth-v2'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const passwordResult = await verifyPassword(String(password ?? ''), user.password)
    if (!passwordResult.valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (passwordResult.needsRehash) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          password: await hashPassword(String(password)),
          authVersion: { increment: 1 },
        },
      })
    }

    await prisma.invitation.updateMany({
      where: {
        inviteeEmail: user.email,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      data: {
        status: 'CLAIMED',
        claimedAt: new Date(),
      },
    })

    const sessionData = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        type: user.type ?? 'HUMAN',  // AI_AGENT or HUMAN — used for brand access control
      }
    }
    const encryptedSession = await createSessionToken({
      userId: user.id,
      type: user.type ?? 'HUMAN',
      authVersion: user.authVersion,
    })
    const cookieStore = await cookies()
    cookieStore.set(sessionCookieName, encryptedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
      priority: 'high',
    })

    return NextResponse.json({ success: true, user: sessionData.user })
  } catch (error) {
    console.error('Login error', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
