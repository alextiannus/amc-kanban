import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { getSession } from '@/lib/auth'
import { generateInvitationLink } from '@/lib/invitation'
import {
  apiKeyPrefix,
  createApiKeyToken,
  hashApiKeyToken,
  hashPassword,
} from '@/lib/auth-v2'

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
        businessRoles: { select: { role: true } },
        permittedAgents: {
          include: {
            agent: {
              select: {
                id: true,
                email: true,
                nickname: true,
                brandMemberships: {
                  where: { active: true },
                  select: { brand: { select: { id: true, name: true, status: true } } },
                },
              },
            },
          }
        },
        assignedToHumans: {
          include: { human: { select: { id: true, email: true, nickname: true } } }
        },
        brandMemberships: {
          where: { active: true },
          select: { brand: { select: { id: true, name: true, status: true } } },
        },
        ownedBrands: {
          select: { brand: { select: { id: true, name: true, status: true } } },
        },
        apiKeys: {
          select: {
            id: true,
            name: true,
            prefix: true,
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
            revokedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const humanIds = users.filter((user: any) => user.type === 'HUMAN').map((user: any) => user.id)
    const legacyOwnedBrands = humanIds.length
      ? await prisma.brand.findMany({
          where: { ownerId: { in: humanIds } },
          select: { id: true, name: true, status: true, ownerId: true },
        })
      : []
    const legacyBrandsByOwner = new Map<string, Array<{ brand: { id: string; name: string; status: string } }>>()
    for (const brand of legacyOwnedBrands) {
      if (!brand.ownerId) continue
      const existing = legacyBrandsByOwner.get(brand.ownerId) || []
      existing.push({ brand: { id: brand.id, name: brand.name, status: brand.status } })
      legacyBrandsByOwner.set(brand.ownerId, existing)
    }

    return NextResponse.json(users.map((user: any) => ({
      ...user,
      legacyOwnedBrands: legacyBrandsByOwner.get(user.id) || [],
    })))
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
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!normalizedEmail) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) return NextResponse.json({ error: 'User already exists' }, { status: 400 })

    const temporaryPassword = crypto.randomBytes(18).toString('base64url')
    const hashedPassword = await hashPassword(temporaryPassword)
    const userType = type === 'AI_AGENT' ? 'AI_AGENT' : 'HUMAN'

    const requestedRole = userType === 'HUMAN' && body.role === 'ADMIN' ? 'ADMIN' : 'USER'
    
    const result = await prisma.$transaction(async (tx: any) => {
      const u = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          type: userType,
          role: requestedRole,
        }
      })

      const keyToken = createApiKeyToken(userType === 'AI_AGENT' ? 'amc_agent' : 'amc_user')
      await tx.userApiKey.create({
        data: {
          userId: u.id,
          tokenHash: hashApiKeyToken(keyToken),
          prefix: apiKeyPrefix(keyToken),
          name: userType === 'AI_AGENT' ? 'Initial AMC Agent API Key' : 'Initial User API Key',
        },
      })

      if (userType === 'AI_AGENT') {
        await tx.userBusinessRole.create({
          data: { userId: u.id, role: 'AMC_PRINCIPAL' },
        })
      } else if (requestedRole === 'ADMIN') {
        await tx.userBusinessRole.create({
          data: { userId: u.id, role: 'ADMIN' },
        })
      }

      return { user: u, apiKey: keyToken }
    })

    const user = result.user
    const apiKey = result.apiKey

    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
    await prisma.invitation.updateMany({
      where: {
        status: 'PENDING',
        OR: [{ inviteeEmail: normalizedEmail }, { inviteeUserId: user.id }],
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    })
    const invitation = await prisma.invitation.create({
      data: {
        inviterId: session.user.id,
        inviteeEmail: normalizedEmail,
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
      normalizedEmail,
      temporaryPassword,
      normalizedEmail.split('@')[0],
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
      invitationLink,
      apiKey
    })
  } catch (error) {
    console.error('Admin create user error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
