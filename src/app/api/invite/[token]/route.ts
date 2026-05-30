import { NextResponse } from 'next/server'
import { decryptInvitationToken } from '@/lib/invitation'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const invitationData = decryptInvitationToken(token)

    if (!invitationData) {
      return NextResponse.json({ error: 'Invalid invitation link' }, { status: 400 })
    }

    const maxAgeMs = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - invitationData.createdAt > maxAgeMs) {
      return NextResponse.json({ error: 'Invitation link expired' }, { status: 410 })
    }

    return NextResponse.json({ ok: true, invitationData })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid invitation link' }, { status: 400 })
  }
}