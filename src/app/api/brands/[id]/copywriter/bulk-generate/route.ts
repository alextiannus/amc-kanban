import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { callLLM } from '@/lib/llmRouter'
import { copywriterNode } from '@/agents/nodes/copywriter'

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

    const { assetIds, mediaUrls, idea } = await request.json().catch(() => ({}))
    if (!idea || typeof idea !== 'string') {
      return NextResponse.json({ error: 'idea is required' }, { status: 400 })
    }

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

    // If no accounts, let's create unconfigured placeholders for instagram, xiaohongshu, facebook
    if (accounts.length === 0) {
      const defaultPlatforms = ['instagram', 'xiaohongshu', 'facebook']
      for (const platformId of defaultPlatforms) {
        const handle = 'unconfigured'
        let placeholderAccount = await prisma.socialAccount.findFirst({
          where: { brandId, platformId, handle }
        })
        if (!placeholderAccount) {
          placeholderAccount = await prisma.socialAccount.create({
            data: {
              brandId,
              platformId,
              handle,
              displayName: platformId === 'xiaohongshu' ? '小红书 / Rednote (未配置)' : platformId === 'instagram' ? 'Instagram (未配置)' : 'Facebook (未配置)'
            }
          })
        }
        accounts.push(placeholderAccount)
      }
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

    // Generate content for each platform/account
    const createdDrafts = []
    
    // We will stagger the scheduled date starting tomorrow
    const baseDate = new Date()
    baseDate.setDate(baseDate.getDate() + 1) // Tomorrow
    baseDate.setMinutes(0, 0, 0)

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i]
      const platform = account.platformId.toLowerCase()
      
      let caption = `【${platform}】美味速递！创意想法：${idea}`
      let hashtags: string[] = []

      try {
        let targetPlatform = platform
        if (platform === 'red' || platform === 'xhs') {
          targetPlatform = 'xiaohongshu'
        }

        const cwResult = await copywriterNode({
          brandId,
          platform: targetPlatform,
          caption: idea,
          mediaUrls: mediaUrls || [],
          assetIds: assetIds || [],
          copywriteOnly: true
        })

        if (cwResult && cwResult.caption) {
          caption = cwResult.caption
          hashtags = cwResult.hashtags || []
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
Requirements:
1. For Xiaohongshu: Starts with eye-catching emojis, ends with "！！", uses conversational Chinese, bullet points with emojis, and neat spacing. Output hashtags at the end.
2. For Instagram: Catchy opening hook, neat spacing, English, relevant hashtags at the bottom.
3. For Facebook: Engaging, informative, English, address/contact info naturally included, hashtags at the bottom.

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
            }
          }
        } catch (fallbackErr) {
          console.error(`Fallback LLM failed for ${platform}:`, fallbackErr)
        }
      }

      // Schedule at: stagger by 2 hours starting tomorrow 10:00 AM
      const scheduledAt = new Date(baseDate)
      scheduledAt.setHours(10 + i * 2)

      // Return draft preview details
      const draftPreview = {
        platform: account.platformId,
        accountId: account.id,
        displayName: account.displayName,
        caption,
        captionLang: platform === 'xiaohongshu' ? 'zh' : 'en',
        mediaUrls: mediaUrls || [],
        hashtags,
        scheduledAt,
        assetIds: assetIds || [],
        isConnected: account.handle !== 'unconfigured'
      }

      createdDrafts.push(draftPreview)
    }

    return NextResponse.json({ success: true, drafts: createdDrafts })
  } catch (error: any) {
    console.error('[Bulk Generate Error]:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
