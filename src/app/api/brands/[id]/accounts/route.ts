import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

// POST /api/brands/[id]/accounts — connect a new social account
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params

  const brand = await prisma.brand.findFirst({ where: { id: brandId, ownerId: session.user.id } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const { platformId, handle, displayName } = body

  if (!platformId || !handle) {
    return NextResponse.json({ error: 'platformId and handle required' }, { status: 400 })
  }

  const account = await prisma.socialAccount.create({
    data: {
      brandId,
      platformId,
      handle: handle.trim(),
      displayName: displayName?.trim() || null,
    },
  })

  return NextResponse.json(account, { status: 201 })
}
