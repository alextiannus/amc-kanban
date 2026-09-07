import { withBoundAccount, lockAccountBinding, SocialAccountBindingError } from '@/lib/socialAccountBinding'
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

  let updated
  try {
    updated = await withBoundAccount(aid, async (_account, tx) => tx.socialAccount.update({
      where: { id: aid },
      data: {
        ...(body.handle !== undefined && { handle: body.handle.trim() }),
        ...(body.displayName !== undefined && { displayName: opt(body.displayName) }),
        ...(body.profileUrl !== undefined && { profileUrl: opt(body.profileUrl) }),
        ...(body.loginUsername !== undefined && { loginUsername: opt(body.loginUsername) }),
        ...(body.loginPassword !== undefined && { loginPassword: opt(body.loginPassword) }),
        ...(body.autoPilot !== undefined && { autoPilot: Boolean(body.autoPilot) }),
      },
    }))
  } catch (error) {
    if (error instanceof SocialAccountBindingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    throw error
  }

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

  try {
    await prisma.$transaction(async (tx: any) => {
      await lockAccountBinding(tx, aid)
      const existing = await tx.socialAccount.findFirst({ where: { id: aid, brandId } })
      if (existing?.unboundAt) throw new SocialAccountBindingError('已解绑账号保留历史记录，不能删除。')
      // Legacy destructive deletion remains separate from the new unbind action.
      await tx.actionItem.deleteMany({ where: { accountId: aid, brandId } })
      await tx.contentDraft.deleteMany({ where: { accountId: aid, brandId } })
      await tx.socialAccount.deleteMany({ where: { id: aid, brandId } })
    })
  } catch (error) {
    if (error instanceof SocialAccountBindingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    throw error
  }

  await reclaimPostfastKeyForBrandIfUnused({ brandId, reason: 'account_deleted' }).catch((error) => {
    console.error('[account-delete] PostFast key reclaim check failed:', error)
  })

  return NextResponse.json({ ok: true })
}
