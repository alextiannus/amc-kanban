import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { encrypt } from '@/lib/auth'
import { cookies } from 'next/headers'

const MIN_PASSWORD_LENGTH = 8
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+()\-\s\d]{6,24}$/

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { email, password, nickname, country, phone } = body as Record<string, unknown>

    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      )
    }
    if (typeof nickname !== 'string' || !nickname.trim()) {
      return NextResponse.json({ error: 'Nickname is required' }, { status: 400 })
    }
    if (typeof country !== 'string' || !country.trim()) {
      return NextResponse.json({ error: 'Country is required' }, { status: 400 })
    }
    if (typeof phone !== 'string' || !PHONE_RE.test(phone.trim())) {
      return NextResponse.json({ error: 'Valid contact phone is required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedNickname = nickname.trim()
    const normalizedCountry = country.trim()
    const normalizedPhone = phone.trim()

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        role: 'USER',
        type: 'HUMAN',
        nickname: normalizedNickname,
        country: normalizedCountry,
        phone: normalizedPhone,
      },
    })

    // Auto-login: set session cookie so user lands on /board directly
    const sessionData = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        type: user.type ?? 'HUMAN',
      },
    }
    const encryptedSession = await encrypt(sessionData)
    const cookieStore = await cookies()
    cookieStore.set('session', encryptedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          country: user.country,
          phone: user.phone,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Register error', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
