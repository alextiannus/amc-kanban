import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject, canWriteBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

function maskPw(pw: string | null) {
  return pw ? `••••••${pw.slice(-2)}` : null
}

export async function GET(_request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const accounts = await prisma.socialAccount.findMany({
    where: {
      brandId,
      NOT: { handle: 'unconfigured' }
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      platformId: true,
      handle: true,
      displayName: true,
      autoPilot: true,
      profileUrl: true,
    },
  })

  return NextResponse.json({ accounts })
}

// POST /api/brands/[id]/accounts — connect a new social account
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params
  if (!(await canWriteBrandProject(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const brand = await prisma.brand.findFirst({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const { platformId, handle, displayName, profileUrl, loginUsername, loginPassword } = body

  if (!platformId || !handle) {
    return NextResponse.json({ error: 'platformId and handle required' }, { status: 400 })
  }

  const account = await prisma.socialAccount.create({
    data: {
      brandId,
      platformId,
      handle: handle.trim(),
      displayName: displayName?.trim() || null,
      profileUrl: profileUrl?.trim() || null,
      loginUsername: loginUsername?.trim() || null,
      loginPassword: loginPassword || null,
    },
  })

  const isAdmin = session.user.role === 'ADMIN'
  return NextResponse.json({
    ...account,
    loginPassword: isAdmin ? account.loginPassword : maskPw(account.loginPassword),
  }, { status: 201 })
}
