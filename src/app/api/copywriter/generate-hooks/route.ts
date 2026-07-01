import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { callGeminiChat } from '@/lib/gemini-chat'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { businessType, hookStyle, topic, contentIdea } = body

  const systemPrompt = `You are an expert Instagram Reels hook creator. Generate 3 ready-to-use opening hooks for an Instagram Reel based on the user's business type, hook style, and target topic.
Return the output strictly in a valid JSON array format, where each item in the array has:
- "visual": Description of what to show on screen in the first 2-3 seconds (B-Roll description, max 12 words, in Chinese).
- "overlay": The text printed in big bold letters on the video screen overlay (Maximum 5-7 words, in Chinese).
- "audio": The voiceover/spoken opening line to say (1 short, high-energy sentence, in Chinese).

JSON output format:
[
  { "visual": "画面：...", "overlay": "...", "audio": "..." },
  { "visual": "画面：...", "overlay": "...", "audio": "..." },
  { "visual": "画面：...", "overlay": "...", "audio": "..." }
]
Never include any markdown backticks, conversational preamble, or explanation outside the JSON.`

  const promptMsg = `Business Type: ${businessType || 'F&B'}\nHook Style: ${hookStyle || 'Contra-Narrative'}\nTopic: ${topic || contentIdea || '我们的特色服务'}`

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
