import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getSession } from '@/lib/auth'
import { generateInvitationLink } from '@/lib/invitation'

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

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
        introduction: true,
        workflow: true,
        themeColor: true,
        driveFolder: true,
        chatLink: true,
        createdAt: true,
        permittedAgents: {
          include: { agent: { select: { id: true, email: true, nickname: true } } }
        },
        assignedToHumans: {
          include: { human: { select: { id: true, email: true, nickname: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { email, type, role: body_role } = await request.json()
    const body = { role: body_role }
  const bootstrapAdminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: 'User already exists' }, { status: 400 })

    const temporaryPassword = crypto.randomBytes(18).toString('base64url')
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12)
    const userType = type === 'AI_AGENT' ? 'AI_AGENT' : 'HUMAN'

    const requestedRole = body.role === 'ADMIN' ? 'ADMIN' : 'USER'
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        type: userType,
        role: email === bootstrapAdminEmail ? 'ADMIN' : requestedRole,
      }
    })

    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
    await prisma.invitation.updateMany({
      where: {
        status: 'PENDING',
        OR: [{ inviteeEmail: email }, { inviteeUserId: user.id }],
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    })
    const invitation = await prisma.invitation.create({
      data: {
        inviterId: session.user.id,
        inviteeEmail: email,
        inviteeUserId: user.id,
        status: 'PENDING',
        expiresAt,
      },
    })

    // 生成邀请链接，优先使用环境变量，其次取实际请求 origin
    const requestUrl = new URL(request.url)
    const baseUrl = process.env.NEXT_PUBLIC_KANBAN_HOST
      || (requestUrl.hostname !== 'localhost' ? requestUrl.origin : 'https://amc-kanban.immedi.ai')
    const { link: invitationLink } = generateInvitationLink(
      email,
      temporaryPassword,
      email.split('@')[0],
      baseUrl,
      {
        invitationId: invitation.id,
        expiresAt: expiresAt.getTime(),
      }
    )

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorType: 'HUMAN',
        actorName: session.user.email || null,
        action: 'INVITATION_CREATED',
        resourceId: invitation.id,
        resourceType: 'Invitation',
        newValue: {
          inviteeEmail: invitation.inviteeEmail,
          inviteeUserId: invitation.inviteeUserId,
          expiresAt: invitation.expiresAt,
          status: invitation.status,
        },
      },
    })

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
