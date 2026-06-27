import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { callGeminiChat, ChatTurn } from '@/lib/gemini-chat'

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
 * Execute a tool call on the server after Gemini requests it.
 * Returns a human-readable result string to be sent back to Gemini.
 */
async function executeTool(
  toolName: string,
  args: Record<string, any>,
  brandId: string,
): Promise<{ resultText: string; actionReply?: string }> {
  try {
    switch (toolName) {
      case 'get_calendar_events': {
        const now = new Date()
        let start: Date
        let end: Date

        if (args.period === 'today') {
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
        } else if (args.period === 'this_week') {
          const day = now.getDay()
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
          end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
        } else {
          start = new Date(now.getFullYear(), now.getMonth(), 1)
          end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        }

        const drafts = await prisma.contentDraft.findMany({
          where: {
            brandId,
            status: { in: ['scheduled', 'done'] },
            scheduledAt: { gte: start, lt: end },
          },
          select: { platform: true, scheduledAt: true, status: true, caption: true },
          orderBy: { scheduledAt: 'asc' },
          take: 20,
        })

        if (drafts.length === 0) {
          return { resultText: `该时段内没有排期内容。` }
        }

        const summary = drafts
          .map(
            (d: { platform: string; caption: string | null; status: string; scheduledAt: Date | null }) =>
              `${d.platform}: "${d.caption?.slice(0, 40)}..." (${d.status}, ${d.scheduledAt?.toLocaleDateString('zh-CN') ?? '未排期'})`,
          )
          .join('\n')
        return { resultText: `查询结果：\n${summary}` }
      }

      case 'get_action_items': {
        const items = await prisma.actionItem.findMany({
          where: { brandId, status: { in: ['PENDING', 'AWAITING_APPROVAL'] } },
          select: { id: true, type: true, description: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })

        if (items.length === 0) {
          return { resultText: '目前没有待处理事项，一切就绪！' }
        }

        const summary = items
          .map((i: { id: string; type: string; description: string | null; createdAt: Date }) => `- [${i.type}] ${i.description?.slice(0, 60) ?? ''}`)
          .join('\n')
        return { resultText: `有 ${items.length} 个待处理事项：\n${summary}` }
      }

      case 'approve_draft': {
        const { draftId, note } = args
        await prisma.contentDraft.update({
          where: { id: draftId },
          data: {
            status: 'scheduled',
            updatedAt: new Date(),
          },
        })
        return {
          resultText: `草稿 ${draftId} 已批准。`,
          actionReply: `好的，老板！内容已批准，将按计划时间发布。${note ? `备注已记录：${note}` : ''}`,
        }
      }

      case 'reschedule_draft': {
        const { draftId, scheduledAt } = args
        const newTime = new Date(scheduledAt)
        await prisma.contentDraft.update({
          where: { id: draftId },
          data: { scheduledAt: newTime, updatedAt: new Date() },
        })
        const timeStr = newTime.toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        return {
          resultText: `草稿 ${draftId} 已调整发布时间至 ${timeStr}。`,
          actionReply: `好的！发布时间已更新为 ${timeStr}，请放心。`,
        }
      }

      case 'reject_draft': {
        const { draftId, reason } = args
        await prisma.contentDraft.update({
          where: { id: draftId },
          data: { status: 'draft', updatedAt: new Date() },
        })
        return {
          resultText: `草稿 ${draftId} 已标记为退回。原因：${reason ?? '用户要求修改'}`,
          actionReply: `收到，老板！我来重新写一版${reason ? `，根据您的意见：${reason}` : ''}。`,
        }
      }

      default:
        return { resultText: '未知工具调用。' }
    }
  } catch (err) {
    console.error(`[voice-chat] Tool execution error (${toolName}):`, err)
    return { resultText: '操作执行时遇到错误，请稍后再试。' }
  }
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

    const body = await request.json().catch(() => ({}))
    const {
      message,
      history = [],
      context = {},
    } = body as {
      message?: string
      history?: ChatTurn[]
      context?: {
        activeDraftId?: string
        pendingDraftIds?: string[]
      }
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // Fetch brand + knowledge
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: { knowledge: true },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Build system prompt
    const k = brand.knowledge
    const menuText = k?.menuItems
      ? `菜单/产品：\n${(k.menuItems as any[]).map((m) => `- ${m.name}: ${m.description ?? ''}`).join('\n')}`
      : ''
    const slangText = k?.slangDict
      ? `本地用语：\n${Object.entries(k.slangDict as Record<string, string>).map(([a, b]) => `- "${a}": ${b}`).join('\n')}`
      : ''
    const draftContext = context.activeDraftId
      ? `当前正在讨论的草稿 ID: ${context.activeDraftId}`
      : context.pendingDraftIds?.length
      ? `待审批草稿 IDs: ${context.pendingDraftIds.join(', ')}`
      : ''

    const systemPrompt = [
      `你是品牌"${brand.name}"的专属 AI 营销伴侣（员工），用中英文混合方式沟通（中文为主，专业术语用英文）。`,
      `品牌简介：${brand.description ?? '优质餐厅品牌'}`,
      brand.location ? `位置：${brand.location}` : '',
      k?.brandTone ? `品牌风格：${k.brandTone}` : '',
      menuText,
      slangText,
      draftContext,
      `你可以主动调用工具查询数据或执行操作。对话要简洁、积极，如同一位得力的 AI 员工。`,
      `当 AI 听不懂用户意图时，回复："不好意思，您能再说一遍吗？"`,
    ]
      .filter(Boolean)
      .join('\n')

    // Inject the user message (detect GENERATE_AND_PUBLISH intent first for compatibility)
    const generateKeywords = ['生成并发布', '帮我发布', '批量生成', '一键生成', '发布到所有', '帮我写并发']
    const wantsGenerate = generateKeywords.some((kw) => message.includes(kw))

    if (wantsGenerate) {
      return NextResponse.json({ reply: '好的，老板！我马上为您批量生成内容并排期发布！', action: 'GENERATE_AND_PUBLISH' })
    }

    // Call gemini-chat with history and tools
    const result = await callGeminiChat(systemPrompt, history, message)

    // If Gemini made a tool call, execute it and get a follow-up reply
    if (result.toolCallName && result.toolCallArgs) {
      const { resultText, actionReply } = await executeTool(result.toolCallName, result.toolCallArgs, brandId)

      // If the tool has a predefined reply (e.g., approve/reject), use it directly
      if (actionReply) {
        return NextResponse.json({
          reply: actionReply,
          action: result.action,
          params: result.params,
        })
      }

      // Otherwise, send tool result back to Gemini for a natural language reply
      const followUpHistory: ChatTurn[] = [
        ...history.slice(-10),
        { role: 'user', content: message },
        { role: 'model', content: `[Tool: ${result.toolCallName}]` },
        { role: 'user', content: `工具执行结果：${resultText}` },
      ]

      const followUp = await callGeminiChat(systemPrompt, followUpHistory, '请根据以上工具结果，用自然语言简洁地回答用户。', false)
      return NextResponse.json({
        reply: followUp.reply || resultText,
        action: result.action,
        params: result.params,
      })
    }

    return NextResponse.json({
      reply: result.reply,
      action: result.action || 'NONE',
      params: result.params,
    })
  } catch (error: any) {
    console.error('[Voice Chat API Error]:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
