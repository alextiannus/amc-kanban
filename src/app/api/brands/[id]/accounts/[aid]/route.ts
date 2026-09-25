import { withBoundAccount, lockAccountBinding, SocialAccountBindingError } from '@/lib/socialAccountBinding'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { reclaimPostfastKeyForBrandIfUnused } from '@/lib/postfastKeyPool'
import { allowedRoleWriteOrigin } from '@/lib/role-permissions/request-origin'
import type { Prisma } from '@prisma/client'

type Params = { params: Promise<{ id: string; aid: string }> }

function maskPw(pw: string | null) {
  return pw ? `••••••${pw.slice(-2)}` : null
}

// PATCH /api/brands/[id]/accounts/[aid] — update an account (human user)
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allowedRoleWriteOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: brandId, aid } = await params
  if (!(await canWriteBrandProject(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const brand = await prisma.brand.findFirst({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const account = await prisma.socialAccount.findFirst({ where: { id: aid, brandId } })
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const body = await request.json()
  if (body.handle !== undefined && (typeof body.handle !== 'string' || !body.handle.trim())) return NextResponse.json({ error: '账号名称不能为空' }, { status: 400 })
  for (const field of ['displayName', 'profileUrl'] as const) if (body[field] !== undefined && typeof body[field] !== 'string') return NextResponse.json({ error: `${field} 格式错误` }, { status: 400 })
  if (body.profileUrl?.trim()) {
    try { if (!['http:', 'https:'].includes(new URL(body.profileUrl.trim()).protocol)) throw new Error() } catch { return NextResponse.json({ error: '主页链接必须是完整的 http/https 地址' }, { status: 400 }) }
  }
  const opt = (v: unknown) => (v === undefined ? undefined : v === '' ? null : (v as string))

  let updated
  try {
    updated = await withBoundAccount(aid, async (_account, tx) => tx.socialAccount.update({
      where: { id: aid },
      data: {
        ...(body.handle !== undefined && { handle: body.handle.trim() }),
        ...(body.displayName !== undefined && { displayName: opt(body.displayName) }),
        ...(body.profileUrl !== undefined && { profileUrl: opt(body.profileUrl.trim()) }),
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
  if (new URL(request.url).searchParams.get('public') === '1') return NextResponse.json({
    id: updated.id, platformId: updated.platformId, handle: updated.handle,
    displayName: updated.displayName, profileUrl: updated.profileUrl, updatedAt: updated.updatedAt,
  })
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
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
