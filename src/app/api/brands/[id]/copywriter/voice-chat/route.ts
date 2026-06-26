import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { callLLM } from '@/lib/llmRouter'

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

    const { message } = await request.json().catch(() => ({}))
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // Get brand knowledge context
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: { knowledge: true }
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
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

    const prompt = `You are a friendly, expert AI Marketing Companion for the brand "${brand.name}".
Brand Description: ${brand.description || "A premium restaurant/brand."}
${brandToneText ? `\n${brandToneText}\n` : ""}
${menuText ? `\n${menuText}\n` : ""}
${slangText ? `\n${slangText}\n` : ""}
${brand.location ? `Location: ${brand.location}` : ""}
${brand.address ? `Address: ${brand.address}` : ""}

The user (the brand owner) is talking to you via voice. Detect if their voice message expresses a semantic command/intent to generate content and publish/post/distribute it to platforms (e.g., "生成并发布到所有平台", "帮我发布推文", "批量生成并排期发布", "一键生成并发布").

Output ONLY a valid JSON object with the following structure:
{
  "reply": "Your friendly conversational spoken reply (in Simplified Chinese, strictly 1 to 2 sentences, encouraging and positive, no markdown or brackets)",
  "action": "GENERATE_AND_PUBLISH" or "NONE"
}
Do not include markdown wrappers around the JSON, return the raw JSON object.

User voice message: "${message}"`

    const result = await callLLM("voice-companion", prompt, 300)
    let replyText = "好的，老板，我这就帮您处理！"
    let action = "NONE"

    try {
      if (result.text) {
        const cleanJson = result.text.replace(/```json/g, "").replace(/```/g, "").trim()
        const parsed = JSON.parse(cleanJson)
        replyText = parsed.reply || replyText
        action = parsed.action || "NONE"
      }
    } catch (err) {
      console.error('Failed to parse voice-chat response JSON:', err)
      if (result.text) {
        replyText = result.text.trim()
        if (replyText.includes("发布") || replyText.includes("生成") || message.includes("发布") || message.includes("生成")) {
          action = "GENERATE_AND_PUBLISH"
        }
      }
    }

    return NextResponse.json({ reply: replyText, action })
  } catch (error: any) {
    console.error('[Voice Chat API Error]:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
