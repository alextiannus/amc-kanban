import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { canWriteBrandProject } from '@/lib/brandAccess'

export async function POST(request: Request) {
  // 1. Authenticate user session
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse request body
  let body: { brandId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { brandId } = body
  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  }

  // 3. Verify user has write access to the brand
  if (!(await canWriteBrandProject(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // 4. Delete all Facebook and Instagram SocialAccounts linked to the brand
    const deleteResult = await prisma.socialAccount.deleteMany({
      where: {
        brandId,
        platformId: {
          in: ['facebook', 'instagram'],
        },
      },
    })

    console.log(`[Meta Disconnect] Disconnected Meta accounts for brand ${brandId}. Removed count: ${deleteResult.count}`)

    return NextResponse.json({ success: true, count: deleteResult.count })
  } catch (e: unknown) {
    console.error('[Meta Disconnect Error]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to disconnect Meta accounts' },
      { status: 500 }
    )
  }
}
