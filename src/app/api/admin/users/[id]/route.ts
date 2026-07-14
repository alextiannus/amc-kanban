import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import crypto from 'crypto'
import { sendResetPasswordLinkEmail } from '@/lib/email'
import type { Prisma } from '@prisma/client'
import {
  apiKeyPrefix,
  createApiKeyToken,
  hashApiKeyToken,
} from '@/lib/auth-v2'

const ADMIN_RESET_TTL_MS = 24 * 60 * 60 * 1000  // 24 hours for admin-triggered resets

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/users/[id] — update role or reset password
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if ('email' in body || 'nickname' in body || 'role' in body || Array.isArray(body.businessRoles)) {
    const data: Prisma.UserUpdateInput = {}

    if ('email' in body) {
      if (typeof body.email !== 'string' || !body.email.trim()) {
        return NextResponse.json({ error: 'email is required' }, { status: 400 })
      }
      const email = body.email.trim().toLowerCase()
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
      }
      data.email = email
    }

    if ('nickname' in body) {
      if (body.nickname !== null && typeof body.nickname !== 'string') {
        return NextResponse.json({ error: 'nickname must be string or null' }, { status: 400 })
      }
      data.nickname = typeof body.nickname === 'string' && body.nickname.trim() ? body.nickname.trim() : null
    }

    if ('role' in body) {
      if (!['ADMIN', 'USER'].includes(body.role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }

      if (target.role === 'ADMIN' && body.role === 'USER') {
        const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
        if (adminCount <= 1) {
          return NextResponse.json({ error: 'Cannot demote the last admin' }, { status: 400 })
        }
      }
      data.role = body.role
      data.authVersion = { increment: 1 }
    }

    const validBusinessRoles = ['BRAND_OWNER', 'AMC_PRINCIPAL', 'BD'] as const
    type ValidBusinessRole = (typeof validBusinessRoles)[number]
    const nextBusinessRoles = Array.isArray(body.businessRoles)
      ? Array.from(new Set((body.businessRoles as unknown[]).filter((role): role is ValidBusinessRole => typeof role === 'string' && validBusinessRoles.includes(role as ValidBusinessRole))))
      : null

    const updated = await prisma.$transaction(async (tx: any) => {
      const user = Object.keys(data).length
        ? await tx.user.update({
            where: { id },
            data,
            select: { id: true, email: true, nickname: true, role: true, type: true },
          })
        : await tx.user.findUniqueOrThrow({
            where: { id },
            select: { id: true, email: true, nickname: true, role: true, type: true },
          })

      if (nextBusinessRoles) {
        await tx.userBusinessRole.deleteMany({ where: { userId: id, role: { in: [...validBusinessRoles] } } })
        if (nextBusinessRoles.length > 0) {
          await tx.userBusinessRole.createMany({
            data: nextBusinessRoles.map((role) => ({ userId: id, role })),
            skipDuplicates: true,
          })
        }
        await tx.user.update({
          where: { id },
          data: { authVersion: { increment: 1 } },
        })
      }

      if ('role' in body) {
        if (body.role === 'ADMIN') {
          await tx.userBusinessRole.upsert({
            where: { userId_role: { userId: id, role: 'ADMIN' } },
            create: { userId: id, role: 'ADMIN' },
            update: {},
          })
        } else {
          await tx.userBusinessRole.deleteMany({ where: { userId: id, role: 'ADMIN' } })
        }
      }

      return user
    })

    return NextResponse.json({ ok: true, user: updated })
  }

  const agentProfileFields = ['email', 'nickname', 'insights', 'introduction', 'workflow', 'themeColor', 'chatLink', 'driveFolder']
  if (target.type === 'AI_AGENT' && agentProfileFields.some((field) => field in body)) {
    const data: Prisma.UserUpdateInput = {}

    if ('email' in body) {
      if (typeof body.email !== 'string' || !body.email.trim()) {
        return NextResponse.json({ error: 'email is required' }, { status: 400 })
      }
      const email = body.email.trim().toLowerCase()
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
      }
      data.email = email
    }

    for (const field of ['nickname', 'insights', 'introduction', 'workflow', 'themeColor', 'chatLink', 'driveFolder'] as const) {
      if (field in body) {
        const value = body[field]
        if (value !== null && typeof value !== 'string') {
          return NextResponse.json({ error: `${field} must be string or null` }, { status: 400 })
        }
        data[field] = typeof value === 'string' && value.trim() ? value.trim() : null
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        nickname: true,
        insights: true,
        introduction: true,
        workflow: true,
        themeColor: true,
        chatLink: true,
        driveFolder: true,
      },
    })

    return NextResponse.json({ ok: true, user: updated })
  }

  // role change
  if (body.role !== undefined) {
    if (!['ADMIN', 'USER'].includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (target.role === 'ADMIN' && body.role === 'USER') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last admin' }, { status: 400 })
      }
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const next = await tx.user.update({
        where: { id },
        data: { role: body.role, authVersion: { increment: 1 } },
      })
      if (body.role === 'ADMIN') {
        await tx.userBusinessRole.upsert({
          where: { userId_role: { userId: id, role: 'ADMIN' } },
          create: { userId: id, role: 'ADMIN' },
          update: {},
        })
      } else {
        await tx.userBusinessRole.deleteMany({ where: { userId: id, role: 'ADMIN' } })
      }
      return next
    })
    return NextResponse.json({ ok: true, role: updated.role })
  }

  // Password reset — issue a secure token link instead of a plaintext temp password
  if (body.resetPassword) {
    // Revoke existing pending tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: id, usedAt: null },
      data: { usedAt: new Date() },
    })

    // Create a 24-hour token (admin resets give users more time than self-service 15 min)
    const rawToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + ADMIN_RESET_TTL_MS)
    await prisma.passwordResetToken.create({
      data: { userId: id, token: rawToken, expiresAt },
    })

    const userRoles = await prisma.userBusinessRole.findMany({ where: { userId: id } })
    const isBrandOwner = userRoles.some((r: any) => r.role === 'BRAND_OWNER')

    const requestUrl = new URL(request.url)
    let baseUrl = ''
    if (isBrandOwner) {
      if (process.env.NODE_ENV === 'development') {
        baseUrl = 'http://localhost:3001'
      } else {
        baseUrl = 'https://amc-mm.immedi.ai'
      }
    } else {
      baseUrl =
        process.env.NEXT_PUBLIC_KANBAN_HOST ||
        (process.env.NODE_ENV === 'development'
          ? requestUrl.origin
          : (requestUrl.hostname !== 'localhost' ? requestUrl.origin : 'https://amc-kanban.immedi.ai'))
    }
    const resetLink = `${baseUrl}/reset-password/${rawToken}`

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorType: 'HUMAN',
        actorName: session.user.email || null,
        action: 'PASSWORD_RESET_LINK_SENT',
        resourceId: id,
        resourceType: 'User',
        newValue: {
          userId: id,
          email: target.email,
          expiresAt: expiresAt.toISOString(),
          triggeredBy: session.user.email,
        },
      },
    })

    // Send reset link email (non-blocking)
    let emailSent = false
    let emailError: string | undefined
    try {
      const emailResult = await sendResetPasswordLinkEmail({
        to: target.email,
        nickname: target.nickname ?? target.email.split('@')[0],
        resetLink,
        expiresInMinutes: 1440,  // 24 hours
        adminTriggered: true,
      })
      emailSent = emailResult.success
      if (!emailResult.success) emailError = emailResult.error
    } catch (e: any) {
      emailError = e?.message ?? 'Email send error'
    }

    return NextResponse.json({ ok: true, resetLink, emailSent, emailError })
  }

  // API Key regeneration
  if (body.createApiKey) {
    if (target.type !== 'HUMAN') {
      return NextResponse.json({ error: 'API Key must be created under a human user' }, { status: 400 })
    }
    const keyName = typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : `AI Staff Key ${new Date().toISOString().slice(0, 10)}`
    const randomToken = createApiKeyToken('amc_user')
    const created = await prisma.userApiKey.create({
      data: {
        userId: id,
        token: randomToken,
        tokenHash: hashApiKeyToken(randomToken),
        prefix: apiKeyPrefix(randomToken),
        name: keyName,
      },
      select: {
        id: true,
        name: true,
        token: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorType: 'HUMAN',
        actorName: session.user.email || null,
        action: 'USER_API_KEY_CREATED',
        resourceId: created.id,
        resourceType: 'UserApiKey',
        newValue: {
          userId: id,
          email: target.email,
          keyId: created.id,
          keyName,
          prefix: created.prefix,
        },
      },
    })

    return NextResponse.json({ ok: true, apiKey: randomToken, key: created })
  }

  if (body.revokeApiKeyId) {
    if (typeof body.revokeApiKeyId !== 'string') {
      return NextResponse.json({ error: 'revokeApiKeyId must be a string' }, { status: 400 })
    }
    const key = await prisma.userApiKey.findFirst({
      where: { id: body.revokeApiKeyId, userId: id },
      select: { id: true, revokedAt: true, name: true, prefix: true },
    })
    if (!key) return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    if (key.revokedAt) return NextResponse.json({ ok: true, key })

    const revoked = await prisma.userApiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorType: 'HUMAN',
        actorName: session.user.email || null,
        action: 'USER_API_KEY_REVOKED',
        resourceId: key.id,
        resourceType: 'UserApiKey',
        oldValue: {
          userId: id,
          email: target.email,
          keyId: key.id,
          keyName: key.name,
          prefix: key.prefix,
        },
      },
    })

    return NextResponse.json({ ok: true, key: revoked })
  }

  if (body.regenerateApiKey) {
    if (target.type !== 'HUMAN') {
      return NextResponse.json({ error: 'API Key must be regenerated under a human user' }, { status: 400 })
    }
    const randomToken = createApiKeyToken('amc_user')
    await prisma.$transaction(async (tx: any) => {
      await tx.userApiKey.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      await tx.userApiKey.create({
        data: {
          userId: id,
          token: randomToken,
          tokenHash: hashApiKeyToken(randomToken),
          prefix: apiKeyPrefix(randomToken),
          name: 'API Key regenerated by Admin',
        },
      })
    })
    return NextResponse.json({ ok: true, apiKey: randomToken })
  }

  return NextResponse.json({ error: 'No valid operation' }, { status: 400 })
}

// DELETE /api/admin/users/[id] — remove a user
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  // Prevent self-deletion
  if (session.user.id === id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (target.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last admin' }, { status: 400 })
    }
  }

  try {
    // Cascade-delete all related records first to avoid FK constraint violations.
    // Many relations on User lack onDelete:Cascade in the schema, so we clean up
    // manually. This also handles "empty" accounts that only have invitation records.
    await prisma.$transaction(async (tx: any) => {
      // Auth / API keys
      await tx.userApiKey.deleteMany({ where: { userId: id } })
      // Invitations (both as inviter and invitee)
      await tx.invitation.deleteMany({ where: { OR: [{ inviterId: id }, { inviteeUserId: id }] } })
      // Business roles
      await tx.userBusinessRole.deleteMany({ where: { userId: id } })
      // Agent permissions (humanId/agentId are the FK field names in AgentPermission)
      await tx.agentPermission.deleteMany({ where: { OR: [{ humanId: id }, { agentId: id }] } })
      // Crew memberships
      await tx.crewMember.deleteMany({ where: { userId: id } })
      // Brand memberships (BrandAgent.agentId → User.id)
      await tx.brandAgent.deleteMany({ where: { agentId: id } })
      // Brand ownership
      await tx.brandOwner.deleteMany({ where: { userId: id } })
      // Assignment pool membership
      await tx.assignmentPoolMember.deleteMany({ where: { userId: id } }).catch(() => {/* table may not exist */})
      // OrganizationMember already has onDelete:Cascade but delete anyway for safety
      await tx.organizationMember.deleteMany({
        where: { OR: [{ ownerId: id }, { memberId: id }] },
      }).catch(() => {})
      // Sales leads
      await tx.salesLead.deleteMany({ where: { userId: id } }).catch(() => {})
      // School items owned by this agent
      await tx.schoolItem.deleteMany({ where: { agentId: id } }).catch(() => {})
      // Finally delete the user
      await tx.user.delete({ where: { id } })
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error(`[DELETE /api/admin/users/${id}] Failed:`, err)
    const msg = err?.message?.includes('Foreign key constraint')
      ? '删除失败：该账号仍有关联数据，请先转移或删除相关内容后重试。'
      : `删除失败：${err?.message ?? '未知错误'}`
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
