import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { assignRemoteCopyScriptExperiment, RemoteContentServiceError } from '@/lib/amc-content/remoteContentService'
import { normalizeContentPlatform } from '@/lib/amc-content/platforms'
import { generateContentDirect } from '@/lib/amc-content/contentGenerationService'

type Params = { params: Promise<{ id: string; draftId: string }> }

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

function extractInstruction(draft: { caption?: string | null; agentNote?: string | null }) {
  const note = draft.agentNote || ''
  const match = note.match(/【AI 生成指令】([\s\S]*?)【\/AI 生成指令】/)
  if (match?.[1]?.trim()) return match[1].trim()
  const caption = draft.caption?.trim()
  if (caption && !caption.includes('【AI 正在创作中')) return caption
  return ''
}

function failureStage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/provider|LLM|model|timed out|timeout|429|504/i.test(message)) return 'model_provider'
  if (/service is not configured|Unauthorized|Not found/i.test(message)) return 'amc_content_request'
  return 'amc_content_generation'
}

export async function POST(request: Request, { params }: Params) {
  const { id: brandId, draftId } = await params
  const actor = await getActor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))

  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 1. Retrieve draft by ID
  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, brandId },
    include: {
      account: true,
      assetRefs: { include: { asset: true } },
    }
  })
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  const accountPlatform = draft.account?.platformId || 'instagram'
  const platform = normalizeContentPlatform(accountPlatform)

  let experimentAssignment: Awaited<ReturnType<typeof assignRemoteCopyScriptExperiment>> | null = null
  let effectiveCopyScriptId = draft.viralCopyScriptId || ''
  let effectiveCopyScriptVersionId = draft.viralCopyScriptVersionId || ''
  let effectiveScriptSelection = draft.viralCopyScriptSelection || ''
  if (effectiveCopyScriptId && effectiveCopyScriptVersionId) {
    try {
      const overrideArm = body?.experimentArm === 'treatment' || body?.experimentArm === 'control'
        ? body.experimentArm as 'treatment' | 'control'
        : undefined
      experimentAssignment = await assignRemoteCopyScriptExperiment({
        scriptId: effectiveCopyScriptId,
        scriptVersionId: effectiveCopyScriptVersionId,
        brandId,
        draftId,
        accountId: draft.accountId || undefined,
        platform,
        overrideArm,
      })
      if (!experimentAssignment.useScript) {
        effectiveCopyScriptId = ''
        effectiveCopyScriptVersionId = ''
      }
      effectiveScriptSelection = 'experiment'
      await prisma.contentDraft.update({
        where: { id: draftId },
        data: {
          viralCopyExperimentId: experimentAssignment.experiment.id,
          viralCopyExperimentAssignmentId: experimentAssignment.assignment.id,
          viralCopyExperimentArm: experimentAssignment.assignment.arm,
          viralCopyExperimentOverridden: experimentAssignment.assignment.overridden,
          viralCopyExperimentExcluded: experimentAssignment.assignment.excluded,
        },
      })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : '爆品脚本实验分组失败' }, { status: 409 })
    }
  }

  // 2. Update draft caption in database to indicate AI is writing
  const originalCaption = draft.caption || ''
  await prisma.contentDraft.update({
    where: { id: draftId },
    data: { caption: '【AI 正在创作中...】' }
  })

  const refAssetIds = (draft as any).assetRefs?.map((ref: any) => ref.asset?.id).filter(Boolean) || []
  const refMediaUrls = (draft as any).assetRefs?.map((ref: any) => ref.asset?.url).filter(Boolean) || []
  const assetIds = Array.from(new Set([...(draft.assetIds || []), ...refAssetIds].map(String).filter(Boolean)))
  const mediaUrls = Array.from(new Set([...(draft.mediaUrls || []), ...refMediaUrls].map(String).filter(Boolean)))

  let result: Awaited<ReturnType<typeof generateContentDirect>> | null = null
  try {
    console.log(`[trigger-copywriter-direct] brand=${brandId} draft=${draftId} platform=${platform}`)
    result = await generateContentDirect({
      brandId,
      platform,
      theme: extractInstruction(draft),
      mediaUrls,
      assetIds,
      draftId,
      actorId: actor.id,
      actorType: actor.type,
      actorRole: actor.role,
      copyScriptId: effectiveCopyScriptId,
      copyScriptVersionId: effectiveCopyScriptVersionId,
      scriptSelection: effectiveScriptSelection,
      experimentAssignmentId: experimentAssignment?.assignment.id || '',
      experimentId: experimentAssignment?.experiment.id || '',
      experimentArm: experimentAssignment?.assignment.arm,
      experimentOverridden: experimentAssignment?.assignment.overridden || false,
    })
    await prisma.contentDraft.update({
      where: { id: draftId },
      data: {
        caption: result.caption,
        hashtags: result.hashtags,
        status: 'draft',
        agentNote: `amc-content generated via direct trigger. platform=${platform}`,
      },
    })
    console.log(`AI Copywriter generated via direct amc-content trigger: platform=${platform}`)
  } catch (err: any) {
    const stage = failureStage(err)
    const status = err instanceof RemoteContentServiceError ? err.status : 500
    const diagnostics = err instanceof RemoteContentServiceError ? err.diagnostics : undefined
    const reason = [
      `amc-content direct generation failed`,
      `stage=${stage}`,
      `platform=${platform}`,
      `status=${status}`,
      `error=${err.message || String(err)}`,
      diagnostics ? `diagnostics=${JSON.stringify(diagnostics)}` : '',
    ].filter(Boolean).join('; ')
    console.error(`[trigger-copywriter-direct] failed for draft ${draftId}:`, err)
    try {
      await prisma.contentDraft.update({
        where: { id: draftId },
        data: {
          caption: originalCaption,
          status: 'failed',
          agentNote: reason,
        }
      })
    } catch (dbErr) {
      console.error(`Failed to update draft ${draftId} to failed on error:`, dbErr)
    }
    return NextResponse.json(
      { error: err.message || 'AI Copywriter failed', stage, status, diagnostics },
      { status }
    )
  }

  const provenance = result?.provenance as any
  if (provenance?.copyScriptId && provenance?.copyScriptVersionId) {
    await prisma.contentDraft.update({
      where: { id: draftId },
      data: {
        viralCopyScriptId: provenance.copyScriptId,
        viralCopyScriptVersionId: provenance.copyScriptVersionId,
        viralCopyScriptName: provenance.copyScriptName || draft.viralCopyScriptName,
        viralCopyScriptSelection: provenance.scriptSelection || draft.viralCopyScriptSelection || 'manual',
        viralCopyScriptProvenance: provenance,
      },
    })
  }

  const updatedDraft = await prisma.contentDraft.findUnique({
    where: { id: draftId },
    select: {
      id: true, caption: true, hashtags: true, status: true, agentNote: true,
      viralCopyScriptId: true, viralCopyScriptVersionId: true, viralCopyScriptName: true,
      viralCopyScriptSelection: true, viralCopyScriptProvenance: true,
      viralCopyExperimentId: true, viralCopyExperimentAssignmentId: true, viralCopyExperimentArm: true,
      viralCopyExperimentOverridden: true, viralCopyExperimentExcluded: true,
    },
  })

  return NextResponse.json({
    success: true,
    contentEngine: result.contentEngine,
    provenance: result?.provenance || null,
    draft: updatedDraft,
    message: 'AI Copywriter triggered successfully'
  })
}
