import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { getSchedulingRecommendations } from '@/lib/schedulingRecommendation'
import { generateMultiPlatformWithRemoteContentService } from '@/lib/amc-content/remoteContentService'
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
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
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

    // 1. Fetch brand accounts
    let accounts = await prisma.socialAccount.findMany({
      where: { brandId }
    })

    const selectedCopywriters = copywritersFromIds(copywriterIds)
    const defaultPlatforms = (selectedCopywriters.length > 0 ? selectedCopywriters : COPYWRITER_ROSTER)
      .map((copywriter) => copywriter.platform)

    // Ensure placeholders exist for selected copywriter platforms if they are not configured
    for (const platformId of defaultPlatforms) {
      const aliasesForPlatform = platformAliases(platformId)
      const exists = accounts.some((a: any) => {
        const pId = a.platformId.toLowerCase()
        return aliasesForPlatform.includes(pId)
      })
      if (!exists) {
        const handle = 'unconfigured'
        let placeholderAccount = await prisma.socialAccount.findFirst({
          where: { brandId, platformId, handle }
        })
        if (!placeholderAccount) {
          const getDisplayName = (pId: string) => {
            if (pId === 'xiaohongshu') return '小红书 / Rednote (未配置)'
            if (pId === 'instagram') return 'Instagram (未配置)'
            if (pId === 'facebook') return 'Facebook (未配置)'
            return `${pId.charAt(0).toUpperCase() + pId.slice(1)} (未配置)`
          }
          placeholderAccount = await prisma.socialAccount.create({
            data: {
              brandId,
              platformId,
              handle,
              displayName: getDisplayName(platformId)
            }
          })
        }
        accounts.push(placeholderAccount)
      }
    }

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

    const uniquePlatforms: PlatformType[] = Array.from(new Set(accountPlans.map((plan) => plan.contentPlatform)))

    const multiResult = await generateMultiPlatformWithRemoteContentService({
      brandId,
      platforms: uniquePlatforms,
      theme: idea,
      mediaUrls: mediaUrls || [],
      assetIds: assetIds || [],
      actorId: actor.id,
      actorType: actor.type,
      actorRole: actor.role,
      continueOnError: true,
    })

    if (!multiResult) {
      throw new Error('amc-content service is not configured or did not generate content')
    }

    const generatedByPlatform = new Map(multiResult.results.map((result) => [result.platform, result]))

    const draftResults = await Promise.all(
      accountPlans.map(async ({ account, platform, contentPlatform, copywriter }) => {
        const scheduledAtPromise = getRecommendedTime(brandId, contentPlatform)
        const resultForPlatform = generatedByPlatform.get(contentPlatform)
        const successResult = resultForPlatform?.success ? resultForPlatform.result : null
        const caption = successResult?.caption || ''
        const hashtags = successResult?.hashtags || []
        const contentEngine = 'amc-content'
        const generationError = resultForPlatform?.success
          ? null
          : [
              resultForPlatform?.error || 'amc-content generation failed',
              resultForPlatform?.status ? `HTTP ${resultForPlatform.status}` : '',
            ].filter(Boolean).join(' · ')

        if (successResult?.caption) {
          const provenance = {
            ...(successResult.provenance as object || {}),
            modelRouting: multiResult.modelRouting,
          }
          const promptVersion = (successResult.provenance as any)?.promptVersion || 'amc-content'
          logCopywriterOutput({
            brandId,
            userId: actor.id,
            systemPrompt: `[via contentService/${contentEngine}] ${JSON.stringify({
              quality: successResult.quality,
              provenance,
            })}`,
            userInput: idea,
            rawOutput: JSON.stringify({ caption, hashtags, contentEngine, quality: successResult.quality, provenance }),
            modelId: (successResult.provenance as any)?.modelId,
            platform,
          })
          console.log(`[BulkGenerate] Generated ${platform} with engine=${contentEngine}, promptVersion=${promptVersion}`)
        } else {
          console.error(`Failed to generate copy via amc-content for ${platform}; no fallback will run: ${generationError}`)
        }

        const scheduledAt = await scheduledAtPromise

        return {
          platform: account.platformId,
          accountId: account.id,
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
    console.error('[Bulk Generate Error]:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
