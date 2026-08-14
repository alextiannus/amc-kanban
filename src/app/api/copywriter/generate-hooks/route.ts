import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { callGeminiChat } from '@/lib/gemini-chat'
import { buildBrandContext } from '@/lib/brandContextBuilder'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

const HOOK_STYLE_GUIDELINES: Record<string, string> = {
  'Contra-Narrative': '反向叙事 (Contra-Narrative)：打破常规认知或习惯，利用冲突制造悬念。例如：“别再盲目跟风点招牌了！”、“大家都以为点招牌最稳妥，其实懂行的全奔着...”',
  'Pain Point': '痛点打击 (Pain Point)：直击目标用户的日常生活烦恼、焦虑或不便，引出解决方案。例如：“天天吃油腻外卖，人都累了”、“大热天排队太遭罪？教你免排队秘诀”',
  'Curiosity Gap': '好奇心留白 (Curiosity Gap)：刻意隐瞒核心关键点或数字，引发受众往下看的欲望。例如：“为什么这道菜每天仅售10份？”、“只有来过5次以上的老熟客才知道的隐藏暗号...”',
  'Direct Value': '直接价值 (Direct Value)：开门见山直接给福利、省钱点单攻略或制作配方。例如：“50元吃饱三人的省钱点单攻略”、“3个步骤，教你在家复刻招牌”',
  'Social Proof': '社交背书 (Social Proof)：用真实的销售量、排行榜、回头客数据或群众热度作为权威背书。例如：“全网累计销量突破10万份”、“回头客比例高达85%的秘密”',
}

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  'F&B': '餐饮美食 (F&B)',
  'eCommerce': '线上电商 (eCommerce)',
  'Local Service': '本地生活/实体店铺 (Local Service)',
  'Beauty & Lifestyle': '美妆生活/时尚日常 (Beauty & Lifestyle)',
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { brandId, contentType, contentIdea, hookStyle, businessType } = body

  // 1. Brand access check — must happen before loading any brand context.
  // buildBrandContext() exposes private data (address, phone, competitors, creative identity);
  // a logged-in user who guesses another brand's ID must not receive that data.
  if (brandId) {
    const allowed = await canSessionAccessBrandProject(
      brandId,
      session.user.id,
      session.user.type ?? 'HUMAN',
      session.user.role
    )
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // 2. Fetch full 4-section brand context via buildBrandContext()
  let brandContext = ''
  if (brandId) {
    try {
      const ctx = await buildBrandContext(brandId)
      brandContext = ctx.contextText
    } catch (e) {
      console.warn('Failed to load brand context', e)
    }
  }

  // 2. Fetch specific guidelines for hook style
  const styleInstruction = hookStyle && HOOK_STYLE_GUIDELINES[hookStyle]
    ? `You MUST design the hooks following this framework: ${HOOK_STYLE_GUIDELINES[hookStyle]}`
    : 'Provide diverse hooks using dynamic opening structures.'

  const bizTypeInstruction = businessType && BUSINESS_TYPE_LABELS[businessType]
    ? `The business type is ${BUSINESS_TYPE_LABELS[businessType]}. Tailor the hooks to match this industry context.`
    : ''

  // Determine media instructions based on contentType ('video' vs 'photo')
  const mediaInstruction = contentType === 'video'
    ? `The content type is Video (Reels/Shorts/Video post). Visual design instructions should specify dynamic, high-engagement 3-second B-Roll action video instructions for the creator. The hook text should be optimized for video watch-time.`
    : `The content type is Photo/Carousel (图文/图片卡片). Visual design instructions should specify static image layout, graphic styling, or carousel slide visual instructions. The hook text should be optimized for image CTR.`

  const systemPrompt = `You are an elite Instagram/Xiaohongshu growth hacker and copywriter. Generate 3 highly engaging, high-conversion opening hook options.
Each hook MUST feel native, trendy, and deeply compelling for the target audience.

${styleInstruction}
${bizTypeInstruction}
${mediaInstruction}

Return the output strictly in a valid JSON array format, containing:
- "visual": Actionable visual/graphic/video instructions for the creator (in Chinese, max 15 words).
- "overlay": The bold, high-contrast text overlay to print on the video/image (in Chinese, max 7 words).
- "audio": The opening spoken/written caption line that hooks the audience (in Chinese, max 30 words, 1 short sentence).

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
