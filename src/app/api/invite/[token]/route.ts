import { NextResponse } from 'next/server'
import { decryptInvitationToken } from '@/lib/invitation'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function resolveInvitation(token: string) {
  const invitationData = decryptInvitationToken(token)
  if (!invitationData) {
    return { error: 'Invalid invitation link', status: 400 as const }
  }

  const maxAgeMs = 7 * 24 * 60 * 60 * 1000
  if (Date.now() - invitationData.createdAt > maxAgeMs) {
    return { error: 'Invitation link expired', status: 410 as const }
  }

  if (!invitationData.invitationId) {
    // Backwards-compatible support for old links generated before DB tracking.
    return {
      invitation: null,
      invitationData,
    }
  }

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationData.invitationId },
  })
  if (!invitation) {
    return { error: 'Invitation not found', status: 404 as const }
  }

  if (invitation.inviteeEmail.toLowerCase() !== invitationData.email.toLowerCase()) {
    return { error: 'Invitation payload mismatch', status: 400 as const }
  }

  if (invitation.status === 'REVOKED') {
    return { error: 'Invitation link revoked', status: 410 as const }
  }

  if (invitation.status === 'CLAIMED') {
    return {
      invitation,
      invitationData,
      alreadyClaimed: true,
    }
  }

  if (invitation.status === 'EXPIRED' || invitation.expiresAt.getTime() <= Date.now()) {
    if (invitation.status !== 'EXPIRED') {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      })
    }
    return { error: 'Invitation link expired', status: 410 as const }
  }

  return {
    invitation,
    invitationData,
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const resolved = await resolveInvitation(token)
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    return NextResponse.json({
      ok: true,
      invitationData: resolved.invitationData,
      invitationStatus: resolved.invitation?.status || 'UNTRACKED',
      alreadyClaimed: Boolean((resolved as { alreadyClaimed?: boolean }).alreadyClaimed),
    })
  } catch {
    return NextResponse.json({ error: 'Invalid invitation link' }, { status: 400 })
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const resolved = await resolveInvitation(token)
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    if (!resolved.invitation) {
      return NextResponse.json({ ok: true, claimed: false, mode: 'untracked' })
    }

    if (resolved.invitation.status === 'CLAIMED') {
      return NextResponse.json({ ok: true, claimed: true, invitationId: resolved.invitation.id })
    }

    const claimed = await prisma.invitation.update({
      where: { id: resolved.invitation.id },
      data: {
        status: 'CLAIMED',
        claimedAt: new Date(),
      },
    })

    await prisma.auditLog.create({
      data: {
        actorId: claimed.inviteeUserId,
        actorType: 'HUMAN',
        actorName: claimed.inviteeEmail,
        action: 'INVITATION_CLAIMED',
        resourceId: claimed.id,
        resourceType: 'Invitation',
        newValue: {
          status: claimed.status,
          claimedAt: claimed.claimedAt,
        },
      },
    })

    return NextResponse.json({ ok: true, claimed: true, invitationId: claimed.id })
  } catch {
    return NextResponse.json({ error: 'Invalid invitation link' }, { status: 400 })
  }
}