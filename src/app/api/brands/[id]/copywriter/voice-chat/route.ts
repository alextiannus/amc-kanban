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

The user (the brand owner) is talking to you via voice. Respond in a friendly, helpful, conversational manner matching the brand tone.
Rules:
1. Speak in Simplified Chinese (中文).
2. Keep your response very concise (strictly 1 to 2 sentences) so that it is fast and comfortable to listen to when synthesized to speech.
3. Keep it encouraging, positive, and direct. Do not output markdown, formatting, or bracket annotations.

User voice message: "${message}"

Spoken reply:`

    const result = await callLLM("voice-companion", prompt, 300)
    const replyText = (result.text || "好的，老板，我这就帮您处理！").trim()

    return NextResponse.json({ reply: replyText })
  } catch (error: any) {
    console.error('[Voice Chat API Error]:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
