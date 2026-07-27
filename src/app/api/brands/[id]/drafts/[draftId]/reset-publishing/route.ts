/**
 * POST /api/brands/[id]/drafts/[draftId]/reset-publishing
 *
 * Resets a ContentDraft that is stuck in "publishing" state back to "draft"
 * so the user can retry the publish action.
 *
 * A draft can get stuck in "publishing" when:
 * - The PostFast agent picked it up but never called back with a result
 * - A network error mid-flight left the status unreset
 * - The Render instance was restarted while publish was in progress
 *
 * Only allowed when:
 * - Draft status IS "publishing"
 * - The calling user has access to the brand
 *
 * After reset the draft returns to "draft" and the standard publish / retry
 * UI becomes available again.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string; draftId: string }> }

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: brandId, draftId } = await params

  // Auth check
  const canAccess = await canHumanAccessBrandProject(brandId, session.user.id, session.user.role)
  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find the draft — must belong to this brand and be in "publishing"
  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, brandId, status: 'publishing' },
    select: { id: true, status: true, updatedAt: true },
  })

  if (!draft) {
    return NextResponse.json(
      { error: 'Draft not found or not in publishing status — nothing to reset.' },
      { status: 404 },
    )
  }

  const stuckDurationMs = Date.now() - draft.updatedAt.getTime()
  const stuckMinutes = Math.round(stuckDurationMs / 60000)

  // Reset draft to draft so it can be retried
  await prisma.contentDraft.update({
    where: { id: draftId },
    data: {
      status: 'draft',
      agentNote: `发布流程异常中断 (卡住约 ${stuckMinutes} 分钟)，已重置为草稿状态。请重新安排发布。`,
    },
  })

  // Audit log
  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorType: 'HUMAN',
      actorName: (session.user as any).nickname ?? (session.user as any).email,
      action: 'RESET_STUCK_PUBLISHING',
      resourceId: draftId,
      resourceType: 'ContentDraft',
      reason: `人工重置卡住的发布状态 (已卡 ${stuckMinutes} 分钟)`,
      metadata: { brandId, stuckMinutes },
    },
  })

  return NextResponse.json({
    ok: true,
    message: `草稿已从"发布中"重置为"草稿"，卡住时长约 ${stuckMinutes} 分钟。`,
    stuckMinutes,
  })
}
