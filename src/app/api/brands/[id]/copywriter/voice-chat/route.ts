import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { callGeminiChat, ChatTurn, COMPANION_TOOLS } from '@/lib/gemini-chat'
import { submitDraftForDelivery } from '@/lib/draftSubmission'
import { postfastDeletePost } from '@/lib/integrations/postfast'
import { McpClientManager } from '@/lib/mcp/clientManager'

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
    if (toolName.includes('__')) {
      const response = await McpClientManager.executeTool(brandId, toolName, args)
      return { resultText: `MCP 工具调用成功！返回数据：\n${JSON.stringify(response, null, 2)}` }
    }

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
        // Approve = actually submit to Postfast (schedule or publish based on scheduledAt)
        // This replaces the old DB-only status update which left Postfast out of sync
        const { draftId, note } = args
        const result = await submitDraftForDelivery({
          brandId,
          draftId,
          actorId: 'voice-chat',
          forcePublish: true,
          note: note || '语音批准',
        })
        if (!result.ok) {
          return {
            resultText: `批准失败：${result.error}`,
            actionReply: `批准时出了些问题：${result.error}，请稍后再试。`,
          }
        }
        const mode = (result as any).mode
        const isScheduled = mode === 'scheduled' || mode === undefined && (result as any).draft?.status === 'scheduled'
        return {
          resultText: `草稿 ${draftId} 已批准并${isScheduled ? '安排排期' : '发布'}。`,
          actionReply: `好的，老板！内容已批准，${isScheduled ? '将按计划时间发布' : '现在已发布'}。${note ? `备注：${note}` : ''}`,
        }
      }

      case 'reschedule_draft': {
        const { draftId, scheduledAt } = args
        const newTime = new Date(scheduledAt)
        if (Number.isNaN(newTime.getTime())) {
          return { resultText: '无效的时间格式，请提供正确的日期时间。' }
        }

        // Load draft to check if it already has a Postfast post ID
        const draft = await prisma.contentDraft.findFirst({
          where: { id: draftId, brandId },
          include: { account: { select: { platformId: true, handle: true } } },
        })
        if (!draft) return { resultText: `找不到草稿 ${draftId}。` }

        const brand = await prisma.brand.findUnique({
          where: { id: brandId },
          select: { postfastApiKey: true },
        })

        // If already scheduled in Postfast, cancel old and re-schedule
        if (draft.platformPostId && brand?.postfastApiKey && draft.account?.handle !== 'unconfigured') {
          await postfastDeletePost(brand.postfastApiKey, draft.platformPostId)
          // Re-submit with the new time via submitDraftForDelivery after updating scheduledAt
          await prisma.contentDraft.update({
            where: { id: draftId },
            data: { scheduledAt: newTime, platformPostId: null, status: 'draft' },
          })
          const resubmit = await submitDraftForDelivery({
            brandId,
            draftId,
            actorId: 'voice-chat',
            forcePublish: true,
            note: `语音调整排期至 ${newTime.toLocaleString('zh-CN')}`,
          })
          if (!resubmit.ok) {
            return {
              resultText: `调整排期失败：${resubmit.error}`,
              actionReply: `调整时出了问题：${resubmit.error}，发布时间未更改。`,
            }
          }
        } else {
          // Not yet in Postfast — just update DB time
          await prisma.contentDraft.update({
            where: { id: draftId },
            data: { scheduledAt: newTime, updatedAt: new Date() },
          })
        }

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
  const encoder = new TextEncoder()
  const customStream = new ReadableStream({
    async start(controller) {
      try {
        const { id: brandId } = await params
        const actor = await getActor(request)
        if (!actor) {
          controller.enqueue(encoder.encode(JSON.stringify({ error: 'Unauthorized' }) + '\n'))
          controller.close()
          return
        }

        const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
        if (!ok) {
          controller.enqueue(encoder.encode(JSON.stringify({ error: 'Not found' }) + '\n'))
          controller.close()
          return
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
          controller.enqueue(encoder.encode(JSON.stringify({ error: 'message is required' }) + '\n'))
          controller.close()
          return
        }

        // Fetch brand + knowledge
        const brand = await prisma.brand.findUnique({
          where: { id: brandId },
          include: { knowledge: true, companionSkills: { where: { isEnabled: true } } },
        })

        if (!brand) {
          controller.enqueue(encoder.encode(JSON.stringify({ error: 'Brand not found' }) + '\n'))
          controller.close()
          return
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

        const skillsPrompts = brand.companionSkills?.map((s: any) => `[Skill: ${s.displayName}]\n${s.systemPrompt}`).join('\n\n') || ''

        const systemPrompt = [
          `你是品牌"${brand.name}"的专属 AI 营销伴侣（员工），用中英文混合方式沟通（中文为主，专业术语用英文）。`,
          `品牌简介：${brand.description ?? '优质餐厅品牌'}`,
          brand.location ? `位置：${brand.location}` : '',
          k?.brandTone ? `品牌风格：${k.brandTone}` : '',
          menuText,
          slangText,
          draftContext,
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
        ]
          .filter(Boolean)
          .join('\n')

        // Inject the user message (detect GENERATE_AND_PUBLISH intent first for compatibility)
        const generateKeywords = ['生成并发布', '帮我发布', '批量生成', '一键生成', '发布到所有', '帮我写并发']
        const wantsGenerate = generateKeywords.some((kw) => message.includes(kw))

        if (wantsGenerate) {
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'done',
            reply: '好的，老板！我马上为您批量生成内容并排期发布！',
            action: 'GENERATE_AND_PUBLISH'
          }) + '\n'))
          controller.close()
          return
        }

        // Fetch and merge remote MCP tools
        const extTools = await McpClientManager.aggregateExternalTools(brandId)
        const combinedTools = [
          ...COMPANION_TOOLS,
          ...extTools
        ]

        // Send initial progress update
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'status', message: '思考中...' }) + '\n'))

        // Call gemini-chat with history, tools, and the tool execution callback
        const result = await callGeminiChat(
          systemPrompt,
          history,
          message,
          true,
          500,
          combinedTools,
          async (toolName, toolArgs) => {
            let statusMsg = '正在处理...'
            if (toolName === 'dct-logistics__autocomplete_address') {
              statusMsg = `正在解析地址: ${toolArgs.input || ''}...`
            } else if (toolName === 'dct-logistics__quote_flash_order') {
              statusMsg = '正在计算跑腿计价与配送费...'
            } else if (toolName === 'dct-logistics__submit_flash_order') {
              statusMsg = '正在提交跑腿服务订单...'
            } else if (toolName === 'dct-logistics__create_flash_order_payment') {
              statusMsg = '正在生成 PayNow 支付二维码...'
            } else if (toolName === 'dct-logistics__query_flash_payment_status') {
              statusMsg = '正在查询支付状态...'
            } else if (toolName.includes('__')) {
              statusMsg = `正在调用工具: ${toolName.split('__')[1]}...`
            }

            console.log(`[streaming-status] sending status update: "${statusMsg}"`)
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'status', message: statusMsg }) + '\n'))

            const { resultText, actionReply } = await executeTool(toolName, toolArgs, brandId)
            return { resultText, actionReply }
          }
        )

        console.log('[voice-chat] callGeminiChat result:', JSON.stringify(result, null, 2))
        const finalReply = result.reply || '抱歉，我处理时遇到了些问题，请再说一遍。'

        controller.enqueue(encoder.encode(JSON.stringify({
          type: 'done',
          reply: finalReply,
          action: result.action || 'NONE',
          params: result.params || {},
        }) + '\n'))
        controller.close()
      } catch (error: any) {
        console.error('[Voice Chat API Error]:', error)
        controller.enqueue(encoder.encode(JSON.stringify({ error: error.message || 'Internal server error' }) + '\n'))
        controller.close()
      }
    }
  })

  return new Response(customStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    }
  })
}
