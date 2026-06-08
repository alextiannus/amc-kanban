import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'

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
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const legacyOwnerCount = await prisma.brand.count({ where: { ownerId: user.id } })
    const ownerTotal = user.ownedBrands.length + legacyOwnerCount
    const userRoles = [
      ...(user.type === 'AI_AGENT' ? ['AMC_AGENT'] : []),
      ...(user.role === 'ADMIN' && user.type !== 'AI_AGENT' ? ['ADMIN'] : []),
      ...(user.type === 'HUMAN' && ownerTotal > 0 ? ['BRAND_OWNER'] : []),
      ...(user.type === 'HUMAN' && user.permittedAgents.length > 0 ? ['AMC_PRINCIPAL'] : []),
    ]

    if (user.role !== 'ADMIN' && user.type === 'HUMAN' && user.permittedAgents.length === 0) {
      return NextResponse.json({
        ...user,
        dashboardRole: ownerTotal > 0 ? 'BRAND_OWNER' : 'BRAND_DIRECTOR',
        userRoles,
        permittedAgents: []
      })
    }

    return NextResponse.json({
      ...user,
      dashboardRole: user.role === 'ADMIN' ? 'ADMIN' : ownerTotal > 0 ? 'BRAND_OWNER' : 'BRAND_DIRECTOR',
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
        updateData.password = await bcrypt.hash(password, 10)
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
      const body = await request.json() as { password?: unknown; nickname?: unknown }
      const { password, nickname } = body

      if (nickname !== undefined) {
        updateData.nickname = typeof nickname === 'string' ? (nickname.trim() || null) : null
      }

      if (password !== undefined && password !== null && password !== '') {
        if (String(password).trim().length < 4) {
          return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
        }
        updateData.password = await bcrypt.hash(String(password), 10)
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
