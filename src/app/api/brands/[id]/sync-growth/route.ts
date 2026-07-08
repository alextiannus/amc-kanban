import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canOwnBrand, canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { readBrandProfileMarkdown, writeBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'

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

    const growthBaseUrl = process.env.AMC_GROWTH_API_URL || 'http://localhost:4188'
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

    // 3. Fetch growth plan for this merchant
    const planRes = await fetch(`${growthBaseUrl}/v1/merchants/${merchant.merchant_id}/growth-plan`, { headers })
    if (!planRes.ok) {
      return NextResponse.json({ error: `Failed to fetch growth plan for merchant "${merchant.merchant_id}": ${planRes.statusText}` }, { status: 502 })
    }
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
    const startTag = '<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:START -->'
    const endTag = '<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:END -->'

    const startIdx = markdown.indexOf(startTag)
    const endIdx = markdown.indexOf(endTag)

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      // Replace existing block
      markdown = `${markdown.slice(0, startIdx)}${growthPlanBlock}${markdown.slice(endIdx + endTag.length)}`
    } else {
      // Append before MANUAL_END tag if exists, otherwise at the end
      const manualEndTag = '<!-- AMC:BRAND_PROFILE:MANUAL:END -->'
      const manualEndIdx = markdown.indexOf(manualEndTag)
      if (manualEndIdx !== -1) {
        markdown = `${markdown.slice(0, manualEndIdx)}\n${growthPlanBlock}\n${markdown.slice(manualEndIdx)}`
      } else {
        markdown = `${markdown.trim()}\n\n${growthPlanBlock}\n`
      }
    }

    // 6. Write back to disk
    await writeBrandProfileMarkdown(id, markdown)

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
