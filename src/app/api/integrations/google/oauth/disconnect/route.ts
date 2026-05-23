import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { brandId } = body

    if (!brandId) {
      return NextResponse.json({ error: 'brandId required' }, { status: 400 })
    }

    // Verify access
    if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Disconnect Google OAuth by clearing fields
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        googleRefreshToken: null,
        googleAccountId: null,
        googleLocationId: null,
        googleLocationName: null,
      },
    })

    return NextResponse.json({ ok: true, disconnected: true })
  } catch (e: any) {
    console.error('[Google Disconnect Error]', e)
    return NextResponse.json({ error: e.message || 'Failed to disconnect Google account' }, { status: 500 })
  }
}
