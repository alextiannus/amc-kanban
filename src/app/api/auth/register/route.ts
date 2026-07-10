import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { resolveAssignment } from '@/lib/assignmentPool'
import { createSessionToken, hashPassword, sessionCookieName } from '@/lib/auth-v2'

const MIN_PASSWORD_LENGTH = 8
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+()\-\s\d]{6,24}$/

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { email, password, nickname, country, phone, referenceCode, inviteCode } = body as Record<string, unknown>

    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      )
    }
    const normalizedEmail = email.trim().toLowerCase()
    const rawNickname = typeof nickname === 'string' ? nickname.trim() : ''
    const normalizedNickname = rawNickname || normalizedEmail.split('@')[0]
    const normalizedCountry = typeof country === 'string' ? country.trim() : null
    const rawPhone = typeof phone === 'string' ? phone.trim() : ''
    
    if (rawPhone && !PHONE_RE.test(rawPhone)) {
      return NextResponse.json({ error: 'Valid contact phone format is required if provided' }, { status: 400 })
    }
    const normalizedPhone = rawPhone || null

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    let referredById: string | null = null
    const targetCode = (typeof inviteCode === 'string' && inviteCode.trim()) || (typeof referenceCode === 'string' && referenceCode.trim()) || null

    if (targetCode) {
      const referrerUser = await prisma.user.findUnique({
        where: { inviteCode: targetCode },
      })
      if (referrerUser) {
        referredById = referrerUser.id
      } else {
        const campaign = await prisma.campaignPromoCode.findFirst({
          where: { code: targetCode.toUpperCase(), isActive: true },
        })
        if (campaign) {
          referredById = campaign.ownerId
        }
      }
    }

    const hashedPassword = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        role: 'USER',
        type: 'HUMAN',
        nickname: normalizedNickname,
        country: normalizedCountry,
        phone: normalizedPhone,
        referredById,
        businessRoles: { create: { role: 'BRAND_OWNER' } },
      },
    })

    let assignedAgentId: string | null = null
    try {
      const assignment = await resolveAssignment({
        subjectType: 'user_register',
        subjectId: user.id,
        region: normalizedCountry,
        referenceCode: typeof referenceCode === 'string' ? referenceCode : null,
        createdBy: 'system',
      })
      assignedAgentId = assignment.selectedAgentId
    } catch (assignmentError) {
      console.error('[POST /api/auth/register] assignment failed:', assignmentError)
    }

    // Auto-login: set session cookie so user lands on /board directly
    const sessionData = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        type: user.type ?? 'HUMAN',
      },
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

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          country: user.country,
          phone: user.phone,
          assignedAgentId,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Register error', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
