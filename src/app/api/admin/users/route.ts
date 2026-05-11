import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getSession } from '@/lib/auth'
import { generateInvitationLink } from '@/lib/invitation'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        nickname: true,
        type: true,
        role: true,
        insights: true,
        driveFolder: true,
        chatLink: true,
        createdAt: true,
        permittedAgents: {
          include: { agent: { select: { id: true, email: true, nickname: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(users)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { email, type } = await request.json()
  const bootstrapAdminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: 'User already exists' }, { status: 400 })

    const temporaryPassword = crypto.randomBytes(18).toString('base64url')
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12)
    const userType = type === 'AI_AGENT' ? 'AI_AGENT' : 'HUMAN'

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        type: userType,
        role: email === bootstrapAdminEmail ? 'ADMIN' : 'USER',
      }
    })

    // 生成邀请链接
    const baseUrl = process.env.NEXT_PUBLIC_KANBAN_HOST || 'http://localhost:3000'
    const { link: invitationLink } = generateInvitationLink(
      email,
      temporaryPassword,
      email.split('@')[0],
      baseUrl
    )

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, type: user.type },
      temporaryPassword,
      invitationLink
    })
  } catch (error) {
    console.error('Admin create user error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
