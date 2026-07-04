import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hashPassword } from '@/lib/auth-v2'
import fs from 'fs/promises'
import path from 'path'
import { computeEffectiveUserRoles, getLegacyDashboardRole } from '@/lib/userRoles'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        type: true,
        role: true,
        nickname: true,
        introduction: true,
        avatar: true,
        inviteCode: true,
        organizationMembers: {
          orderBy: { createdAt: 'asc' },
          include: {
            member: {
              select: {
                id: true,
                email: true,
                nickname: true,
                type: true,
                role: true,
              },
            },
          },
        },
        organizationsJoined: {
          orderBy: { createdAt: 'asc' },
          include: {
            owner: {
              select: {
                id: true,
                email: true,
                nickname: true,
              },
            },
          },
        },
        ownedBrands: {
          where: { role: 'owner' },
          orderBy: { createdAt: 'asc' },
          include: {
            brand: {
              select: {
                id: true,
                name: true,
                location: true,
                status: true,
              },
            },
          },
        },
        permittedAgents: {
          include: { 
            agent: { 
              select: { 
                id: true, 
                email: true, 
                nickname: true,
                avatar: true,
                insights: true, 
                driveFolder: true, 
                chatLink: true 
              } 
            } 
          }
        },
        businessRoles: { select: { role: true } },
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.inviteCode) {
      const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase()
      const code = `AMC-${randomStr}`
      await prisma.user.update({
        where: { id: user.id },
        data: { inviteCode: code }
      })
      user.inviteCode = code
    }

    const legacyOwnerCount = await prisma.brand.count({ where: { ownerId: user.id } })
    const ownerTotal = user.ownedBrands.length + legacyOwnerCount
    const userRoles = computeEffectiveUserRoles({
      userType: user.type,
      systemRole: user.role,
      explicitRoles: user.businessRoles.map((role: any) => role.role),
      ownerCount: ownerTotal,
      principalCount: user.permittedAgents.length,
    })
    const dashboardRole = getLegacyDashboardRole(userRoles)

    if (user.role !== 'ADMIN' && user.type === 'HUMAN' && user.permittedAgents.length === 0) {
      return NextResponse.json({
        ...user,
        businessRoles: undefined,
        dashboardRole,
        userRoles,
        permittedAgents: []
      })
    }

    return NextResponse.json({
      ...user,
      businessRoles: undefined,
      dashboardRole,
      userRoles,
    })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type') || ''
    const updateData: Prisma.UserUpdateInput = {}

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const nickname = formData.get('nickname')
      const introduction = formData.get('introduction')
      const password = formData.get('password')
      const avatarFile = formData.get('avatar') as File | null

      if (typeof nickname === 'string') {
        updateData.nickname = nickname.trim() || null
      }

      if (typeof introduction === 'string') {
        updateData.introduction = introduction.trim() || null
      }

      if (typeof password === 'string' && password.length > 0) {
        if (password.trim().length < 4) {
          return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
        }
        updateData.password = await hashPassword(password)
        updateData.authVersion = { increment: 1 }
      }

      if (avatarFile && avatarFile.size > 0) {
        if (!avatarFile.type.startsWith('image/')) {
          return NextResponse.json({ error: 'Avatar must be an image file' }, { status: 400 })
        }

        const bytes = await avatarFile.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const MAX_FILE_SIZE = 5 * 1024 * 1024
        if (buffer.length > MAX_FILE_SIZE) {
          return NextResponse.json({ error: 'File too large. Maximum size is 5MB' }, { status: 413 })
        }

        const uploadDir = path.join(process.cwd(), 'public/uploads')
        try {
          await fs.access(uploadDir)
        } catch {
          await fs.mkdir(uploadDir, { recursive: true })
        }

        const extension = avatarFile.type === 'image/png' ? 'png' : avatarFile.type === 'image/webp' ? 'webp' : 'jpg'
        const fileName = `${session.user.id}-avatar-${Date.now()}.${extension}`
        const filePath = path.join(uploadDir, fileName)
        await fs.writeFile(filePath, buffer)
        updateData.avatar = `/uploads/${fileName}`
      }
    } else {
      const body = await request.json() as { password?: unknown; nickname?: unknown; introduction?: unknown }
      const { password, nickname, introduction } = body

      if (nickname !== undefined) {
        updateData.nickname = typeof nickname === 'string' ? (nickname.trim() || null) : null
      }

      if (introduction !== undefined) {
        updateData.introduction = typeof introduction === 'string' ? (introduction.trim() || null) : null
      }

      if (password !== undefined && password !== null && password !== '') {
        if (String(password).trim().length < 4) {
          return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
        }
        updateData.password = await hashPassword(String(password))
        updateData.authVersion = { increment: 1 }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No data provided to update' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        type: true,
        nickname: true,
        introduction: true,
        avatar: true,
      }
    })

    return NextResponse.json({ success: true, user: updated })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
