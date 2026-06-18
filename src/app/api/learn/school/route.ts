import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'

const DEFAULT_SCHOOL_ITEMS = [
  // 1. Courses
  {
    type: 'COURSE',
    title: '课程 01：为什么同城实体店需要精细的社媒运营？',
    desc: '餐饮/零售行业的同城获客漏斗核心逻辑。',
    duration: '12m',
    level: 'entry'
  },
  {
    type: 'COURSE',
    title: '课程 02：新加坡平台玩法全解析',
    desc: 'Instagram, TikTok, 小红书, Google Maps 流量特点。',
    duration: '20m',
    level: 'entry'
  },
  {
    type: 'COURSE',
    title: '课程 03：如何使用手机拍出高质感产品图',
    desc: '日常光线、产品构图与成片调色教学。',
    duration: '15m',
    level: 'entry'
  },
  {
    type: 'COURSE',
    title: '课程 04：AI Marketing Crew 与主理人的黄金协作',
    desc: '解锁看板协作、要求输入与自动驾驶参数配置。',
    duration: '18m',
    level: 'entry'
  },
  {
    type: 'COURSE',
    title: '课程 05：剖析 Instagram 最新算法与同城流量分发机制',
    desc: '算法如何推送 Reels 视频，哪些标签能精准定位同城人群。',
    duration: '25m',
    level: 'advanced'
  },
  {
    type: 'COURSE',
    title: '课程 06：如何写出让本地消费者产生强烈购买欲的文案',
    desc: '掌握同城文案的痛点与吸睛钩子（Hooks），让您的产品文案极具吸引力与高转化率。',
    duration: '15m',
    level: 'advanced'
  },
  {
    type: 'COURSE',
    title: '课程 07：达人合作外联邀约与预算把控',
    desc: '如何利用 AI 准备的 Brief 和邀约文案，实现 90% 的意向合作率。',
    duration: '22m',
    level: 'advanced'
  },
  {
    type: 'COURSE',
    title: '课程 08：用 Google Maps 评论回写与星级裂变引流新客',
    desc: '全天候自动化差评拦截和好评模板生成，最大化搜索引擎权重。',
    duration: '30m',
    level: 'advanced'
  },

  // 2. Cases
  {
    type: 'CASE',
    title: 'Case 1: 一家新加坡独立设计师品牌 3 个月小红书自然涨粉 2,000 完整路径',
    desc: '通过每日捕获同城热度词并输出针对性产品穿搭/种草笔记，配合本地达人第一波置换。内容展现高质感生活方式，实现销售闭环。'
  },
  {
    type: 'CASE',
    title: 'Case 2: 精细化单条 Instagram Reels 短视频直接引流 500+ 笔产品订单复盘',
    desc: '拆解短视频的前 3 秒黄金 Hooks 设定，配合文案中限时优惠券及一键跳转下单的闭环设计。'
  },
  {
    type: 'CASE',
    title: 'Case 3: 差评与售后危机应对：如何利用 AI 评论守护让品牌评分在 6 个月内从 3.8 分攀升至 4.7 分',
    desc: '利用 Google Maps 及各大商户接口，实现 24 小时低分预警、关怀补偿，以及向五星好评自动回复答谢拉升搜索权重。'
  },

  // 3. Calendar
  {
    type: 'CALENDAR',
    date: '1月-2月',
    event: '农历华人新年 (Chinese New Year)',
    tip: '提前15天开始上线新年限定礼盒、新春大促推广。AI 建议：结合小红书喜庆排版发布礼盒开箱与主打产品种草视频。'
  },
  {
    type: 'CALENDAR',
    date: '4月-5月',
    event: '开斋节 (Hari Raya Puasa)',
    tip: '适合推出节日限定礼包和多元化本地社区故事推广。AI 建议：在 Instagram 强调本地化社区互动与温情故事。'
  },
  {
    type: 'CALENDAR',
    date: '6月',
    event: '端午节 (Dragon Boat Festival)',
    tip: '主推端午限定款产品、预售倒计时。AI 建议：在看板上传产品制作或包装过程视频素材，由 AI 自动剪辑生成预热脚本。'
  },
  {
    type: 'CALENDAR',
    date: '8月9日',
    event: '新加坡国庆节 (National Day)',
    tip: '全岛爱国狂欢日，主推国庆红白主题产品、限时买一送一或国庆专属折扣活动推广。'
  },
  {
    type: 'CALENDAR',
    date: '9月-10月',
    event: '中秋节 (Mid-Autumn Festival)',
    tip: '主推中秋联名/限定礼盒定制送礼活动。AI 建议：提前20天开启小红书种草预售。'
  },
  {
    type: 'CALENDAR',
    date: '12月25日',
    event: '圣诞节 (Christmas)',
    tip: '西方传统大节。主推圣诞限定礼品包、年终大促活动。AI 建议: 主打高质感节日氛围、暖色调视觉风格。'
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
    let count = await prisma.schoolItem.count()
    if (count === 0) {
      // Auto-seed defaults if empty
      await prisma.schoolItem.createMany({
        data: DEFAULT_SCHOOL_ITEMS
      })
    }
    const items = await prisma.schoolItem.findMany({
      orderBy: { createdAt: 'asc' }
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error('[GET /api/learn/school]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await checkAuth(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { type, title, desc, duration, level, date, event, tip } = body
    if (!type) {
      return NextResponse.json({ error: 'Missing required field: type (COURSE | CASE | CALENDAR)' }, { status: 400 })
    }

    if (!['COURSE', 'CASE', 'CALENDAR'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type. Must be COURSE, CASE, or CALENDAR' }, { status: 400 })
    }

    const newItem = await prisma.schoolItem.create({
      data: {
        type,
        title: title || null,
        desc: desc || null,
        duration: duration || null,
        level: level || null,
        date: date || null,
        event: event || null,
        tip: tip || null
      }
    })
    return NextResponse.json(newItem, { status: 201 })
  } catch (error) {
    console.error('[POST /api/learn/school]', error)
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

    await prisma.schoolItem.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/learn/school]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
