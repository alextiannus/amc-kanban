import type { Prisma } from "@prisma/client"
import { resolveDraftPlatformAccount, draftPlatform } from '@/lib/socialAccountPlaceholder'
import { lockBrandSync } from '@/lib/socialAccountLocks'
import { SocialAccountBindingError } from '@/lib/socialAccountIdentity'
import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { getSchedulingRecommendations } from '@/lib/schedulingRecommendation'
import { RemoteContentServiceError } from '@/lib/amc-content/remoteContentService'
import { generateContentDirect } from '@/lib/amc-content/contentGenerationService'
import { normalizeContentPlatform } from '@/lib/amc-content/platforms'
import { COPYWRITER_ROSTER, copywritersFromIds, platformAliases } from '@/lib/copywriters'
import type { PlatformType } from '@/lib/amc-content/types'

// Allow enough time for parallel LLM calls across all platforms
export const maxDuration = 120

// Non-blocking copywriter log helper (fire-and-forget)
function logCopywriterOutput(opts: {
  brandId: string
  userId: string
  systemPrompt: string
  userInput: string
  rawOutput: string
  modelId?: string
  latencyMs?: number
  platform?: string
}) {
  prisma.copywriterLog.create({
    data: {
      brandId:      opts.brandId,
      userId:       opts.userId,
      systemPrompt: opts.systemPrompt.slice(0, 20000),
      userInput:    opts.userInput.slice(0, 5000),
      rawOutput:    opts.rawOutput.slice(0, 20000),
      modelId:      opts.modelId  ?? null,
      latencyMs:    opts.latencyMs ?? null,
      platform:     opts.platform  ?? null,
    },
  }).catch((err: unknown) => {
    console.error('[CopywriterLog] non-critical write failed:', err)
  })
}

type Params = { params: Promise<{ id: string }> }

// Scheduling recommendation helper — calls the unified smart scheduling API.
// Each platform queries independently so gaps are respected per-platform.
async function getRecommendedTime(brandId: string, platformId: string): Promise<Date | null> {
  try {
    const data = await getSchedulingRecommendations({
      brandId,
      platform: platformId,
      urgency: 'normal',
    })
    const rec = data.recommendations?.[0]?.recommendedAt
    return rec ? new Date(rec) : null
  } catch {
    return null
  }
}

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: authenticatedAgent.role }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

function failureStage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/provider|LLM|model|timed out|timeout|429|504/i.test(message)) return 'model_provider'
  if (/service is not configured|Unauthorized|Not found/i.test(message)) return 'amc_content_request'
  return 'amc_content_generation'
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params
    const actor = await getActor(request)
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { assetIds, mediaUrls, idea: rawIdea, accountId: singleAccountId, targetPlatform, copywriterIds } = await request.json().catch(() => ({}))
    if (typeof rawIdea !== 'string' && rawIdea !== undefined) {
      return NextResponse.json({ error: 'idea must be a string' }, { status: 400 })
    }
    // Allow empty idea — will fall back to brand name + context below

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: { knowledge: true }
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    const selectedCopywriters = copywritersFromIds(copywriterIds)
    const defaultPlatforms = (selectedCopywriters.length > 0 ? selectedCopywriters : COPYWRITER_ROSTER).map(copywriter => copywriter.platform)
    let accounts = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lockBrandSync(tx, brandId, true)
      const current = await tx.socialAccount.findMany({ where: { brandId, unboundAt: null } })
      const chosen = current.filter(account => account.handle !== 'unconfigured')
      for (const platform of defaultPlatforms) {
        if (!chosen.some(account => draftPlatform(account.platformId) === draftPlatform(platform))) chosen.push(await resolveDraftPlatformAccount(tx, brandId, platform))
      }
      // Concrete placeholder selection remains available for draft-only creation.
      if (singleAccountId) {
        const selected = current.find(account => account.id === singleAccountId)
        if (selected?.handle === 'unconfigured' && !chosen.some(account => account.id === selected.id)) chosen.push(await resolveDraftPlatformAccount(tx, brandId, selected.platformId, false))
      }
      return chosen
    })

    // Build effective idea — fall back to brand name if caller didn't provide one
    const idea: string = (rawIdea && rawIdea.trim()) ? rawIdea.trim() : `${brand.name}品牌内容创作`

    // Single-account mode: only generate for the specified account
    if (singleAccountId) {
      accounts = accounts.filter((a: any) => a.id === singleAccountId)
    } else if (targetPlatform) {
      // targetPlatform mode: limit to one specific platform (e.g. xiaohongshu)
      const aliases: Record<string, string[]> = {
        xiaohongshu: ['xiaohongshu', 'rednote', 'red', 'xhs', 'redbook'],
        instagram: ['instagram', 'ins', 'ig'],
        facebook: ['facebook', 'fb'],
        tiktok: ['tiktok', 'tt'],
        google_business: ['google_business', 'google', 'google_maps', 'google_map', 'google_business_profile', 'gbp', 'gmb'],
      }
      const allowed = aliases[targetPlatform.toLowerCase()] ?? [targetPlatform.toLowerCase()]
      accounts = accounts.filter((a: any) => allowed.includes(a.platformId.toLowerCase()))
    } else if (selectedCopywriters.length > 0) {
      const allowed = selectedCopywriters.flatMap((copywriter) => platformAliases(copywriter.platform))
      accounts = accounts.filter((a: any) => allowed.includes(a.platformId.toLowerCase()))
    }

    const accountPlans = accounts.map((account: any) => {
      const platform = account.platformId.toLowerCase()
      const contentPlatform = normalizeContentPlatform(platform)
      const copywriter = selectedCopywriters.find((item) =>
        platformAliases(item.platform).includes(platform),
      ) || COPYWRITER_ROSTER.find((item) => platformAliases(item.platform).includes(platform))
      return { account, platform, contentPlatform, copywriter }
    }) as Array<{
      account: any
      platform: string
      contentPlatform: PlatformType
      copywriter: (typeof COPYWRITER_ROSTER)[number] | undefined
    }>

    const draftResults = await Promise.all(
      accountPlans.map(async ({ account, platform, contentPlatform, copywriter }) => {
        const scheduledAtPromise = getRecommendedTime(brandId, contentPlatform)
        const contentEngine = 'amc-content'
        let caption = ''
        let hashtags: string[] = []
        let generationError: string | null = null
        let provenance: unknown = undefined

        try {
          const result = await generateContentDirect({
            brandId,
            platform: contentPlatform,
            theme: idea,
            mediaUrls: mediaUrls || [],
            assetIds: assetIds || [],
            actorId: actor.id,
            actorType: actor.type,
            actorRole: actor.role,
          })
          caption = result.caption || ''
          hashtags = result.hashtags || []
          provenance = result.provenance
          const promptVersion = (result.provenance as any)?.promptVersion || 'amc-content'
          logCopywriterOutput({
            brandId,
            userId: actor.id,
            systemPrompt: `[via contentService/${contentEngine}] ${JSON.stringify({ provenance })}`,
            userInput: idea,
            rawOutput: JSON.stringify({ caption, hashtags, contentEngine, provenance }),
            modelId: (result.provenance as any)?.modelId,
            platform,
          })
          console.log(`[BulkGenerate] Generated ${platform} with engine=${contentEngine}, promptVersion=${promptVersion}`)
        } catch (error: any) {
          const stage = failureStage(error)
          const status = error instanceof RemoteContentServiceError ? error.status : 500
          const diagnostics = error instanceof RemoteContentServiceError ? error.diagnostics : undefined
          generationError = [
            'amc-content direct generation failed',
            `stage=${stage}`,
            `platform=${contentPlatform}`,
            `status=${status}`,
            `error=${error?.message || 'amc-content generation failed'}`,
            diagnostics ? `diagnostics=${JSON.stringify(diagnostics)}` : '',
          ].filter(Boolean).join('; ')
          console.error(`Failed to generate copy via amc-content for ${platform}; no fallback will run: ${generationError}`)
        }

        const scheduledAt = await scheduledAtPromise

        return {
          platform: account.platformId,
          accountId: account.handle === 'unconfigured' ? `unconfigured_${account.platformId}` : account.id,
          displayName: copywriter ? `${copywriter.name} · ${copywriter.handle}` : account.displayName,
          copywriter,
          copywriterId: copywriter?.id,
          copywriterName: copywriter?.name,
          caption,
          captionLang: platform === 'xiaohongshu' ? 'zh' : 'en',
          mediaUrls: mediaUrls || [],
          hashtags,
          contentEngine,
          aiFailed: Boolean(generationError),
          error: generationError,
          scheduledAt,
          assetIds: assetIds || [],
          isConnected: account.handle !== 'unconfigured'
        }
      })
    )

    return NextResponse.json({ success: true, drafts: draftResults })
  } catch (error: any) {
    if (error instanceof SocialAccountBindingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error('[Bulk Generate Error]:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
