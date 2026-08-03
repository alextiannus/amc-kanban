/**
 * POST /api/brands/[id]/drafts/[draftId]/reset-publishing
 *
 * Compatibility endpoint for the existing UI. It no longer blindly resets a
 * publishing draft to draft. Once the 30-minute grace period has elapsed it
 * first reconciles with PostFast, then resolves to published/scheduled/failed.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'
import { writeAuditLog } from '@/lib/audit'
import {
  DRAFT_STATUS_RECONCILIATION_GRACE_MS,
  POSTFAST_RESULT_UNKNOWN,
  syncBrandDraftStatuses,
} from '@/lib/syncDraftStatuses'

type Params = { params: Promise<{ id: string; draftId: string }> }

export async function POST(_request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: brandId, draftId } = await params
  const canAccess = await canHumanAccessBrandProject(brandId, session.user.id, session.user.role)
  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, brandId, status: 'publishing' },
    select: { id: true, status: true, updatedAt: true },
  })
  if (!draft) {
    return NextResponse.json(
      { error: 'Draft not found or no longer publishing.' },
      { status: 404 },
    )
  }

  const stuckDurationMs = Date.now() - draft.updatedAt.getTime()
  const stuckMinutes = Math.floor(stuckDurationMs / 60_000)
  if (stuckDurationMs < DRAFT_STATUS_RECONCILIATION_GRACE_MS) {
    return NextResponse.json(
      { error: `发布结果仍在自动确认中，请在 ${30 - stuckMinutes} 分钟后再检查。` },
      { status: 409 },
    )
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { postfastApiKey: true },
  })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  if (!brand.postfastApiKey) {
    await prisma.contentDraft.updateMany({
      where: { id: draftId, brandId, status: 'publishing' },
      data: {
        status: 'failed',
        deliveryFailureCode: POSTFAST_RESULT_UNKNOWN,
        deliveryFailureAt: new Date(),
        agentNote: '无法连接 PostFast 核对发布结果。重新排期前，请先检查对应社交平台确认内容尚未发布。',
      },
    })
  } else {
    const sync = await syncBrandDraftStatuses(brandId, brand.postfastApiKey)
    if (sync.providerErrors > 0) {
      return NextResponse.json(
        { error: 'PostFast 暂时无法完成结果核对，数据库状态未修改，请稍后重试。', sync },
        { status: 502 },
      )
    }
  }

  const resolved = await prisma.contentDraft.findFirst({
    where: { id: draftId, brandId },
    select: { id: true, status: true, deliveryFailureCode: true },
  })
  if (!resolved || resolved.status === 'publishing') {
    return NextResponse.json(
      { error: 'PostFast 返回了冲突结果，未自动修改状态，请联系管理员核对。' },
      { status: 409 },
    )
  }

  await writeAuditLog({
    actor: {
      id: session.user.id,
      type: 'HUMAN',
      name: (session.user as { nickname?: string; email?: string }).nickname
        ?? (session.user as { email?: string }).email,
    },
    action: 'MANUAL_POSTFAST_RESULT_CHECK',
    resourceId: draftId,
    resourceType: 'ContentDraft',
    oldValue: { status: 'publishing' },
    newValue: { status: resolved.status, deliveryFailureCode: resolved.deliveryFailureCode },
    reason: `User requested a PostFast result check after ${stuckMinutes} minutes.`,
    metadata: { brandId, stuckMinutes },
  })

  return NextResponse.json({
    ok: true,
    status: resolved.status,
    deliveryFailureCode: resolved.deliveryFailureCode,
    message: resolved.status === 'published'
      ? 'PostFast 已确认发布成功，状态已更新为“已发布”。'
      : resolved.status === 'scheduled'
        ? 'PostFast 已确认排期仍有效，状态已更新为“已排期”。'
        : '未能确认发布成功，已转入“发布失败”。重新排期前请先检查社交平台。',
  })
}
