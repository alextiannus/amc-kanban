import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'

const DEFAULT_FAQS = [
  {
    category: 'accounts',
    q: '为什么手动添加的账号无法用于内容发布？',
    a: '手动添加账号（填写账号密码）仅用于本地前台自动化运行脚本及数据爬取使用（例如模拟前台自然点击以规避风控，安全免封）。要使 AI 虚拟员工能够自动发帖和进行日历排程，必须在集成配置中填入您的 PostFast API Key，并通过官方 OAuth 流程授权绑定。',
    tag: '账号与接入'
  },
  {
    category: 'accounts',
    q: 'PostFast OAuth 授权的正确步骤是什么？',
    a: '步骤一：在看板聊天框向 AI 发送指令“帮我生成 PostFast 账号绑定链接”；步骤二：点击 AI 返回的专属链接，在 PostFast 页面中选择对应渠道授权；步骤三：授权完毕后，返回 AMC 控制台刷新或重新保存配置，账号即自动同步出现。具体步骤详见使用手册 SOP-001。',
    tag: '账号与接入'
  },
  {
    category: 'accounts',
    q: '支持哪些社交平台？',
    a: '目前系统全面支持小红书、Instagram、Facebook、TikTok、Google Business Profile (GBP)、Yelp 等主流平台账号的发布管理、数据监控或评论回复。',
    tag: '账号与接入'
  },
  {
    category: 'accounts',
    q: '账号断连了怎么办？',
    a: '如果由于 OAuth 令牌过期导致账号断开连接，您只需前往“集成配置”页面，在对应账号后点击“重新授权”，按照提示完成 PostFast 重新授权即可。详见 SOP-002。',
    tag: '账号与接入'
  },
  {
    category: 'posts',
    q: 'AMC 多久发布一次内容？',
    a: 'AI 员工会根据您在设置中配置的“每日发帖容量上限”以及素材库中打上“排期发布”标签的素材，自动进行推文排版和日历排程。通常在各社交平台的流量高峰时间段由 AI 触发自动发送。',
    tag: '内容发布'
  },
  {
    category: 'posts',
    q: '我需要审核每一条内容吗？',
    a: '这完全取决于您的发布模式。在“老板审批”模式下，AI 创作的每一篇草稿都会以 pending_review 状态死锁在看板上，生成 require_input 任务，必须由主理人手动确认；在“自动驾驶”模式下，AI 员工会在文案符合品牌调性阈值后自动排期发布。',
    tag: '内容发布'
  },
  {
    category: 'posts',
    q: '如何修改已排期的内容？',
    a: '您可以在看板或内容日历中找到已排期的内容卡片，点击进入详情页，可直接修改文案、图片或调整发布时间，保存后系统会自动同步更新。',
    tag: '内容发布'
  },
  {
    category: 'posts',
    q: '发布失败了怎么处理？',
    a: '可在看板上点击查看失败的任务卡片以获取详细报错日志。最常见的原因是社交账号的 OAuth 令牌过期导致断连，请执行 SOP-002 重新授权后，在任务卡片上点击“重试发布”即可重新排队发送。',
    tag: '内容发布'
  },
  {
    category: 'influencers',
    q: '达人探店/合作，谁来负责执行？',
    a: '为了确保品牌定位与现场配合的绝对掌控，达人合作与到店体验由主理人在线下完全自主发起和安排（包括达人筛选、沟通邀约、现场接待以及费用结算）。AMC 的 AI 虚拟员工不参与达人的评估筛选，仅在预设的推广节点在看板上自动生成 require_input 状态的任务卡片，向您收集现场拍摄的照片或视频素材。',
    tag: '达人探店'
  },
  {
    category: 'influencers',
    q: 'AMC 协助筛选达人吗？',
    a: 'AMC 系统不负责达人筛选、甄别与外联邀约。该决策权和执行过程完全交给主理人，主理人可结合本地趋势自主挑选最契合品牌的达人伙伴。在达人产出素材后，您可以直接将照片或视频上传至看板任务，由 AI 协助内容排版。',
    tag: '达人探店'
  },
  {
    category: 'influencers',
    q: '达人费用如何结算？',
    a: '所有的合作形式（如免费产品置换或付现合作）及费用结算完全由主理人与达人在线下直接商定和执行。AMC 订阅套餐仅覆盖系统功能使用、AI Agent 运营编排及自动化发布，不包含支付给达人的合作费用。',
    tag: '达人探店'
  },
  {
    category: 'influencers',
    q: '探店素材如何上传与发布？',
    a: '当看板上出现标红的 Require Input 达人探店素材上传任务时，点击卡片并将收集的高清图片与短视频素材上传。点击 Resume 确认后，AI 虚拟员工将自动进行小红书/Instagram 等多平台推文编写、Hashtags 匹配与排期发布。',
    tag: '达人探店'
  },
  {
    category: 'billing',
    q: '三个套餐的核心区别是什么？',
    a: 'Essential（基础版）仅提供核心发帖与看板协作；Growth（增长版）新增了自动处理 Google Review / 同城趋势监控及支持探店素材收集发布功能；Scale（规模版）额外支持多门店管理、深度品牌 Memory 自动巡检和定制化 AI 能力。',
    tag: '订阅与账单'
  },
  {
    category: 'billing',
    q: '中途升级套餐如何操作？',
    a: '您可以在任意时间进入设置中心 ➜ 订阅计划中点击升级。系统会自动按当前账期剩余天数折算费用，并立即解锁高级功能。',
    tag: '订阅与账单'
  },
  {
    category: 'billing',
    q: '创始会员优惠如何申请？',
    a: '如果您是受邀参与测试的创始会员，可在支付页面输入您的专属激活码，或联系 AMC 客服进行人工审核并申请续费折扣。',
    tag: '订阅与账单'
  },
  {
    category: 'reports',
    q: '月度报告包含哪些数据？',
    a: '月度报告汇总了各平台的总触达（Reach）、总互动率（Engagement Rate）、粉丝净增长、Google 评分变化、以及排名前 5 的爆款贴文。',
    tag: '数据与报告'
  },
  {
    category: 'reports',
    q: '如何查看单条内容的表现？',
    a: '在主控面板的“数据报告”区域或“已发布”任务卡片中，点击具体的推文，即可查看其在对应平台上的实时点赞、分享、评论 and 曝光数据。',
    tag: '数据与报告'
  },
  {
    category: 'reports',
    q: '数据多久更新一次？',
    a: '系统通过 PostFast 及各大平台的 API 接口，每日晚上自动拉取并更新前一日的最新互动与曝光数据。',
    tag: '数据与报告'
  }
]

async function checkAuth(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  if (apiKey && !authenticatedAgent) {
    return { ok: false, status: 401, error: 'Invalid API key' }
  }

  return { ok: true, user: session?.user || authenticatedAgent }
}

export async function GET() {
  try {
    let count = await prisma.faqItem.count()
    if (count === 0) {
      // Auto-seed defaults if empty
      await prisma.faqItem.createMany({
        data: DEFAULT_FAQS
      })
    }
    const faqs = await prisma.faqItem.findMany({
      orderBy: { createdAt: 'asc' }
    })
    return NextResponse.json(faqs)
  } catch (error) {
    console.error('[GET /api/learn/faq]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await checkAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { category, q, a, tag } = await request.json()
    if (!category || !q || !a || !tag) {
      return NextResponse.json({ error: 'Missing required fields: category, q, a, tag' }, { status: 400 })
    }

    const newFaq = await prisma.faqItem.create({
      data: {
        category,
        q,
        a,
        tag
      }
    })
    return NextResponse.json(newFaq, { status: 201 })
  } catch (error) {
    console.error('[POST /api/learn/faq]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await checkAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    let id = searchParams.get('id')

    if (!id) {
      // fallback to reading from body
      try {
        const body = await request.json()
        id = body?.id
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 })
    }

    await prisma.faqItem.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/learn/faq]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
