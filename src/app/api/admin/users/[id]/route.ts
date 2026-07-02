import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { generateInvitationLink } from '@/lib/invitation'
import { sendPasswordResetEmail } from '@/lib/email'
import type { Prisma } from '@prisma/client'

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

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

  if (target.type === 'HUMAN' && ('email' in body || 'nickname' in body || Array.isArray(body.businessRoles))) {
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

    const validBusinessRoles = ['BRAND_OWNER', 'AMC_PRINCIPAL'] as const
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

    if (target.type === 'AI_AGENT' && body.role === 'ADMIN') {
      return NextResponse.json({ error: 'AI Agent cannot be ADMIN' }, { status: 400 })
    }

    if (target.role === 'ADMIN' && body.role === 'USER') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last admin' }, { status: 400 })
      }
    }

    const updated = await prisma.user.update({ where: { id }, data: { role: body.role } })
    return NextResponse.json({ ok: true, role: updated.role })
  }

  // password reset
  if (body.resetPassword) {
    const temporaryPassword = crypto.randomBytes(18).toString('base64url')
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12)
    await prisma.user.update({ where: { id }, data: { password: hashedPassword } })

    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
    await prisma.invitation.updateMany({
      where: {
        status: 'PENDING',
        OR: [{ inviteeEmail: target.email }, { inviteeUserId: target.id }],
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    })
    const invitation = await prisma.invitation.create({
      data: {
        inviterId: session.user.id,
        inviteeEmail: target.email,
        inviteeUserId: target.id,
        status: 'PENDING',
        expiresAt,
      },
    })

    const requestUrl = new URL(request.url)
    const baseUrl =
      process.env.NEXT_PUBLIC_KANBAN_HOST ||
      (requestUrl.hostname !== 'localhost' ? requestUrl.origin : 'https://amc-kanban.immedi.ai')
    const { link: invitationLink } = generateInvitationLink(
      target.email,
      temporaryPassword,
      (target.nickname ?? target.email.split('@')[0]),
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
          reason: 'password_reset',
        },
      },
    })

    // Attempt to send password reset email (non-blocking)
    let emailSent = false
    let emailError: string | undefined
    try {
      const emailResult = await sendPasswordResetEmail({
        to: target.email,
        nickname: target.nickname ?? target.email.split('@')[0],
        temporaryPassword,
        invitationLink,
        adminEmail: session.user.email ?? undefined,
      })
      emailSent = emailResult.success
      if (!emailResult.success) emailError = emailResult.error
    } catch (e: any) {
      emailError = e?.message ?? 'Email send error'
    }

    return NextResponse.json({ ok: true, temporaryPassword, invitationLink, emailSent, emailError })
  }

  // API Key regeneration
  if (body.regenerateApiKey) {
    const randomToken = `amc_usr_${crypto.randomBytes(16).toString('hex')}`
    const newKey = await prisma.$transaction(async (tx: any) => {
      await tx.userApiKey.deleteMany({ where: { userId: id } })
      return await tx.userApiKey.create({
        data: {
          userId: id,
          token: randomToken,
          name: 'Delegated API Key (Regenerated by Admin)'
        }
      })
    })
    return NextResponse.json({ ok: true, apiKey: newKey.token })
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

  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
