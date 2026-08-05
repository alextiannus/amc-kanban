import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey, encrypt } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { resolveBrandIdentity } from '@/lib/brandIdentity'

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

/**
 * POST /api/brands/[id]/copywriter/voice-stream
 *
 * Session handshake / initialization endpoint for the low-latency real-time voice gateway.
 * Returns the dynamically assembled system instructions (with brand knowledge & active skills),
 * a secure ephemeral session token, and the WebSocket gateway URL.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params
    const actor = await getActor(request)
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch brand and its active knowledge/companion skills
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: { knowledge: true, companionSkills: { where: { isEnabled: true } } },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    const identity = await resolveBrandIdentity(brandId)
    const identityTone = identity?.fields.brandTone.value
    const identityAudience = identity?.fields.targetAudience.value
    const identitySellingPoints = identity?.fields.sellingPoints.value

    // Build unified system prompt containing brand context and skills
    const k = brand.knowledge
    const menuText = k?.menuItems
      ? `菜单/产品：\n${(k.menuItems as any[]).map((m) => `- ${m.name}: ${m.description ?? ''}`).join('\n')}`
      : ''
    const slangText = k?.slangDict
      ? `本地用语：\n${Object.entries(k.slangDict as Record<string, string>).map(([a, b]) => `- "${a}": ${b}`).join('\n')}`
      : ''

    const skillsPrompts = brand.companionSkills?.map((s: any) => `[Skill: ${s.displayName}]\n${s.systemPrompt}`).join('\n\n') || ''

    const systemInstruction = [
      `你是品牌"${brand.name}"的专属 AI 营销伴侣（员工），用中英文混合方式沟通（中文为主，专业术语用英文）。`,
      `品牌简介：${brand.description ?? '优质餐厅品牌'}`,
      brand.location ? `位置：${brand.location}` : '',
      typeof identityTone === 'string' && identityTone ? `品牌风格：${identityTone}` : '',
      typeof identityAudience === 'string' && identityAudience ? `目标客群：${identityAudience}` : '',
      Array.isArray(identitySellingPoints) && identitySellingPoints.length ? `核心卖点：${identitySellingPoints.join('；')}` : '',
      menuText,
      slangText,
      skillsPrompts ? `\n\n=== 附加技能与规则 ===\n${skillsPrompts}` : '',
      `你可以主动调用工具查询数据或执行操作。对话要简洁、积极，如同一位得力的 AI 员工。`,
      `当 AI 听不懂用户意图时，回复："不好意思，您能再说一遍吗？"`,
      `\n=== 跑腿与物流服务执行规范 ===`,
      `- 当用户要求寄件、送文件、安排跑腿或查询配送时，你必须依次自动调用工具：`,
      `  1. 调用 dct-logistics__autocomplete_address 补全寄件地址（如提供的是邮编或简称）。`,
      `  2. 调用 dct-logistics__autocomplete_address 补全收件地址。`,
      `  3. 一旦获取到两端完整的地址和坐标，必须立即自动调用 dct-logistics__quote_flash_order 获取报价。不要在半途停下来向用户确认地址，必须在单次响应的 Loop 中一气呵成完成报价查询，最后把报价结果呈现给用户！`,
      `- 当用户同意下单、确认安排跑腿并选择 PayNow 支付后，你必须依次自动调用：`,
      `  1. 调用 dct-logistics__submit_flash_order 提交订单。`,
      `  2. 调用 dct-logistics__create_flash_order_payment 生成 PayNow 支付二维码。`,
      `  3. 将最终的支付状态和指引回复给用户，不用重复做前面的报价流程。`,
      `\n=== 媒体素材上传规范 ===`,
      `- 当用户表达需要上传照片、发视频、传图、打开相册、选择素材等指令时，你必须在回答末尾附带 <<ACTION:TRIGGER_UPLOAD>>，例如："好的，已为您打开相册，请选择您要上传的素材。<<ACTION:TRIGGER_UPLOAD>>"`,
    ]
      .filter(Boolean)
      .join('\n')

    // Generate secure session token
    const sessionToken = await encrypt({
      brandId,
      actorId: actor.id,
      role: actor.role,
      exp: Math.floor(Date.now() / 1000) + 3600 // Expire in 1 hour
    })

    // Construct WebSocket URL dynamically
    const host = request.headers.get('host') || 'localhost:3000'
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1')
    const protocol = isLocal ? 'ws' : 'wss'
    const wsUrl = `${protocol}://${host}/api/brands/${brandId}/copywriter/voice-stream/websocket`

    return NextResponse.json({
      status: 'success',
      systemInstruction,
      wsUrl,
      sessionToken
    })
  } catch (error: any) {
    console.error('[Voice Stream Handshake Error]:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
