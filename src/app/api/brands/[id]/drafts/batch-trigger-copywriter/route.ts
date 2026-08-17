import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { normalizeContentPlatform } from '@/lib/amc-content/platforms'
import { RemoteContentServiceError } from '@/lib/amc-content/remoteContentService'
import { generateContentDirect } from '@/lib/amc-content/contentGenerationService'
import type { PlatformType } from '@/lib/amc-content/types'

export const maxDuration = 120

type Params = { params: Promise<{ id: string }> }

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
  const { id: brandId } = await params
  const actor = await getActor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const draftIds = Array.isArray(body?.draftIds)
    ? body.draftIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
    : []
  if (draftIds.length === 0) {
    return NextResponse.json({ error: 'draftIds is required' }, { status: 400 })
  }

  const drafts = await prisma.contentDraft.findMany({
    where: { brandId, id: { in: draftIds } },
    include: {
      account: true,
      assetRefs: { include: { asset: true } },
    },
  })
  if (drafts.length === 0) {
    return NextResponse.json({ error: 'No drafts found' }, { status: 404 })
  }

  const draftPlans: Array<{
    draft: any
    platform: PlatformType
    instruction: string
    assetIds: string[]
    mediaUrls: string[]
  }> = drafts.map((draft: any) => {
    const platform = normalizeContentPlatform(draft.account?.platformId || 'instagram')
    const refAssetIds = (draft as any).assetRefs?.map((ref: any) => ref.asset?.id).filter(Boolean) || []
    const refMediaUrls = (draft as any).assetRefs?.map((ref: any) => ref.asset?.url).filter(Boolean) || []
    return {
      draft,
      platform,
      instruction: extractInstruction(draft),
      assetIds: Array.from(new Set([...(draft.assetIds || []), ...refAssetIds].map(String).filter(Boolean))),
      mediaUrls: Array.from(new Set([...(draft.mediaUrls || []), ...refMediaUrls].map(String).filter(Boolean))),
    }
  })

  const theme = String(body?.theme || draftPlans.map((plan) => plan.instruction).find(Boolean) || '品牌内容创作')

  try {
    console.log(`[batch-trigger-copywriter-direct] brand=${brandId} drafts=${draftPlans.length}`)
    const updates = await Promise.all(draftPlans.map(async ({ draft, platform, instruction, assetIds, mediaUrls }) => {
      try {
        const result = await generateContentDirect({
          brandId,
          platform,
          theme: instruction || theme,
          mediaUrls,
          assetIds,
          draftId: draft.id,
          actorId: actor.id,
          actorType: actor.type,
          actorRole: actor.role,
        })
        const updated = await prisma.contentDraft.update({
          where: { id: draft.id },
          data: {
            caption: result.caption,
            hashtags: result.hashtags || [],
            status: 'draft',
            agentNote: `amc-content generated via direct batch thread. platform=${platform}`,
          },
          select: { id: true, caption: true, hashtags: true, status: true, agentNote: true },
        })
        return { draftId: draft.id, platform, success: true, draft: updated, provenance: result.provenance }
      } catch (error: any) {
        const stage = failureStage(error)
        const status = error instanceof RemoteContentServiceError ? error.status : 500
        const diagnostics = error instanceof RemoteContentServiceError ? error.diagnostics : undefined
        const message = error?.message || 'amc-content generation failed'
        const reason = [
          'amc-content direct batch thread failed',
          `stage=${stage}`,
          `platform=${platform}`,
          `status=${status}`,
          `error=${message}`,
          diagnostics ? `diagnostics=${JSON.stringify(diagnostics)}` : '',
        ].filter(Boolean).join('; ')
        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: {
            status: 'failed',
            agentNote: reason,
          },
        })
        return { draftId: draft.id, platform, success: false, error: message, stage, status, diagnostics }
      }
    }))

    return NextResponse.json({
      success: updates.every((item) => item.success),
      contentEngine: 'amc-content',
      results: updates,
    })
  } catch (error: any) {
    const message = error?.message || 'amc-content batch generation failed'
    await Promise.all(draftPlans.map(({ draft, platform }) =>
      prisma.contentDraft.update({
        where: { id: draft.id },
        data: {
          status: 'failed',
          agentNote: `amc-content batch generation failed before content writeback. platform=${platform}; ${message}`,
        },
      }).catch(() => null),
    ))
    return NextResponse.json({ error: message }, { status: error?.status || 500 })
  }
}
