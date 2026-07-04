import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { callLLM } from '@/lib/llmRouter'
import { getSchedulingRecommendations } from '@/lib/schedulingRecommendation'
import { generateContentWithFallback } from '@/lib/amc-content/contentGenerationService'

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

    const { assetIds, mediaUrls, idea: rawIdea, accountId: singleAccountId, targetPlatform } = await request.json().catch(() => ({}))
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

    // Ensure placeholders exist for standard platforms (instagram, xiaohongshu, facebook) if they are not configured
    const defaultPlatforms = ['instagram', 'xiaohongshu', 'facebook']
    for (const platformId of defaultPlatforms) {
      const exists = accounts.some((a: any) => {
        const pId = a.platformId.toLowerCase()
        if (platformId === 'xiaohongshu') {
          return ['xiaohongshu', 'rednote', 'red', 'xhs'].includes(pId)
        }
        return pId === platformId
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
        xiaohongshu: ['xiaohongshu', 'rednote', 'red', 'xhs'],
        instagram: ['instagram'],
        facebook: ['facebook'],
        tiktok: ['tiktok'],
      }
      const allowed = aliases[targetPlatform.toLowerCase()] ?? [targetPlatform.toLowerCase()]
      accounts = accounts.filter((a: any) => allowed.includes(a.platformId.toLowerCase()))
    }

    let brandToneText = ""
    let menuText = ""
    let slangText = ""
    if (brand.knowledge) {
      const k = brand.knowledge
      if (k.brandTone) brandToneText = `Brand Tone/Voice: ${k.brandTone}`
      if (k.menuItems) {
        const menu = k.menuItems as any[]
        if (menu.length > 0) {
          menuText = `Menu Items:\n` + menu.map(item => `- ${item.name}: ${item.description || ""}`).join("\n")
        }
      }
      if (k.slangDict) {
        const slang = k.slangDict as Record<string, string>
        slangText = `Target local slang/terms:\n` + Object.entries(slang).map(([key, val]) => `- "${key}": ${val}`).join("\n")
      }
    }

    // Generate content for all platforms in PARALLEL — reduces total latency from
    // ~30-48s (serial, 2 LLM calls × N platforms) to ~8-15s (concurrent)
    const draftResults = await Promise.all(
      accounts.map(async (account: any) => {
        const platform = account.platformId.toLowerCase()
        const scheduledAtPromise = getRecommendedTime(brandId, platform)

        let caption = `【${platform}】美味速递！创意想法：${idea}`
        let hashtags: string[] = []
        let contentEngine = 'fallback-default'

        try {
          let targetPlatform = platform
          if (platform === 'red' || platform === 'xhs') {
            targetPlatform = 'xiaohongshu'
          }

          const cwResult = await generateContentWithFallback({
            brandId,
            platform: targetPlatform,
            theme: idea,
            mediaUrls: mediaUrls || [],
            assetIds: assetIds || [],
            actorId: actor.id,
            actorType: actor.type,
            actorRole: actor.role,
            fallbackToLegacy: true,
          })

          if (cwResult && cwResult.caption) {
            caption = cwResult.caption
            hashtags = cwResult.hashtags || []
            contentEngine = cwResult.contentEngine
            const promptVersion = (cwResult.provenance as any)?.promptVersion || (contentEngine === 'amc-content' ? 'amc-content' : 'legacy-copywriter')
            logCopywriterOutput({
              brandId,
              userId: actor.id,
              systemPrompt: `[via contentService/${contentEngine}] ${JSON.stringify({
                quality: cwResult.quality,
                provenance: cwResult.provenance,
              })}`,
              userInput: idea,
              rawOutput: JSON.stringify({ caption, hashtags, contentEngine, quality: cwResult.quality, provenance: cwResult.provenance }),
              modelId: (cwResult.provenance as any)?.modelId,
              platform,
            })
            console.log(`[BulkGenerate] Generated ${platform} with engine=${contentEngine}, promptVersion=${promptVersion}`)
          }
        } catch (err) {
          console.error(`Failed to generate copy via copywriterNode for ${platform}:`, err)
          const prompt = `You are a professional social media manager and copywriter for the brand "${brand.name}".
Brand Description: ${brand.description || "A premium restaurant/brand."}
Target Platform: ${platform}
Language Rule:
- For Xiaohongshu (小红书/Rednote, platform is "red", "xiaohongshu", or "xhs"): You MUST write the content in Simplified Chinese (中文) by default.
- For all other platforms (Instagram, Facebook, TikTok): You MUST write the content in English (英文) by default.

User Creative Idea/Theme: "${idea}"
Number of attached images: ${mediaUrls ? mediaUrls.length : 0}
${mediaUrls && mediaUrls.length > 0 ? `Attached Image URLs: ${mediaUrls.join(", ")}` : ""}

${brandToneText ? `${brandToneText}\n` : ""}
${menuText ? `${menuText}\n` : ""}
${slangText ? `${slangText}\n` : ""}
${brand.location ? `Location: ${brand.location}` : ""}
${brand.address ? `Address: ${brand.address}` : ""}

Goal: Generate a complete social media post for this platform.
${(!rawIdea || !rawIdea.trim()) ? `IMPORTANT: No specific theme was provided. You MUST invent a creative, attention-grabbing Hook based on the brand, images, and context. Choose a hook style (e.g., Curiosity Gap, Direct Value, Social Proof, Counter-Narrative, or Pain-Point) that fits the platform.` : ''}
Requirements:
1. For Xiaohongshu: MUST start with a powerful 爆款 Hook (e.g., "竟然有这种好地方！""你不知道的XX秘密""去了就后悔没早去"). Followed by emojis, conversational Chinese, bullet points. Ends with "！！". Output hashtags at the end.
2. For Instagram: MUST start with a catchy opening hook sentence in English. Neat spacing, relevant hashtags at the bottom.
3. For Facebook: Engaging opening hook, informative, English, address/contact info naturally included, hashtags at the bottom.

Output ONLY a valid JSON object with the following structure:
{
  "caption": "Your complete post caption text here (without hashtags)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}
Do not include markdown wrappers around the JSON, return the raw JSON object.
`
          try {
            const result = await callLLM("copywriting", prompt, 1000)
            if (result.text) {
              const cleanJson = result.text.replace(/```json/g, "").replace(/```/g, "").trim()
              const parsed = JSON.parse(cleanJson)
              if (parsed.caption) {
                caption = parsed.caption
                hashtags = parsed.hashtags || []
                contentEngine = 'bulk-generate-fallback-llm'
                logCopywriterOutput({
                  brandId,
                  userId: actor.id,
                  systemPrompt: prompt,
                  userInput: idea,
                  rawOutput: JSON.stringify({ caption, hashtags }),
                  modelId: result.modelName ?? result.provider ?? undefined,
                  platform,
                })
              }
            }
          } catch (fallbackErr) {
            console.error(`Fallback LLM failed for ${platform}:`, fallbackErr)
          }
        }

        const scheduledAt = await scheduledAtPromise

        return {
          platform: account.platformId,
          accountId: account.id,
          displayName: account.displayName,
          caption,
          captionLang: platform === 'xiaohongshu' ? 'zh' : 'en',
          mediaUrls: mediaUrls || [],
          hashtags,
          contentEngine,
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
