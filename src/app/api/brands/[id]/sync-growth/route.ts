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

    // 3. Fetch growth plan, profile, and presentation for this merchant
    const [profileRes, planRes, presentationRes] = await Promise.all([
      fetch(`${growthBaseUrl}/v1/merchants/${merchant.merchant_id}/profile`, { headers }),
      fetch(`${growthBaseUrl}/v1/merchants/${merchant.merchant_id}/growth-plan`, { headers }),
      fetch(`${growthBaseUrl}/v1/merchants/${merchant.merchant_id}/presentation`, { headers })
    ])

    if (!planRes.ok) {
      return NextResponse.json({ error: `Failed to fetch growth plan for merchant "${merchant.merchant_id}": ${planRes.statusText}` }, { status: 502 })
    }

    const growthProfile = profileRes.ok ? await profileRes.json().catch(() => null) : null
    const plan = await planRes.json()
    const presentation = presentationRes.ok ? await presentationRes.json().catch(() => null) : null

    // 4. Format synced blocks
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

    let growthContextBlock = ''
    if (growthProfile) {
      growthContextBlock = `<!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:START -->
## 8. AMC Growth 品牌故事与上下文 (同步于 ${dateStr})

### 8.1 基础信息
${growthProfile.basic_info || '暂无基础信息'}

### 8.2 老板目标
${growthProfile.targets || '暂无老板目标'}

### 8.3 当前痛点
${growthProfile.pain_points || '暂无当前痛点'}

### 8.4 核心产品假设
${growthProfile.product_assumptions || '暂无核心产品假设'}

### 8.5 主要客群假设
${growthProfile.audience_assumptions || '暂无主要客群假设'}

### 8.6 核心战略诊断
${growthProfile.diagnosis || '暂无核心战略诊断'}

### 8.7 服务范围说明
${growthProfile.service_scope || '暂无服务范围说明'}
<!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:END -->`
    }

    let presentationBlock = ''
    if (presentation && presentation.slides) {
      presentationBlock = `<!-- AMC:BRAND_PROFILE:PRESENTATION_SLIDES:START -->
${JSON.stringify(presentation.slides, null, 2)}
<!-- AMC:BRAND_PROFILE:PRESENTATION_SLIDES:END -->`
    }

    // 5. Read existing brand profile markdown
    const profile = await readBrandProfileMarkdown(id, { ensureExists: true })
    if (!profile) {
      return NextResponse.json({ error: 'Brand profile not found' }, { status: 404 })
    }

    let updatedMarkdown = profile.markdown

    // Synchronously execute fast simple merge to avoid browser timeout
    // 1. Merge GROWTH_CONTEXT block
    if (growthContextBlock) {
      const contextStartTag = '<!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:START -->'
      const contextEndTag = '<!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:END -->'
      const contextStartIdx = updatedMarkdown.indexOf(contextStartTag)
      const contextEndIdx = updatedMarkdown.indexOf(contextEndTag)

      if (contextStartIdx !== -1 && contextEndIdx !== -1 && contextEndIdx > contextStartIdx) {
        updatedMarkdown = `${updatedMarkdown.slice(0, contextStartIdx)}${growthContextBlock}${updatedMarkdown.slice(contextEndIdx + contextEndTag.length)}`
      } else {
        const manualEndTag = '<!-- AMC:BRAND_PROFILE:MANUAL:END -->'
        const manualEndIdx = updatedMarkdown.indexOf(manualEndTag)
        if (manualEndIdx !== -1) {
          updatedMarkdown = `${updatedMarkdown.slice(0, manualEndIdx)}\n${growthContextBlock}\n${updatedMarkdown.slice(manualEndIdx)}`
        } else {
          updatedMarkdown = `${updatedMarkdown.trim()}\n\n${growthContextBlock}\n`
        }
      }
    }

    // 2. Merge GROWTH_PLAN block
    if (growthPlanBlock) {
      const planStartTag = '<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:START -->'
      const planEndTag = '<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:END -->'
      const planStartIdx = updatedMarkdown.indexOf(planStartTag)
      const planEndIdx = updatedMarkdown.indexOf(planEndTag)

      if (planStartIdx !== -1 && planEndIdx !== -1 && planEndIdx > planStartIdx) {
        updatedMarkdown = `${updatedMarkdown.slice(0, planStartIdx)}${growthPlanBlock}${updatedMarkdown.slice(planEndIdx + planEndTag.length)}`
      } else {
        const manualEndTag = '<!-- AMC:BRAND_PROFILE:MANUAL:END -->'
        const manualEndIdx = updatedMarkdown.indexOf(manualEndTag)
        if (manualEndIdx !== -1) {
          updatedMarkdown = `${updatedMarkdown.slice(0, manualEndIdx)}\n${growthPlanBlock}\n${updatedMarkdown.slice(manualEndIdx)}`
        } else {
          updatedMarkdown = `${updatedMarkdown.trim()}\n\n${growthPlanBlock}\n`
        }
      }
    }

    // 3. Merge PRESENTATION_SLIDES block
    if (presentationBlock) {
      const presStartTag = '<!-- AMC:BRAND_PROFILE:PRESENTATION_SLIDES:START -->'
      const presEndTag = '<!-- AMC:BRAND_PROFILE:PRESENTATION_SLIDES:END -->'
      const presStartIdx = updatedMarkdown.indexOf(presStartTag)
      const presEndIdx = updatedMarkdown.indexOf(presEndTag)

      if (presStartIdx !== -1 && presEndIdx !== -1 && presEndIdx > presStartIdx) {
        updatedMarkdown = `${updatedMarkdown.slice(0, presStartIdx)}${presentationBlock}${updatedMarkdown.slice(presEndIdx + presEndTag.length)}`
      } else {
        const manualEndTag = '<!-- AMC:BRAND_PROFILE:MANUAL:END -->'
        const manualEndIdx = updatedMarkdown.indexOf(manualEndTag)
        if (manualEndIdx !== -1) {
          updatedMarkdown = `${updatedMarkdown.slice(0, manualEndIdx)}\n${presentationBlock}\n${updatedMarkdown.slice(manualEndIdx)}`
        } else {
          updatedMarkdown = `${updatedMarkdown.trim()}\n\n${presentationBlock}\n`
        }
      }
    }

    // Write back updated markdown file immediately
    await writeBrandProfileMarkdown(id, updatedMarkdown)

    // Update database fields with direct synced values
    const finalDesc = plan.summary
    const finalLocation = growthProfile?.area ? growthProfile.area : null
    
    await prisma.brand.update({
      where: { id: brand.id },
      data: {
        ...(finalDesc && { description: finalDesc }),
        ...(finalLocation && { location: finalLocation }),
        ...(growthProfile?.phone && { phone: growthProfile.phone }),
        ...(growthProfile?.website && { website: growthProfile.website })
      }
    })

    // 6. Trigger LLM smart merge in the background (asynchronously) to populate manual Section 10 fields
    const llmPrompt = `You are a professional brand strategy assistant. Your task is to sync and merge the brand intelligence plan and context from AMC Growth into the brand's profile markdown, and extract key fields to update the brand context database.

Existing Brand Profile Markdown:
"""
${updatedMarkdown}
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
1. Maintain the exact markdown structure, especially all HTML comments markers (e.g. <!-- AMC:BRAND_PROFILE:MANUAL:START -->, <!-- AMC:BRAND_PROFILE:MANUAL:END -->, <!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:START -->, <!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:END -->, <!-- AMC:BRAND_PROFILE:GROWTH_PLAN:START -->, <!-- AMC:BRAND_PROFILE:GROWTH_PLAN:END -->). Do not alter or lose these tags.
2. Update the brand context block "## 8. AMC Growth 品牌故事与上下文" enclosed in "<!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:START -->" and "<!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:END -->" markers. Use the parsed sections from the AMC Growth Merchant Profile JSON.
3. Update the growth plan block "## 11. AMC Growth 智能规划" enclosed in "<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:START -->" and "<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:END -->" markers.
4. Intelligently populate the fields in Section 10 ("## 10. 人工补充"). Extract relevant info from the Growth Plan/Profile (e.g., summary, diagnosis, next actions, category) and write it after the colon of each field if it's currently empty. If a field already has user-input text that is meaningful, preserve it.
5. Extract database fields:
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

    const runLlmMergeInBackground = async () => {
      try {
        const llmRes = await callLLM('copywriting', llmPrompt, 3000)
        if (llmRes.text) {
          let cleanedText = llmRes.text.trim()
          if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
          }
          const parsed = JSON.parse(cleanedText)
          if (parsed.updatedMarkdown) {
            await writeBrandProfileMarkdown(id, parsed.updatedMarkdown)
          }
          if (parsed.dbFields) {
            await prisma.brand.update({
              where: { id: brand.id },
              data: {
                ...(parsed.dbFields.description && { description: parsed.dbFields.description }),
                ...(parsed.dbFields.location && { location: parsed.dbFields.location }),
                ...(parsed.dbFields.phone && { phone: parsed.dbFields.phone }),
                ...(parsed.dbFields.website && { website: parsed.dbFields.website })
              }
            })
          }
          console.log(`[sync-growth] Background LLM merge completed successfully for brand: ${id}`)
        }
      } catch (llmErr) {
        console.error('[sync-growth] Background LLM merge failed:', llmErr)
      }
    }

    // Fire and forget
    runLlmMergeInBackground().catch(e => console.error('[sync-growth] Background task error:', e))

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
