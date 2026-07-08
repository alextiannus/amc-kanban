import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canOwnBrand, canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { readBrandProfileMarkdown, writeBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'
import { callLLM } from '@/lib/llmRouter'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const { id } = await params

  // Support both cookie session (human owner) and Bearer API key (AI agent)
  if (session?.user) {
    if (!(await canOwnBrand(id, session.user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await canSessionAccessBrandProject(id, agent.id, 'AI_AGENT')
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const brand = await prisma.brand.findUnique({
      where: { id },
      select: { id: true, name: true }
    })
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
    const growthBaseUrl = process.env.AMC_GROWTH_API_URL || (isProd ? 'https://amc-growth.onrender.com' : 'http://localhost:4188')
    const token = process.env.AMC_KNOWLEDGE_TOKEN || ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    // 1. Fetch merchants list from AMC-growth
    const merchantsRes = await fetch(`${growthBaseUrl}/v1/merchants`, { headers })
    if (!merchantsRes.ok) {
      return NextResponse.json({ error: `Failed to fetch merchants from AMC-growth: ${merchantsRes.statusText}` }, { status: 502 })
    }
    const { merchants } = await merchantsRes.json()

    // 2. Find matching merchant
    const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/(^-|-$)/g, '')
    const brandSlug = slugify(brand.name)

    const merchant = merchants.find((m: any) => 
      m.name.toLowerCase() === brand.name.toLowerCase() ||
      m.merchant_id === brandSlug ||
      brand.name.toLowerCase().includes(m.name.toLowerCase()) ||
      m.name.toLowerCase().includes(brand.name.toLowerCase())
    )

    if (!merchant) {
      return NextResponse.json({ error: `No matching merchant found in AMC-growth for brand: "${brand.name}"` }, { status: 404 })
    }

    // 3. Fetch growth plan and profile for this merchant
    const [profileRes, planRes] = await Promise.all([
      fetch(`${growthBaseUrl}/v1/merchants/${merchant.merchant_id}/profile`, { headers }),
      fetch(`${growthBaseUrl}/v1/merchants/${merchant.merchant_id}/growth-plan`, { headers })
    ])

    if (!planRes.ok) {
      return NextResponse.json({ error: `Failed to fetch growth plan for merchant "${merchant.merchant_id}": ${planRes.statusText}` }, { status: 502 })
    }

    const growthProfile = profileRes.ok ? await profileRes.json().catch(() => null) : null
    const plan = await planRes.json()

    // 4. Format synced block
    const dateStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Singapore' })
    const phasesMarkdown = (plan.phases || []).map((phase: any) => `
#### ${phase.name}
${phase.content}
`).join('\n')

    const nextActionsMarkdown = (plan.next_actions || []).map((action: string) => `- ${action}`).join('\n')

    const growthPlanBlock = `<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:START -->
## 11. AMC Growth 智能规划 (同步于 ${dateStr})

### 11.1 品牌增长概览
${plan.summary || '暂无概览'}

### 11.2 品牌诊断与定位 (Diagnosis)
${plan.diagnosis || '暂无诊断'}

### 11.3 30/90/180天 规划 (Phases)
${phasesMarkdown}

### 11.4 核心内容需求 (Content Needs)
${plan.content_needs || '暂无核心内容需求'}

### 11.5 下一步行动 (Next Actions)
${nextActionsMarkdown}
<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:END -->`

    // 5. Read existing brand profile markdown
    const profile = await readBrandProfileMarkdown(id, { ensureExists: true })
    if (!profile) {
      return NextResponse.json({ error: 'Brand profile not found' }, { status: 404 })
    }

    let markdown = profile.markdown

    // 6. Use LLM to intelligently merge Growth plan into MANUAL section & extract DB fields
    const llmPrompt = `You are a professional brand strategy assistant. Your task is to sync and merge the brand intelligence plan from AMC Growth into the brand's profile markdown, and extract key fields to update the brand context database.

Existing Brand Profile Markdown:
"""
${markdown}
"""

AMC Growth Plan (Plan JSON):
"""
${JSON.stringify(plan, null, 2)}
"""

AMC Growth Merchant Profile (Profile JSON):
"""
${JSON.stringify(growthProfile, null, 2)}
"""

Instructions:
1. Maintain the exact markdown structure, especially all HTML comments markers (e.g. <!-- AMC:BRAND_PROFILE:MANUAL:START -->, <!-- AMC:BRAND_PROFILE:MANUAL:END -->, etc.). Do not alter or lose these tags.
2. Intelligently populate the fields in Section 10 ("## 10. 人工补充"). Extract relevant info from the Growth Plan/Profile (e.g., summary, diagnosis, next actions, category) and write it after the colon of each field.
   Fields to populate:
   - 使命 Mission:
   - 愿景 Vision:
   - 价值主张 Value Proposition:
   - 品牌人格 Personification:
   - 品牌色与辅助色:
   - 字体策略:
   - 图片/视频审美方向:
   - 禁止事项（违禁词、禁用视觉风格）:
   - 内容支柱（Content Pillars）:
   - 语气 Tone of Voice:
   - 目标客群细分与沟通方式:
   - 选题清单与热点策略:
   If a field already has user-input text that is meaningful, preserve it.
3. Keep the growth plan block "## 11. AMC Growth 智能规划" updated or append it.
4. Extract database fields:
   - description: A concise description or story of the brand (under 200 characters, summarizing the plan's summary, beginning with a tagline).
   - location: The location/area (e.g. "Yishun, Singapore").
   - phone: Contact phone number (if found in the profiles).
   - website: Website URL (if found).

Output must be in JSON format only. No markdown formatting, no backticks, no text before or after the JSON.
Format:
{
  "updatedMarkdown": "the complete updated markdown content",
  "dbFields": {
    "description": "tagline and summary",
    "location": "location",
    "phone": "phone or null",
    "website": "website or null"
  }
}`

    let updatedMarkdown = markdown
    let dbFields: any = {}

    try {
      const llmRes = await callLLM('copywriting', llmPrompt, 3000)
      if (llmRes.text) {
        let cleanedText = llmRes.text.trim()
        if (cleanedText.startsWith('```')) {
          cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
        }
        const parsed = JSON.parse(cleanedText)
        if (parsed.updatedMarkdown) {
          updatedMarkdown = parsed.updatedMarkdown
        }
        if (parsed.dbFields) {
          dbFields = parsed.dbFields
        }
      }
    } catch (llmErr) {
      console.warn('[sync-growth] LLM merge failed, falling back to simple append:', llmErr)
    }

    // If LLM failed to update markdown or we are using fallback, do the simple append for growth plan block
    if (updatedMarkdown === markdown) {
      const startTag = '<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:START -->'
      const endTag = '<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:END -->'
      const startIdx = markdown.indexOf(startTag)
      const endIdx = markdown.indexOf(endTag)

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        updatedMarkdown = `${markdown.slice(0, startIdx)}${growthPlanBlock}${markdown.slice(endIdx + endTag.length)}`
      } else {
        const manualEndTag = '<!-- AMC:BRAND_PROFILE:MANUAL:END -->'
        const manualEndIdx = markdown.indexOf(manualEndTag)
        if (manualEndIdx !== -1) {
          updatedMarkdown = `${markdown.slice(0, manualEndIdx)}\n${growthPlanBlock}\n${markdown.slice(manualEndIdx)}`
        } else {
          updatedMarkdown = `${markdown.trim()}\n\n${growthPlanBlock}\n`
        }
      }
    }

    // Write back updated markdown
    await writeBrandProfileMarkdown(id, updatedMarkdown)

    // Update database fields
    // Also use plan.summary as default description fallback if dbFields didn't return one
    const finalDesc = dbFields.description || plan.summary
    const finalLocation = dbFields.location || (growthProfile?.area ? growthProfile.area : null)
    
    await prisma.brand.update({
      where: { id: brand.id },
      data: {
        ...(finalDesc && { description: finalDesc }),
        ...(finalLocation && { location: finalLocation }),
        ...(dbFields.phone && { phone: dbFields.phone }),
        ...(dbFields.website && { website: dbFields.website })
      }
    })

    return NextResponse.json({
      ok: true,
      synced: true,
      merchantId: merchant.merchant_id,
      merchantName: merchant.name
    })

  } catch (error: any) {
    console.error('Error syncing growth plan:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
