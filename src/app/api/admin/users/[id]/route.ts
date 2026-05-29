import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { generateInvitationLink } from '@/lib/invitation'

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

  // role change
  if (body.role !== undefined) {
    if (!['ADMIN', 'USER'].includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    const updated = await prisma.user.update({ where: { id }, data: { role: body.role } })
    return NextResponse.json({ ok: true, role: updated.role })
  }

  // password reset
  if (body.resetPassword) {
    const temporaryPassword = crypto.randomBytes(18).toString('base64url')
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12)
    await prisma.user.update({ where: { id }, data: { password: hashedPassword } })

    const requestUrl = new URL(request.url)
    const baseUrl =
      process.env.NEXT_PUBLIC_KANBAN_HOST ||
      (requestUrl.hostname !== 'localhost' ? requestUrl.origin : 'https://amc-kanban.immedi.ai')
    const { link: invitationLink } = generateInvitationLink(
      target.email,
      temporaryPassword,
      (target.nickname ?? target.email.split('@')[0]),
      baseUrl
    )
    return NextResponse.json({ ok: true, temporaryPassword, invitationLink })
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

  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
