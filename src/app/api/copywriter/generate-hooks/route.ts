import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { callGeminiChat } from '@/lib/gemini-chat'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { brandId, contentType, contentIdea } = body

  // 1. Fetch brand details for context
  let brandContext = ''
  if (brandId) {
    try {
      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        include: { knowledge: true }
      })
      if (brand) {
        brandContext = `Brand Name: ${brand.name}\n`
        if (brand.description) brandContext += `Brand description: ${brand.description}\n`
        if (brand.knowledge?.brandTone) brandContext += `Brand Tone/Style: ${brand.knowledge.brandTone}\n`
      }
    } catch (e) {
      console.warn('Failed to load brand context', e)
    }
  }

  // Determine media instructions based on contentType ('video' vs 'photo')
  const mediaInstruction = contentType === 'video'
    ? `The content type is Video (Reels/Shorts/Video post). Visual design instructions should specify dynamic, high-engagement 3-second B-Roll action video instructions for the creator. The hook text should be optimized for video watch-time.`
    : `The content type is Photo/Carousel (图文/图片卡片). Visual design instructions should specify static image layout, graphic styling, or carousel slide visual instructions. The hook text should be optimized for image CTR.`

  const systemPrompt = `You are an expert copywriter. Generate 3 ready-to-use opening hook options for a social media post.
Generate these hooks based on the brand context and the user's content idea / materials description.
${mediaInstruction}

Return the output strictly in a valid JSON array format, where each item in the array has:
- "visual": Visual design/graphic/video instructions for the creator (in Chinese, max 15 words).
- "overlay": The text to print/overlay on the graphic/video overlay (in Chinese, max 7 words).
- "audio": The opening spoken/written caption line that hooks the audience (in Chinese, 1 short sentence).

JSON output format:
[
  { "visual": "...", "overlay": "...", "audio": "..." },
  { "visual": "...", "overlay": "...", "audio": "..." },
  { "visual": "...", "overlay": "...", "audio": "..." }
]
Never include any markdown backticks, conversational preamble, or explanation outside the JSON.`

  const promptMsg = `[Brand Context]
${brandContext || 'No details provided.'}

[Content Idea / Materials Description]
${contentIdea || 'No details provided.'}`

  try {
    const result = await callGeminiChat(systemPrompt, [], promptMsg, false, 800)
    if (result.reply) {
      let cleanText = result.reply.replace(/```json/gi, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(cleanText)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return NextResponse.json({ success: true, hooks: parsed.slice(0, 3) })
      }
    }
    throw new Error('Invalid LLM reply format')
  } catch (error: any) {
    console.error('[Generate Hooks API Error]', error)
    return NextResponse.json({ error: error.message || 'Generation failed' }, { status: 500 })
  }
}
