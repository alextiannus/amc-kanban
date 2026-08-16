import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { normalizeContentPlatform } from '@/lib/amc-content/platforms'
import { generateMultiPlatformWithRemoteContentService } from '@/lib/amc-content/remoteContentService'
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

  const platforms: PlatformType[] = Array.from(new Set(draftPlans.map((plan) => plan.platform)))
  const theme = String(body?.theme || draftPlans.map((plan) => plan.instruction).find(Boolean) || '品牌内容创作')
  const assetIds: string[] = Array.from(new Set(draftPlans.flatMap((plan) => plan.assetIds)))
  const mediaUrls: string[] = Array.from(new Set(draftPlans.flatMap((plan) => plan.mediaUrls)))

  try {
    console.log(`[batch-trigger-copywriter] brand=${brandId} drafts=${draftPlans.length} platforms=${platforms.join(',')}`)
    const multiResult = await generateMultiPlatformWithRemoteContentService({
      brandId,
      platforms,
      theme,
      mediaUrls,
      assetIds,
      actorId: actor.id,
      actorType: actor.type,
      actorRole: actor.role,
      continueOnError: true,
    })
    if (!multiResult) throw new Error('amc-content service is not configured or did not generate content')

    const byPlatform = new Map(multiResult.results.map((result) => [result.platform, result]))
    const updates = await Promise.all(draftPlans.map(async ({ draft, platform }) => {
      const result = byPlatform.get(platform)
      if (result?.success && result.result?.caption) {
        const updated = await prisma.contentDraft.update({
          where: { id: draft.id },
          data: {
            caption: result.result.caption,
            hashtags: result.result.hashtags || [],
            status: 'draft',
            agentNote: `amc-content generated via multi-platform route. platform=${platform}`,
          },
          select: { id: true, caption: true, hashtags: true, status: true, agentNote: true },
        })
        return { draftId: draft.id, platform, success: true, draft: updated, provenance: result.result.provenance, quality: result.result.quality }
      }

      const error = [
        result?.error || 'amc-content generation failed',
        result?.status ? `HTTP ${result.status}` : '',
      ].filter(Boolean).join(' · ')
      await prisma.contentDraft.update({
        where: { id: draft.id },
        data: {
          status: 'failed',
          agentNote: `amc-content generation failed at multi-platform route. platform=${platform}; ${error}`,
        },
      })
      return { draftId: draft.id, platform, success: false, error, diagnostics: result?.diagnostics }
    }))

    return NextResponse.json({
      success: updates.every((item) => item.success),
      contentEngine: 'amc-content',
      modelRouting: multiResult.modelRouting,
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
