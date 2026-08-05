import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { reclaimPostfastKeyForBrandIfUnused } from '@/lib/postfastKeyPool'

type Params = { params: Promise<{ id: string; aid: string }> }

function maskPw(pw: string | null) {
  return pw ? `••••••${pw.slice(-2)}` : null
}

// PATCH /api/brands/[id]/accounts/[aid] — update an account (human user)
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, aid } = await params
  if (!(await canWriteBrandProject(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const brand = await prisma.brand.findFirst({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const account = await prisma.socialAccount.findFirst({ where: { id: aid, brandId } })
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const body = await request.json()
  const opt = (v: unknown) => (v === undefined ? undefined : v === '' ? null : (v as string))

  const updated = await prisma.socialAccount.update({
    where: { id: aid },
    data: {
      ...(body.handle !== undefined && { handle: body.handle.trim() }),
      ...(body.displayName !== undefined && { displayName: opt(body.displayName) }),
      ...(body.profileUrl !== undefined && { profileUrl: opt(body.profileUrl) }),
      ...(body.loginUsername !== undefined && { loginUsername: opt(body.loginUsername) }),
      ...(body.loginPassword !== undefined && { loginPassword: opt(body.loginPassword) }),
      ...(body.autoPilot !== undefined && { autoPilot: Boolean(body.autoPilot) }),
    },
  })

  const isAdmin = session.user.role === 'ADMIN'
  return NextResponse.json({
    ...updated,
    loginPassword: isAdmin ? updated.loginPassword : maskPw(updated.loginPassword),
  })
}

// DELETE /api/brands/[id]/accounts/[aid] — remove an account
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, aid } = await params

  if (!(await canWriteBrandProject(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const brand = await prisma.brand.findFirst({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Safely delete related action items and drafts first to prevent foreign key errors
  await prisma.$transaction([
    prisma.actionItem.deleteMany({ where: { accountId: aid, brandId } }),
    prisma.contentDraft.deleteMany({ where: { accountId: aid, brandId } }),
    prisma.socialAccount.deleteMany({ where: { id: aid, brandId } }),
  ])

  await reclaimPostfastKeyForBrandIfUnused({ brandId, reason: 'account_deleted' }).catch((error) => {
    console.error('[account-delete] PostFast key reclaim check failed:', error)
  })

  return NextResponse.json({ ok: true })
}
