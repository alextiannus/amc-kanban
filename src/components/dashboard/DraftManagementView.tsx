'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  FileText,
  Grid2X2,
  Layers3,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Trash2,
  Tag,
  Users,
  X,
  Play,
  Video,
  Link,
  Loader2,
  Sparkles,
  Zap,
  Image as ImageIcon,
  Wand2,
  Maximize2,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  ThumbsUp,
  Star,
  Globe,
  Store,
} from 'lucide-react'
import PostPreviewModal from './PostPreviewModal'
import { callGeminiDirect } from '@/lib/gemini-direct'

function isVideoUrl(url: string): boolean {
  if (!url) return false
  const path = url.split('?')[0]
  return /\.(mp4|mov|avi|webm|ogg|m4v|3gp)(?:\?.*)?$/i.test(path)
}

type DraftItem = {
  id: string
  status: string
  caption: string
  hashtags: string[]
  mediaUrls: string[]
  scheduledAt?: string | null
  platformPostId?: string | null
  publishedAt?: string | null
  postUrl?: string | null
  createdAt?: string | null
  updatedAt: string
  agentNote?: string | null
  rejectionNote?: string | null
  creativeHooks?: string | null
  accountId?: string | null
  account?: {
    id: string
    platformId: string
    handle?: string | null
    displayName?: string | null
  } | null
  assetRefs: Array<{
    id: string
    asset: {
      id: string
      filename?: string | null
      url?: string | null
      type: string
    }
  }>
}

type SocialAccountOption = {
  id: string
  platformId: string
  handle?: string | null
  displayName?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Pending approval',
  approved: 'Approved',
  scheduled: 'Scheduled',
  published: 'Published',
  rejected: 'Rejected',
  failed: 'Failed',
}

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/60',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/60',
  published: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/60',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/60',
  failed: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/60',
}

const TAB_CONFIG = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_review', label: 'Pending approval' },
] as const

type TabKey = (typeof TAB_CONFIG)[number]['key']

function formatTags(tags: string[]) {
  return tags.join(', ')
}

function parseTags(value: string) {
  return value
    .split(/[#,，,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null
}

function draftTimestamp(draft: DraftItem) {
  return draft.publishedAt || draft.scheduledAt || draft.updatedAt || draft.createdAt || new Date().toISOString()
}

function formatDateHeading(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unscheduled'
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function formatCardTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function platformLabel(platformId?: string | null) {
  if (!platformId) return 'Channel'
  const lower = platformId.toLowerCase()
  if (['red', 'xhs', 'xiaohongshu', 'rednote'].includes(lower)) return '小红书'
  return platformId.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function platformBadgeClass(platformId?: string | null) {
  const normalized = (platformId || '').toLowerCase()
  if (normalized.includes('instagram')) return 'bg-pink-50 text-pink-700 border-pink-100 dark:bg-pink-950/30 dark:text-pink-300 dark:border-pink-900/60'
  if (normalized.includes('facebook')) return 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/60'
  if (normalized.includes('google')) return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60'
  if (normalized.includes('tiktok')) return 'bg-slate-900 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-200'
  return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
}

function accountInitial(draft: DraftItem) {
  const name = draft.account?.displayName || draft.account?.handle || draft.account?.platformId || 'P'
  return name.trim().charAt(0).toUpperCase() || 'P'
}

function mediaForDraft(draft: DraftItem) {
  const assetUrls = draft.assetRefs.map((ref) => ref.asset.url).filter((url): url is string => Boolean(url))
  return [...draft.mediaUrls, ...assetUrls].filter((url): url is string => Boolean(url)).slice(0, 4)
}

function getFallbackHooks(businessType: string, hookStyle: string, topic: string) {
  const t = topic || '我们的特色服务'
  const db: Record<string, Record<string, Array<{ visual: string; overlay: string; audio: string }>>> = {
    'F&B': {
      'Contra-Narrative': [
        { visual: '镜头快速对准一盘色泽诱人的美食，旁边放着调味罐', overlay: '别再盲目跟风点招牌了！', audio: '大家都以为点招牌最稳妥，其实懂行的老饕全奔着这道菜的秘制底料来！' },
        { visual: '博主夹起一块肉，展示鲜嫩多汁的切面', overlay: '千万别在晚上十点看这个...', audio: '如果你正在减肥或者饿肚子，千万别点开，我怕你直接点开外卖下单。' },
        { visual: '快速切过主厨手工拉面或揉面团的动作，汗水特写', overlay: '你以为这只是普通手工菜？', audio: '别被它简单的外表骗了，主厨揉面300次才换来这一口极致的弹牙。' }
      ],
      'Pain Point': [
        { visual: '展示一个人面对油腻快餐盒、叹气的特写', overlay: '天天吃油腻外卖，人都累了', audio: '别再用油腻高盐的外卖应付胃了，今天这道轻食招牌让你美味与健康兼得。' },
        { visual: '展示长长的排队人潮，烈日下烦躁的顾客', overlay: '排队两小时，真不值得！', audio: '大热天排队太遭罪？关注我，今天教你如何提前五分钟线上一键预约免排队！' },
        { visual: '对比干巴巴的速冻水饺和新鲜手工包制水饺', overlay: '速冻食品吃不出家的味道', audio: '别再吃那些冰柜里冻了半年的食品了，来尝尝每天早晨现宰肉现包的鲜美。' }
      ],
      'Curiosity Gap': [
        { visual: '主厨做手势示意保密，把一碗神秘酱汁收回柜台', overlay: '我们店里概不外传的隐藏菜单', audio: '只有来过5次以上的老熟客才知道的隐藏暗号，今天我就顶着被开除的风险告诉你。' },
        { visual: '镜头缓缓推近一个精致的小盅，冒着白雾', overlay: '为什么这道菜每天仅售10份？', audio: '真不是搞饥饿营销，而是因为主食材需要慢火炖煮整整12小时才能出锅。' },
        { visual: '红辣椒在热油中爆香的慢动作画面，视觉冲击极强', overlay: '这口辣，全网没人能坚持3秒', audio: '自称能吃辣的都来挑战了，但至今还没有人能把这碗变态辣底料全部吃完。' }
      ],
      'Direct Value': [
        { visual: '俯拍整张铺满各种菜品的长桌，镜头由远及近', overlay: '50元吃饱三人的省钱点单攻略', audio: '第一次来千万别乱点，保存这个视频，教你用一张百元钞吃齐所有招牌菜。' },
        { visual: '将特色菜在盘中搅拌、捞起的拉丝效果特写', overlay: '3个步骤，教你在家复刻招牌', audio: '其实做法没有你想的那么神秘，今天一分钟把核心配方教给你，赶紧收藏。' },
        { visual: '精美的双人冷饮与甜品在夕阳下闪闪发光', overlay: '性价比超高约会宝藏地', audio: '别去人挤人还贵的西餐厅了，这家氛围感拉满、人均50的宝藏店赶紧艾特他带你去。' }
      ],
      'Social Proof': [
        { visual: '展示一叠堆得高高的外卖单或堂食预订簿', overlay: '全网累计销量突破10万份', audio: '上市短短3个月，这道菜就被点单了10万多次，到底有什么魔力让大家这么上瘾？' },
        { visual: '博主展示本地大众点评或小红书上的高分截图', overlay: '常年霸榜本地热门榜第一名', audio: '今天终于来打卡这家在本地美食榜上连续三年蝉联第一的宝藏餐馆了。' },
        { visual: '展示店里高朋满座、顾客欢声笑语的画面', overlay: '回头客比例高达85%的秘密', audio: '随机采访了5位正在用餐的顾客，他们全都是来了不下十次的老粉！' }
      ]
    },
    'eCommerce': {
      'Contra-Narrative': [
        { visual: '把一件普通的衣服或产品随手一扔，然后展示其上身或使用效果', overlay: '别再浪费钱买大牌同款了！', audio: '很多人以为只有千元大牌才有这个质感，其实百元平替就能穿出同等高级感。' },
        { visual: '将某件商品拆包丢在一边，露出细节特写', overlay: '这个设计太鸡肋？是你用错了', audio: '大家都说这个小玩意儿没用，其实是你忽略了它最核心的这个隐藏设计。' },
        { visual: '博主将一堆化妆品或产品扫进垃圾桶', overlay: '为什么我劝你别买爆款清单', audio: '今天来当一回黑脸，避雷这三个在网上风很大但实际用起来非常鸡肋的爆款。' }
      ],
      'Pain Point': [
        { visual: '展示用普通剪刀费力剪东西或者打结线头的痛苦画面', overlay: '每天都在被这些家居细节折磨？', audio: '如果你也受够了每次做家务都腰酸背痛，这个神奇的设计绝对能救你一命。' },
        { visual: '展示衣柜乱七八糟、找不到衣服的焦躁特写', overlay: '衣柜塞得满满的却永远没衣服穿', audio: '别再乱买衣服了，今天教你一套极简衣柜搭配公式，一周五天穿搭不重样。' },
        { visual: '博主面对干燥脱皮的脸或者粗糙皮肤指指点点', overlay: '用再多面霜皮肤还是干到脱皮？', audio: '别再花大价钱买贵妇面霜了，其实是你的第一步补水逻辑搞错了。' }
      ],
      'Curiosity Gap': [
        { visual: '包裹严严实实的纸箱放在桌上，用美工刀轻轻划开', overlay: '开箱一个我等了三个月的包裹', audio: '今天终于收到了这个从国外订购、排单三个月的神秘好物，来看看它值不值。' },
        { visual: '展示产品一个非常奇特的隐藏按钮或者机关特写', overlay: '这个产品居然还有这个隐藏用法？', audio: '相信90%买过这个产品的人，都不知道按住这个地方三秒能解锁全新功能。' },
        { visual: '博主将一件产品握在手中，神神秘秘地对镜头微笑', overlay: '只用了一次，我的生活就被它改变了', audio: '今天安利一个我私藏了很久、能提升生活幸福感10倍的宝藏单品。' }
      ],
      'Direct Value': [
        { visual: '快速展示多件高颜值好物平铺在桌面上的视觉盛宴', overlay: '开学季/百元内拼多多宝藏好物清单', audio: '今天毫无保留分享5个均价二三十、但品质极高的高颜值好物，链接都在下方。' },
        { visual: '展示产品详细的使用步骤，动作利落干净', overlay: '三步教你彻底清洗家里的这个死角', audio: '不需要请专业保洁，用这个小工具配合这三个步骤，自己五分钟就能搞定。' },
        { visual: '博主直接展示尺码表和上身对比图', overlay: '小个子女生避坑买裤子指南', audio: '教你三个看尺码表的万能公式，以后网购裤子再也不会买错长度。' }
      ],
      'Social Proof': [
        { visual: '展示仓库里爆满的包裹、工人们忙碌发货的场景', overlay: '上架5分钟，1万件全部抢空', audio: '这已经是我们本月第三次断货了，工人们正在连夜加班发货，这次别再错过了。' },
        { visual: '博主拿着手机展示粉丝群里清一色的五星好评截图', overlay: '小红书上万条好评的年度防晒', audio: '全网博主都在推，我买回来亲测了一个月，发现它真的名副其实。' },
        { visual: '展示一张巨大的销量统计图或者行业奖杯特写', overlay: '蝉联天猫品类销量第一的好物', audio: '能做到连续三年销量冠军，绝对不是靠营销，今天我们来深扒一下它的硬实力。' }
      ]
    },
    'SaaS': {
      'Contra-Narrative': [
        { visual: '博主对着复杂的Excel表格狂敲键盘，然后叹气关掉', overlay: '别再傻傻手动做Excel报表了！', audio: '每天花两小时复制粘贴数据？教你一招，用这个AI工具3秒钟一键生成。' },
        { visual: '展示传统的代码编辑器，然后一键切换到无代码拖拽界面', overlay: '不会写代码也能做自己的App？', audio: '别去花几万找外包开发了，现在只用一个拖拽式工具，零基础也能做产品。' },
        { visual: '博主指着一堆过期的昂贵软件订阅账单', overlay: '别再给这些垃圾软件交智商税了', audio: '这三个高昂订阅软件的功能，其实用这一个免费的开源平替就能全部搞定。' }
      ],
      'Pain Point': [
        { visual: '深夜时钟特写，博主疲惫不堪地打哈欠工作', overlay: '每天加班到深夜，效率却极低？', audio: '如果你也被繁琐的日常琐事折磨得没时间生活，你需要这套自动化工作流。' },
        { visual: '电脑屏幕突然卡死或报错的特写，博主捂脸崩溃', overlay: '又被软件卡死丢失了重要数据？', audio: '别等数据丢失了才后悔，教你用一行代码实现全自动多云备份，终身免费。' },
        { visual: '展示一封封堆积如山的未回复邮件和客户留言特写', overlay: '客户消息回不完，转化率直线下滑', audio: '别再让人工客服疲于奔命了，用这个AI助手自动接管首轮回复，转化率提升3倍。' }
      ],
      'Curiosity Gap': [
        { visual: '博主把电脑屏幕转过来，但打上模糊马赛克', overlay: '我团队提高5倍生产力的秘密武器', audio: '这是我们内部从不公开的效率秘方，今天大公开，看看我们是怎么做到的。' },
        { visual: '展示产品界面上的一个隐藏高级开发者选项', overlay: '这个被99%的人忽略的隐藏开关', audio: '很少有人知道，把这个选项打开后，你的系统处理速度能瞬间提升两倍。' },
        { visual: '博主神神秘秘地对镜头小声说话', overlay: '嘘！同行不希望你知道的提效外挂', audio: '今天顶着被同行投诉的风险，给你们分享这个可以自动生成方案的黑科技。' }
      ],
      'Direct Value': [
        { visual: '快速切换展示三个软件界面的核心交互，节奏明快', overlay: '3个打工人必备的免费提效神仙网站', audio: '今天推荐3个冷门但好用到哭的效率网站，能让你每天提前两小时下班。' },
        { visual: '录屏演示软件的配置页面，鼠标点击引导', overlay: '手把手教你配置你的第一个AI助理', audio: '不需要懂编程，跟着我这个保姆级视频配置，五分钟就能让AI替你干活。' },
        { visual: '展示一份制作精美、充满图表的自动化PDF报告', overlay: '一键生成周报模板/直接打包带走', audio: '在评论区扣“周报”，我把这套自动生成报告的指令直接免费发送到你的私信。' }
      ],
      'Social Proof': [
        { visual: '展示软件后台的用户数不断滚动的动画，数字狂飙', overlay: '全球突破100万用户的效率工具', audio: '从零到百万用户，我们只用了短短半年，来看看为什么大家都在用它替代老软件。' },
        { visual: '博主展示世界五百强企业的Logo墙或者知名大咖的推荐语', overlay: '微软/谷歌员工私下都在用的软件', audio: '大厂高效率的背后，其实是因为员工都在用这套工具进行跨部门协同。' },
        { visual: '展示一幅满屏的高星评分和正面反馈弹窗', overlay: '在Product Hunt上评分4.9的神器', audio: '全网好评率高达98%，今天我就来深度测评，看看它到底是不是名副其实。' }
      ]
    },
    'Coaching': {
      'Contra-Narrative': [
        { visual: '博主微笑着连连摇头，双手交叉比出拒绝姿势', overlay: '为什么你越努力反而越赚不到钱？', audio: '很多人觉得成功靠的是埋头苦干，其实努力的底层逻辑错了，再拼也是白费。' },
        { visual: '博主撕掉一张写着“传统成功学”的白纸', overlay: '别再相信少睡四个小时的鬼话了', audio: '那些劝你牺牲睡眠去拼命的建议，实际上是在慢性摧毁你的认知和判断力。' },
        { visual: '博主用白板笔在黑板上划掉一个常见的行业公式', overlay: '这个被吹上天的创业公式，是个坑！', audio: '今天用我十年行业交税的经验告诉你，为什么90%的新手都会死在这个公式上。' }
      ],
      'Pain Point': [
        { visual: '展示一个人看着银行卡余额或者停滞不前的粉丝数叹气', overlay: '努力了很久，成果依然为零？', audio: '如果你也陷入了成长的瓶颈期，每天焦虑却看不到出路，听听我这三点建议。' },
        { visual: '展示一本书翻了两页就被丢在一边，博主揉太阳穴', overlay: '买了一堆书，却一本都读不进去？', audio: '别再强迫自己死记硬背了，教你一个高效吸收知识的“三步输出法”。' },
        { visual: '博主指着太阳穴，露出疲惫不堪的表情', overlay: '每天脑子里想法很多，但就是不执行', audio: '拖延症的本质根本不是懒，而是你的大脑在逃避未知的焦虑，教你一招破局。' }
      ],
      'Curiosity Gap': [
        { visual: '博主将一叠写着“核心机密”的笔记在镜头前一闪而过', overlay: '年入百万的人，都在遵循的潜规则', audio: '这套赚钱认知是学校里永远不会教给你的，花三分钟看完，少走五年弯路。' },
        { visual: '博主拿出白纸，开始在上面画金字塔模型', overlay: '人与人之间最大的认知鸿沟在哪？', audio: '真正拉开差距的不是智商或背景，而是这个关键维度的思考习惯，今天画给你看。' },
        { visual: '博主神神秘秘地对镜头微笑', overlay: '高手做决策时，都在用这套算法', audio: '为什么有些人看问题能一针见血？因为他们的脑子里有一套独特的过滤模型。' }
      ],
      'Direct Value': [
        { visual: '白板上写着大大的1、2、3条清晰步骤', overlay: '小白快速转行/自学提升保姆级规划', audio: '不管你基础多差，跟着这套自学路径坚持3个月，绝对能在新行业站稳脚跟。' },
        { visual: '博主指着屏幕，背景展示一份思维导图', overlay: '整理了半个月的行业认知图谱免费送', audio: '为了帮你理清思路，我把整套行业框架做成了导图，建议截图保存。' },
        { visual: '博主手里拿着几张精心整理的干货卡片', overlay: '高手常用的5个思维模型，直接抄作业', audio: '如果你不知道怎么分析复杂问题，把这5个思维模型保存下来，遇到事情直接套用。' }
      ],
      'Social Proof': [
        { visual: '展示一位学员在微信聊天记录里报喜的截图特写', overlay: '30天，帮助100个普通人跑通闭环', audio: '这是我们上个月实战营学员的真实数据，今天不讲空话，直接拆解他的成功路径。' },
        { visual: '博主站在一个座无虚席的演讲现场或千人大会上', overlay: '线上线下累计学员突破1万人', audio: '深耕这个领域十多年，这是我总结出来的最适合普通人的一套认知蜕变课。' },
        { visual: '博主指着手机上成百上千条感谢信和打卡记录', overlay: '跟着这个公式打卡，好评率100%', audio: '这套方法经过了上万名学员的真实测试，只要你按着做，就一定能看到变化。' }
      ]
    },
    'LocalService': {
      'Contra-Narrative': [
        { visual: '博主面对一堆乱七八糟的美容仪器或清洁剂直摆手', overlay: '千万别去那些廉价美容院/洗车店了！', audio: '很多人贪便宜去低价体验，不仅服务缩水，还可能给皮肤/车子造成二次损伤。' },
        { visual: '镜头扫过高大上的装修，最后定格在技师认真的手部细节上', overlay: '别被网红门店的浮华装修骗了！', audio: '挑门店最核心的不是看装修有多奢华，而是看他们技师的实操工龄和细心度。' },
        { visual: '博主翻白眼或者做出无语的姿势', overlay: '为什么我不推荐你跟风做网红项目', audio: '今天作为行业内幕人士，劝大家避雷这三个好看不中用、纯属浪费钱的项目。' }
      ],
      'Pain Point': [
        { visual: '博主展示一个乱糟糟的家或者车子内饰的脏乱差特写', overlay: '工作太忙，家里乱到崩溃？', audio: '别再把周末宝贵的休息时间浪费在做家务上了，把专业的事交给专业团队。' },
        { visual: '展示一个人揉脖子、揉肩膀痛苦不堪的写照', overlay: '肩膀酸痛到整夜失眠，怎么治？', audio: '长期坐办公室的打工人，别等腰椎出问题了才后悔，教你一套快速舒缓法。' },
        { visual: '博主展示头发干枯分叉或者指甲断裂的局部镜头', overlay: '做了美甲/头发没几天就断裂脱落？', audio: '如果你经常遇到美甲边缘起翘，其实是因为店员在打磨和涂胶的步骤上偷懒了。' }
      ],
      'Curiosity Gap': [
        { visual: '展示一扇紧闭的包厢门，博主轻轻推开露出里面舒适的环境', overlay: '藏在写字楼里的隐藏版高端体验馆', audio: '今天带大家去一个只有熟客引路才能找到的私密康养空间，体验绝了。' },
        { visual: '博主拿着一瓶没有任何标签的特制调理精油特写', overlay: '为什么我们店从来不公开这款精油？', audio: '这是我们专门为老会员定制研发的草本纯植物精油，外面根本买不到。' },
        { visual: '镜头推近技师一记精准到位的按摩手法特写，顾客放松地闭眼', overlay: '按这里为什么能让人一秒放松？', audio: '这个穴位是舒缓压力的关键，来听听我们有着20年经验的老师傅怎么说。' }
      ],
      'Direct Value': [
        { visual: '展示门店大门、内部环境和热情的服务流程，节奏连贯', overlay: '第一次到店免费赠送的3项福利', audio: '别说我没提醒你，新店开张福利，只要关注并私信，到店就能免费体验三个项目。' },
        { visual: '博主展示地图导航，以及门店外便捷的免费停车位', overlay: '避坑指引：如何快速到达并免费停车', audio: '为了让大家不把时间浪费在找路 and 找车位上，专门做了这期超详细到店攻略。' },
        { visual: '镜头扫过前台，展示各种赠送的点心和茶水', overlay: '不仅是服务，这里更是下午茶圣地', audio: '来我们店里不仅能享受专业项目，我们还提供免费现磨咖啡和精致法式甜点。' }
      ],
      'Social Proof': [
        { visual: '展示一面贴满了红旗或者感谢信的墙面，镜头拉近', overlay: '被本地街坊邻里送了100面锦旗的店', audio: '在社区开了快十年，老邻居们一提起这家店都赞不绝口，靠的全是实打实的口碑。' },
        { visual: '展示一位知名本地明星或者百万级博主到店体验的照片/视频', overlay: '本地多名大咖和网红私下常来的打卡店', audio: '今天带大家揭秘，为什么这家低调的店，会成为本地各路名人的首选去处。' },
        { visual: '展示前台排队的预约记录本，翻动多页，全是满员', overlay: '提前一周都不一定能约上的宝藏店', audio: '好评率高达99.5%，为了保证每位客人的体验，我们每天只接待有限的预约。' }
      ]
    }
  }

  const bizTypeTemplates = db[businessType] || db['F&B']
  const selectedStyleTemplates = bizTypeTemplates[hookStyle] || []
  
  // Interpolate topic into templates if possible
  return selectedStyleTemplates.map(item => ({
    visual: item.visual.replace(/特色服务/g, t).replace(/招牌/g, t),
    overlay: item.overlay.replace(/特色服务/g, t).replace(/招牌/g, t),
    audio: item.audio.replace(/特色服务/g, t).replace(/招牌/g, t)
  }))
}

function truncateMiddle(value: string, max = 20) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 3)}...`
}

export default function DraftManagementView({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [accounts, setAccounts] = useState<SocialAccountOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const closeEditor = () => {
    setEditorOpen(false)
    setSelectedId(null)
    setSelectedAccountIds([])
  }
  const [activeTab, setActiveTab] = useState<TabKey>('scheduled')
  const [query, setQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [compact, setCompact] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [accountId, setAccountId] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [agentNote, setAgentNote] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [contentIdea, setContentIdea] = useState('')
  const [creativeHooks, setCreativeHooks] = useState('')
  
  // Hooks generator states
  const [showHookGenerator, setShowHookGenerator] = useState(false)
  const [hookBusinessType, setHookBusinessType] = useState('F&B')
  const [hookStyle, setHookStyle] = useState('Contra-Narrative')
  const [hookTopic, setHookTopic] = useState('')
  const [isGeneratingHooks, setIsGeneratingHooks] = useState(false)
  const [generatedHooks, setGeneratedHooks] = useState<Array<{ visual: string; overlay: string; audio: string }>>([])

  const handleGenerateHooks = async () => {
    setIsGeneratingHooks(true)
    try {
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

      const promptMsg = `Business Type: ${hookBusinessType}\nHook Style: ${hookStyle}\nTopic: ${hookTopic || contentIdea || '我们的特色服务'}`
      
      const res = await callGeminiDirect(systemPrompt, [], promptMsg, false, 800)
      if (res.direct && res.reply) {
        let cleanText = res.reply.replace(/```json/gi, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(cleanText)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setGeneratedHooks(parsed.slice(0, 3))
          setIsGeneratingHooks(false)
          return
        }
      }
      throw new Error('Fallback to local presets')
    } catch (e) {
      console.warn('AI Hook generation failed or key missing, using preset generator templates:', e)
      const topic = hookTopic || contentIdea || '我们的特色服务'
      const fallbacks = getFallbackHooks(hookBusinessType, hookStyle, topic)
      setGeneratedHooks(fallbacks)
    } finally {
      setIsGeneratingHooks(false)
    }
  }

  const [activeMediaOp, setActiveMediaOp] = useState<{ index: number; action: 'design' | 'video' } | null>(null)
  const [mediaOpPrompt, setMediaOpPrompt] = useState('')
  const [mediaProcessingIndex, setMediaProcessingIndex] = useState<number | null>(null)

  const [assetTypeFilter, setAssetTypeFilter] = useState<'unused' | 'all'>('unused')
  const [assetPageSize, setAssetPageSize] = useState(12)
  const [brandAssets, setBrandAssets] = useState<Array<{ id: string; url: string; filename?: string | null; mimeType: string; usedCount?: number; createdAt?: string | Date }>>([])
  const filteredAssets = useMemo(() => {
    // Sort descending by createdAt to prioritize latest uploaded assets
    const sorted = [...brandAssets].sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tB - tA
    })
    return sorted.filter(asset => {
      if (assetTypeFilter === 'unused') {
        return (asset.usedCount ?? 0) === 0
      }
      if (assetTypeFilter === 'all') {
        const isVid = asset.mimeType?.startsWith('video/')
        return !isVid
      }
      return true
    })
  }, [brandAssets, assetTypeFilter])
  const [mediaUrlsInput, setMediaUrlsInput] = useState('')
  const [attachedMedia, setAttachedMedia] = useState<Array<{ id: string; type: 'asset' | 'url'; url: string }>>([])
  const [isCreatingPost, setIsCreatingPost] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewOnly, setPreviewOnly] = useState(false)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [draftCaptions, setDraftCaptions] = useState<Record<string, string>>({})
  const [draftHashtags, setDraftHashtags] = useState<Record<string, string>>({})
  const [draftStatuses, setDraftStatuses] = useState<Record<string, 'generating' | 'completed' | 'failed'>>({})
  const [createdDrafts, setCreatedDrafts] = useState<any[] | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  // Poll for generating drafts
  useEffect(() => {
    if (!isAiGenerating || !createdDrafts || createdDrafts.length === 0) return

    const interval = setInterval(async () => {
      let allFinished = true
      const updatedStatuses = { ...draftStatuses }
      const updatedCaptions = { ...draftCaptions }
      const updatedHashtags = { ...draftHashtags }

      try {
        await Promise.all(
          createdDrafts.map(async (d) => {
            if (updatedStatuses[d.accountId] !== 'generating') return

            const checkRes = await fetch(`/api/brands/${brandId}/drafts/${d.id}`)
            if (checkRes.status === 404) {
              updatedStatuses[d.accountId] = 'failed'
              return
            }
            if (checkRes.ok) {
              const checkData = await checkRes.json()
              const updatedDraft = checkData.draft
              if (updatedDraft) {
                if (updatedDraft.status === 'failed') {
                  updatedStatuses[d.accountId] = 'failed'
                } else if (updatedDraft.caption && updatedDraft.caption !== '【AI 正在创作中...】') {
                  updatedStatuses[d.accountId] = 'completed'
                  updatedCaptions[d.accountId] = updatedDraft.caption
                  updatedHashtags[d.accountId] = Array.isArray(updatedDraft.hashtags) 
                    ? updatedDraft.hashtags.join(' ') 
                    : String(updatedDraft.hashtags || '')
                } else {
                  allFinished = false
                }
              }
            }
          })
        )

        setDraftStatuses(updatedStatuses)
        setDraftCaptions(updatedCaptions)
        setDraftHashtags(updatedHashtags)

        if (allFinished) {
          setIsAiGenerating(false)
          clearInterval(interval)
          await loadDrafts()
        }
      } catch (e) {
        console.error('Polling drafts error:', e)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [isAiGenerating, createdDrafts, brandId, draftStatuses, draftCaptions, draftHashtags])
  const [newUrlInput, setNewUrlInput] = useState('')

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    setAttachedMedia((prev) => {
      const updated = [...prev]
      const draggedItem = updated[draggedIndex]
      updated.splice(draggedIndex, 1)
      updated.splice(index, 0, draggedItem)
      return updated
    })
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleToggleAsset = (asset: { id: string; url: string }) => {
    setAttachedMedia((prev) => {
      const exists = prev.some((m) => m.type === 'asset' && m.id === asset.id)
      if (exists) {
        return prev.filter((m) => !(m.type === 'asset' && m.id === asset.id))
      } else {
        return [...prev, { id: asset.id, type: 'asset', url: asset.url }]
      }
    })
  }

  const handleRemoveMedia = (index: number) => {
    setAttachedMedia((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleAddUrl = () => {
    const url = newUrlInput.trim()
    if (!url) return
    setAttachedMedia((prev) => [
      ...prev,
      { id: url, type: 'url', url }
    ])
    setNewUrlInput('')
  }

  const selectedAssetIds = useMemo(() => attachedMedia.filter(m => m.type === 'asset').map(m => m.id), [attachedMedia])
  const selectedDraft = useMemo(() => drafts.find((draft) => draft.id === selectedId) || null, [drafts, selectedId])
  const accountOptions = useMemo(() => {
    const list = [...accounts]
    
    // Add unconfigured placeholder accounts if they are not already in accounts
    const hasGoogle = list.some(a => ['google', 'google_business'].includes(a.platformId.toLowerCase()))
    const hasRednote = list.some(a => ['red', 'xiaohongshu', 'xhs'].includes(a.platformId.toLowerCase()))
    const hasInstagram = list.some(a => a.platformId.toLowerCase() === 'instagram')
    const hasFacebook = list.some(a => a.platformId.toLowerCase() === 'facebook')
    const hasTiktok = list.some(a => a.platformId.toLowerCase() === 'tiktok')

    // Check if the currently selected draft belongs to an unconfigured account that is already in the database
    const selectedDraftAccount = selectedDraft?.account
    
    if (selectedDraftAccount && selectedDraftAccount.handle === 'unconfigured') {
      const pId = selectedDraftAccount.platformId.toLowerCase()
      const isGoogle = ['google', 'google_business'].includes(pId)
      const isRed = ['red', 'xiaohongshu', 'xhs'].includes(pId)
      
      if (!list.some(a => a.id === selectedDraftAccount.id)) {
        list.push({
          id: selectedDraftAccount.id,
          platformId: selectedDraftAccount.platformId,
          handle: 'unconfigured',
          displayName: selectedDraftAccount.displayName || (
            isGoogle ? 'Google Business (未配置)' 
            : isRed ? '小红书 / Rednote (未配置)'
            : pId === 'instagram' ? 'Instagram (未配置)'
            : pId === 'facebook' ? 'Facebook (未配置)'
            : pId === 'tiktok' ? 'TikTok (未配置)'
            : `${selectedDraftAccount.platformId.charAt(0).toUpperCase() + selectedDraftAccount.platformId.slice(1)} (未配置)`
          ),
          autoPilot: false,
          profileUrl: null
        } as any)
      }
    }

    // Still add unconfigured placeholders for selection if the user wants to select them for a new/existing draft
    if (!hasGoogle && !list.some(a => a.id === 'unconfigured_google_business' || (a.handle === 'unconfigured' && ['google', 'google_business'].includes(a.platformId.toLowerCase())))) {
      list.push({
        id: 'unconfigured_google_business',
        platformId: 'google_business',
        handle: 'unconfigured',
        displayName: 'Google Business (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasRednote && !list.some(a => a.id === 'unconfigured_red' || (a.handle === 'unconfigured' && ['red', 'xiaohongshu', 'xhs'].includes(a.platformId.toLowerCase())))) {
      list.push({
        id: 'unconfigured_red',
        platformId: 'red',
        handle: 'unconfigured',
        displayName: '小红书 (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasInstagram && !list.some(a => a.id === 'unconfigured_instagram' || (a.handle === 'unconfigured' && a.platformId.toLowerCase() === 'instagram'))) {
      list.push({
        id: 'unconfigured_instagram',
        platformId: 'instagram',
        handle: 'unconfigured',
        displayName: 'Instagram (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasFacebook && !list.some(a => a.id === 'unconfigured_facebook' || (a.handle === 'unconfigured' && a.platformId.toLowerCase() === 'facebook'))) {
      list.push({
        id: 'unconfigured_facebook',
        platformId: 'facebook',
        handle: 'unconfigured',
        displayName: 'Facebook (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasTiktok && !list.some(a => a.id === 'unconfigured_tiktok' || (a.handle === 'unconfigured' && a.platformId.toLowerCase() === 'tiktok'))) {
      list.push({
        id: 'unconfigured_tiktok',
        platformId: 'tiktok',
        handle: 'unconfigured',
        displayName: 'TikTok (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    
    return list
  }, [accounts, selectedDraft])

  const activeAccount = useMemo(() => accountOptions.find(a => a.id === accountId) || null, [accountOptions, accountId])

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPlatform, setPreviewPlatform] = useState('instagram')
  const [previewMediaIndex, setPreviewMediaIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const loadDrafts = async () => {
    if (!brandId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/drafts`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '草稿加载失败')
      setDrafts(json.drafts || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '草稿加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadAccounts = async () => {
    if (!brandId) return
    try {
      const res = await fetch(`/api/brands/${brandId}/accounts`)
      const json = await res.json().catch(() => ({}))
      if (res.ok) setAccounts(json.accounts || [])
    } catch {
      setAccounts([])
    }
  }

  const loadBrandAssets = async () => {
    if (!brandId) return
    try {
      const res = await fetch(`/api/brands/${brandId}/assets`)
      const json = await res.json().catch(() => ({}))
      if (res.ok) setBrandAssets(json.assets || [])
    } catch {
      setBrandAssets([])
    }
  }

  useEffect(() => {
    void loadDrafts()
    void loadBrandAssets()
  }, [brandId])

  useEffect(() => {
    void loadAccounts()
  }, [brandId])

  useEffect(() => {
    setAssetPageSize(12)
  }, [brandId, assetTypeFilter, selectedId, editorOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return
      if (e.key === 'Escape') {
        setLightboxIndex(null)
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null && prev < filteredAssets.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredAssets.length - 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, filteredAssets.length])

  useEffect(() => {
    if (!selectedDraft) {
      setCaption('')
      setHashtags('')
      setAccountId('')
      setSelectedAccountIds(accounts.map(a => a.id))
      setScheduledAt('')
      setAgentNote('')
      setMediaUrlsInput('')
      setAttachedMedia([])
      setReviewNote('')
      setContentIdea('')
      setCreativeHooks('')
      setActiveMediaOp(null)
      setMediaOpPrompt('')
      setMediaProcessingIndex(null)
      setShowHookGenerator(false)
      setHookTopic('')
      setGeneratedHooks([])
      return
    }
    setContentIdea('')
    setCreativeHooks('')
    setActiveMediaOp(null)
    setMediaOpPrompt('')
    setMediaProcessingIndex(null)
    setShowHookGenerator(false)
    setHookTopic('')
    setGeneratedHooks([])
    setCaption(selectedDraft.caption)
    setCreativeHooks(selectedDraft.creativeHooks || '')
    setHashtags(formatTags(selectedDraft.hashtags))
    const accId = selectedDraft.accountId || selectedDraft.account?.id || ''
    setAccountId(accId)
    setSelectedAccountIds(accId ? [accId] : [])
    setScheduledAt(toDateTimeLocal(selectedDraft.scheduledAt))
    if (selectedDraft.agentNote && selectedDraft.agentNote.includes("【AI 生成指令】")) {
      const cleanNote = selectedDraft.agentNote.replace(/【AI 生成指令】[\s\S]*?【\/AI 生成指令】(?:\r?\n)?/, '');
      setAgentNote(cleanNote.trim());
      const match = selectedDraft.agentNote.match(/【AI 生成指令】([\s\S]*?)【\/AI 生成指令】/);
      if (match) {
        setContentIdea(match[1].trim());
      }
    } else {
      setAgentNote(selectedDraft.agentNote || '');
    }
    setMediaUrlsInput((selectedDraft.mediaUrls || []).join(', '))

    const initialMedia: Array<{ id: string; type: 'asset' | 'url'; url: string }> = []
    if (selectedDraft.assetRefs) {
      selectedDraft.assetRefs.forEach((ref) => {
        if (ref.asset) {
          initialMedia.push({
            id: ref.asset.id,
            type: 'asset',
            url: ref.asset.url || '',
          })
        }
      })
    }
    if (selectedDraft.mediaUrls) {
      selectedDraft.mediaUrls.forEach((url) => {
        initialMedia.push({
          id: url,
          type: 'url',
          url,
        })
      })
    }
    setAttachedMedia(initialMedia)
    setReviewNote('')
  }, [selectedDraft?.id])

  const platformOptions = useMemo(() => {
    const values = new Set(drafts.map((draft) => draft.account?.platformId).filter(Boolean) as string[])
    return Array.from(values).sort()
  }, [drafts])

  const tagOptions = useMemo(() => {
    const values = new Set(drafts.flatMap((draft) => draft.hashtags))
    return Array.from(values).sort()
  }, [drafts])

  const tabCounts = useMemo(() => {
    return TAB_CONFIG.reduce<Record<TabKey, number>>((acc, tab) => {
      acc[tab.key] = tab.key === 'all' ? drafts.length : drafts.filter((draft) => draft.status === tab.key).length
      return acc
    }, {} as Record<TabKey, number>)
  }, [drafts])

  const filteredDrafts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return drafts
      .filter((draft) => activeTab === 'all' || draft.status === activeTab)
      .filter((draft) => platformFilter === 'all' || draft.account?.platformId === platformFilter)
      .filter((draft) => accountFilter === 'all' || (draft.accountId || draft.account?.id) === accountFilter)
      .filter((draft) => tagFilter === 'all' || draft.hashtags.includes(tagFilter))
      .filter((draft) => {
        if (!normalizedQuery) return true
        return [draft.caption, draft.account?.displayName, draft.account?.handle, draft.hashtags.join(' ')].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
      })
      .sort((a, b) => new Date(draftTimestamp(b)).getTime() - new Date(draftTimestamp(a)).getTime())
  }, [accountFilter, activeTab, drafts, platformFilter, query, tagFilter])

  const groupedDrafts = useMemo(() => {
    const groups = new Map<string, DraftItem[]>()
    filteredDrafts.forEach((draft) => {
      const heading = formatDateHeading(draftTimestamp(draft))
      groups.set(heading, [...(groups.get(heading) || []), draft])
    })
    return Array.from(groups.entries())
  }, [filteredDrafts])

  const openNewDraft = () => {
    setSelectedId(null)
    setEditorOpen(true)
    setCaption('')
    setHashtags('')
    setAccountId('')
    setSelectedAccountIds(accounts.map(a => a.id))
    setScheduledAt('')
    setAgentNote('')
    setMediaUrlsInput('')
    setAttachedMedia([])
    setReviewNote('')
    setCreativeHooks('')
  }

  const saveDraft = async (nextStatus?: string, captionOverride?: string, accountIdsOverride?: string[]): Promise<DraftItem[] | null> => {
    if (!brandId) return null
    let activeCaption = captionOverride !== undefined ? captionOverride : caption
    if (!activeCaption.trim() && contentIdea.trim()) {
      activeCaption = contentIdea.trim()
      setCaption(activeCaption)
    }
    const trimmedCaption = activeCaption.trim()
    if (!trimmedCaption) {
      setError('草稿正文或内容创意不能为空')
      return null
    }
    const activeAccountIds = accountIdsOverride || selectedAccountIds
    if (activeAccountIds.length === 0) {
      setError('请选择发布平台账号')
      return null
    }
    setSaving(true)
    setError(null)
    const mediaUrls = attachedMedia.filter((m) => m.type === 'url').map((m) => m.url)
    const formattedAgentNote = contentIdea.trim() ? `【AI 生成指令】${contentIdea.trim()}【/AI 生成指令】\n${agentNote}` : agentNote
    try {
      const savedDrafts: DraftItem[] = []

      if (selectedDraft) {
        // Update existing draft with first account
        const endpoint = `/api/brands/${brandId}/drafts/${selectedDraft.id}`
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caption: trimmedCaption,
            hashtags: parseTags(hashtags),
            accountId: activeAccountIds[0],
            scheduledAt: fromDateTimeLocal(scheduledAt),
            agentNote: formattedAgentNote,
            status: nextStatus || selectedDraft.status || 'draft',
            mediaUrls,
            assetIds: selectedAssetIds,
            creativeHooks: creativeHooks.trim(),
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || '修改草稿失败')
        if (json.draft) savedDrafts.push(json.draft)

        // Create new drafts for any additional accounts
        const otherAccounts = activeAccountIds.slice(1)
        if (otherAccounts.length > 0) {
          const results = await Promise.all(
            otherAccounts.map(async (accId) => {
              const resCreate = await fetch(`/api/brands/${brandId}/drafts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  caption: trimmedCaption,
                  hashtags: parseTags(hashtags),
                  accountId: accId,
                  scheduledAt: fromDateTimeLocal(scheduledAt),
                  agentNote: formattedAgentNote,
                  status: nextStatus || 'draft',
                  mediaUrls,
                  assetIds: selectedAssetIds,
                  creativeHooks: creativeHooks.trim(),
                }),
              })
              const jsonCreate = await resCreate.json().catch(() => ({}))
              if (resCreate.ok && jsonCreate.draft) {
                return jsonCreate.draft
              } else {
                console.error(`Failed to create copy draft for account ${accId}:`, jsonCreate.error)
                return null
              }
            })
          )
          results.forEach(d => { if (d) savedDrafts.push(d) })
        }
      } else {
        // Create new drafts for all selected accounts
        const results = await Promise.all(
          activeAccountIds.map(async (accId) => {
            const res = await fetch(`/api/brands/${brandId}/drafts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                caption: trimmedCaption,
                hashtags: parseTags(hashtags),
                accountId: accId,
                scheduledAt: fromDateTimeLocal(scheduledAt),
                agentNote: formattedAgentNote,
                status: nextStatus || 'draft',
                mediaUrls,
                assetIds: selectedAssetIds,
                creativeHooks: creativeHooks.trim(),
              }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || '创建草稿失败')
            return json.draft || null
          })
        )
        results.forEach(d => { if (d) savedDrafts.push(d) })
      }

      await Promise.all([loadDrafts(), loadAccounts()])
      if (savedDrafts.length > 0) {
        setSelectedId(savedDrafts[0].id)
      }
      return savedDrafts
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存草稿失败')
      return null
    } finally {
      setSaving(false)
    }
  }

  const submitDraft = async () => {
    if (!brandId) return
    const draftsList = await saveDraft('draft')
    if (!draftsList || draftsList.length === 0) return

    setSaving(true)
    setError(null)
    try {
      await Promise.all(
        draftsList.map(async (draft) => {
          const res = await fetch(`/api/brands/${brandId}/drafts/${draft.id}/submit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: agentNote }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json.error || `提交草稿 ${draft.id} 失败`)
        })
      )
      await loadDrafts()
      closeEditor()
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交草稿失败')
    } finally {
      setSaving(false)
    }
  }

  const reviewDraft = async (action: 'approve' | 'reject') => {
    if (!brandId || !selectedDraft) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/drafts/${selectedDraft.id}/${action}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: reviewNote || agentNote || (action === 'approve' ? 'Approved' : '') }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '审核操作失败')
      await loadDrafts()
      closeEditor()
    } catch (e) {
      setError(e instanceof Error ? e.message : '审核操作失败')
    } finally {
      setSaving(false)
    }
  }

  const discardDraft = async (draftId: string) => {
    if (!brandId) return
    if (!confirm('确定要废弃该草稿吗？此操作不可逆。')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/drafts/${draftId}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '废弃草稿失败')
      closeEditor()
      await loadDrafts()
    } catch (e) {
      setError(e instanceof Error ? e.message : '废弃草稿失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCardClick = (draftId: string) => {
    if (selectMode) {
      setSelectedDraftIds(prev =>
        prev.includes(draftId)
          ? prev.filter(id => id !== draftId)
          : [...prev, draftId]
      )
    } else {
      setSelectedId(draftId)
      setEditorOpen(true)
    }
  }

  const handleSingleSmartSchedule = async (draftId: string) => {
    if (!brandId) return
    setSaving(true)
    setError(null)
    try {
      let targetDateISO: string
      const existingDraft = drafts.find(d => d.id === draftId)
      const currentManualTime = (selectedDraft && selectedDraft.id === draftId && scheduledAt) 
        ? fromDateTimeLocal(scheduledAt) 
        : null
      const parsedTime = currentManualTime || (existingDraft?.scheduledAt ? new Date(existingDraft.scheduledAt).toISOString() : null)
      const isFutureTime = parsedTime && new Date(parsedTime).getTime() > Date.now()

      if (isFutureTime && parsedTime) {
        targetDateISO = parsedTime
      } else {
        try {
          const schedRes = await fetch(`/api/brands/${brandId}/scheduling/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: null, numberOfPosts: 1, urgency: 'normal' }),
          })
          if (schedRes.ok) {
            const schedData = await schedRes.json()
            targetDateISO = schedData.recommendations?.[0]?.recommendedAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
          } else {
            targetDateISO = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
          }
        } catch {
          targetDateISO = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        }
      }

      // 1. Set scheduledAt only (leave status as draft/failed)
      const patchRes = await fetch(`/api/brands/${brandId}/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: targetDateISO
        })
      })
      const patchJson = await patchRes.json().catch(() => ({}))
      if (!patchRes.ok) throw new Error(patchJson.error || '更新排期失败')

      // 2. Approve and submit to trigger delivery (forcePublish = true)
      const submitRes = await fetch(`/api/brands/${brandId}/drafts/${draftId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '智能排期发布' }),
      })
      const submitJson = await submitRes.json().catch(() => ({}))
      if (!submitRes.ok) throw new Error(submitJson.error || '提交排期发布通道失败')

      alert(`已成功通过通道排期发布！推荐时间：${new Date(targetDateISO).toLocaleString()}`)
      await loadDrafts()
      closeEditor()
    } catch (e: any) {
      alert(e.message || '智能排期失败')
    } finally {
      setSaving(false)
    }
  }



  const handleBatchApprove = async () => {
    if (!brandId || selectedDraftIds.length === 0) return
    if (!confirm(`确定要批量批准并发布这 ${selectedDraftIds.length} 个草稿吗？`)) return
    setSaving(true)
    setError(null)
    try {
      for (const draftId of selectedDraftIds) {
        const res = await fetch(`/api/brands/${brandId}/drafts/${draftId}/approve`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: '批量批准发布' })
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error || `草稿 ${draftId} 批准失败`)
        }
      }
      setSelectedDraftIds([])
      setSelectMode(false)
      await loadDrafts()
    } catch (e) {
      setError(e instanceof Error ? e.message : '批量批准失败')
    } finally {
      setSaving(false)
    }
  }

  const handleBatchDiscard = async () => {
    if (!brandId || selectedDraftIds.length === 0) return
    if (!confirm(`确定要批量删除/废弃这 ${selectedDraftIds.length} 个草稿吗？此操作不可逆。`)) return
    setSaving(true)
    setError(null)
    try {
      for (const draftId of selectedDraftIds) {
        const res = await fetch(`/api/brands/${brandId}/drafts/${draftId}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error || `草稿 ${draftId} 废弃失败`)
        }
      }
      setSelectedDraftIds([])
      setSelectMode(false)
      await loadDrafts()
    } catch (e) {
      setError(e instanceof Error ? e.message : '批量删除失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelCreation = async () => {
    if (createdDrafts && createdDrafts.length > 0) {
      setSaving(true)
      try {
        await Promise.all(
          createdDrafts.map(d =>
            fetch(`/api/brands/${brandId}/drafts/${d.id}`, { method: 'DELETE' }).catch(() => {})
          )
        )
      } catch (e) {
        console.error('Failed to clean up drafts on cancel:', e)
      } finally {
        setSaving(false)
      }
    }
    setPreviewModalOpen(false)
    setCreatedDrafts(null)
    setIsAiGenerating(false)
    setDraftCaptions({})
    setDraftHashtags({})
    setDraftStatuses({})
    closeEditor()
    await loadDrafts()
  }

  const handleSaveDraftsFromModal = async () => {
    if (!brandId || !createdDrafts) return
    setSaving(true)
    try {
      await Promise.all(
        createdDrafts.map(async (d) => {
          const cap = draftCaptions[d.accountId] || ''
          const hash = draftHashtags[d.accountId] || ''
          await fetch(`/api/brands/${brandId}/drafts/${d.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caption: cap,
              hashtags: parseTags(hash),
              status: 'draft'
            })
          })
        })
      )
      setPreviewModalOpen(false)
      setCreatedDrafts(null)
      closeEditor()
      await loadDrafts()
      alert('草稿已成功保存')
    } catch (e: any) {
      alert(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSmartScheduleFromModal = async (customTime?: string) => {
    if (!brandId || !createdDrafts) return
    setSaving(true)
    try {
      let targetDateISO: string
      const parsedTime = scheduledAt ? fromDateTimeLocal(scheduledAt) : null
      const isFutureTime = parsedTime && new Date(parsedTime).getTime() > Date.now()

      if (customTime) {
        targetDateISO = new Date(customTime).toISOString()
      } else if (isFutureTime && parsedTime) {
        targetDateISO = parsedTime
      } else {
        try {
          const schedRes = await fetch(`/api/brands/${brandId}/scheduling/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: null, numberOfPosts: 1, urgency: 'normal' }),
          })
          if (schedRes.ok) {
            const schedData = await schedRes.json()
            targetDateISO = schedData.recommendations?.[0]?.recommendedAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
          } else {
            targetDateISO = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
          }
        } catch {
          targetDateISO = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        }
      }

      await Promise.all(
        createdDrafts.map(async (d) => {
          const cap = draftCaptions[d.accountId] || ''
          const hash = draftHashtags[d.accountId] || ''
          
          const patchRes = await fetch(`/api/brands/${brandId}/drafts/${d.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caption: cap,
              hashtags: parseTags(hash),
              scheduledAt: targetDateISO
            })
          })
          if (!patchRes.ok) throw new Error('更新排期时间失败')

          const submitRes = await fetch(`/api/brands/${brandId}/drafts/${d.id}/submit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: agentNote }),
          })
          if (!submitRes.ok) throw new Error('提交审核排期失败')
        })
      )

      setPreviewModalOpen(false)
      setCreatedDrafts(null)
      closeEditor()
      await loadDrafts()
      if (customTime) {
        alert(`已成功设定发布时间，并提交排期审核！排期时间：${new Date(targetDateISO).toLocaleString()}`)
      } else {
        alert(`已根据用户活跃度为您自动推荐最佳时间，并提交排期审核！推荐时间：${new Date(targetDateISO).toLocaleString()}`)
      }
    } catch (e: any) {
      alert(e.message || (customTime ? '排期发布失败' : '智能排期失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerate = async () => {
    if (!createdDrafts || createdDrafts.length === 0) return
    setSaving(true)
    try {
      const newCaptions: Record<string, string> = {}
      const newHashtags: Record<string, string> = {}
      const newStatuses: Record<string, 'generating' | 'completed' | 'failed'> = {}

      createdDrafts.forEach(d => {
        const accId = d.accountId || ''
        newCaptions[accId] = '【AI 正在重新创作中...】'
        newHashtags[accId] = ''
        newStatuses[accId] = 'generating'
      })

      setDraftCaptions(newCaptions)
      setDraftHashtags(newHashtags)
      setDraftStatuses(newStatuses)
      setIsAiGenerating(true)

      await Promise.all(
        createdDrafts.map(d => triggerCopywriter(d.id, true))
      )
    } catch (e) {
      console.error('Failed to regenerate drafts:', e)
    } finally {
      setSaving(false)
    }
  }

  const triggerCopywriter = async (draftId: string, silent = false) => {
    if (!brandId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/drafts/${draftId}/trigger-copywriter`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '触发 AI 创作失败')
      
      // Update local state and reload list immediately to show the placeholder
      setCaption('【AI 正在创作中...】')
      await loadDrafts()

      // Poll every 2 seconds until AI copywriting is complete
      let attempts = 0
      const maxAttempts = 15
      const interval = setInterval(async () => {
        attempts++
        try {
          const checkRes = await fetch(`/api/brands/${brandId}/drafts/${draftId}`)
          if (checkRes.status === 404) {
            clearInterval(interval)
            setSaving(false)
            alert('【AI 创作失败】该渠道的内容生成未成功，数据已清理。')
            await loadDrafts()
            if (selectedId === draftId) {
              setCaption('')
              setHashtags('')
              setCreativeHooks('')
              setSelectedId(null)
            }
            return
          }
          if (checkRes.ok) {
            const checkData = await checkRes.json()
            const updatedDraft = checkData.draft
            if (updatedDraft) {
              if (updatedDraft.status === 'failed') {
                clearInterval(interval)
                setSaving(false)
                const errMsg = updatedDraft.agentNote || '未知错误'
                alert(`【AI 创作失败】内容生成失败：\n${errMsg}`)
                
                // Clean up draft from DB immediately
                fetch(`/api/brands/${brandId}/drafts/${draftId}`, { method: 'DELETE' }).catch(() => {})
                
                await loadDrafts()
                if (selectedId === draftId) {
                  setCaption('')
                  setHashtags('')
                  setCreativeHooks('')
                  setSelectedId(null)
                }
                return
              }
              if (updatedDraft.caption && updatedDraft.caption !== '【AI 正在创作中...】') {
                clearInterval(interval)
                setSaving(false)
                
                // Reload final draft list
                await loadDrafts()
                
                // If the editor is still open for this draft, load the new content
                if (selectedId === draftId) {
                  setCaption(updatedDraft.caption)
                  setHashtags(formatTags(updatedDraft.hashtags))
                  setCreativeHooks(updatedDraft.creativeHooks || '')
                }
              }
            }
          }
        } catch (e) {
          console.error('Polling error:', e)
        }
        if (attempts >= maxAttempts) {
          clearInterval(interval)
          setSaving(false)
        }
      }, 2000)

    } catch (e) {
      setSaving(false)
      if (!silent) {
        setError(e instanceof Error ? e.message : '触发 AI 创作失败')
      } else {
        console.error(`Copywriter trigger failed silently:`, e)
      }
    }
  }

  const handleMediaAIDesign = async (index: number, assetId: string, actionType: 'design' | 'video') => {
    if (!mediaOpPrompt.trim()) {
      alert('请输入操作提示词')
      return
    }
    
    setMediaProcessingIndex(index)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/assets/${assetId}/design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: mediaOpPrompt, action: actionType })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '操作失败')
      }

      const newAsset = data.asset

      setAttachedMedia(prev => {
        const next = [...prev]
        next[index] = {
          id: newAsset.id,
          type: 'asset',
          url: newAsset.url
        }
        return next
      })

      alert(actionType === 'video' ? 'AI 视频生成成功！已为您同步该视频。' : 'AI 修图优化成功！已为您更新该图片。')
      setActiveMediaOp(null)
      setMediaOpPrompt('')
      await loadBrandAssets()
    } catch (err: any) {
      alert(err.message || '操作失败')
    } finally {
      setMediaProcessingIndex(null)
    }
  }

  if (!brandId) {
    return <div className="p-8 text-sm text-slate-400">请先选择品牌</div>
  }

  return (
    <div className="min-h-screen bg-slate-50/70 px-4 py-5 text-slate-900 dark:bg-slate-950 dark:text-slate-50 md:px-8">
      <div className="mx-auto max-w-[1480px] space-y-4 pb-24">
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              <Layers3 className="h-4 w-4" /> Draft calendar
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-300">{brandName || '当前品牌'}</span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">发布内容（Post）</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search drafts"
                className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <button onClick={loadDrafts} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button onClick={openNewDraft} className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> New draft
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-1">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-black transition-colors ${activeTab === tab.key ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  {tab.label}
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${activeTab === tab.key ? 'bg-white/15' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>{tabCounts[tab.key] || 0}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect icon={<Smartphone className="h-4 w-4" />} value={platformFilter} onChange={setPlatformFilter} options={[['all', 'All platforms'], ...platformOptions.map((platform) => [platform, platformLabel(platform)] as [string, string])]} />
              <FilterSelect icon={<Users className="h-4 w-4" />} value={accountFilter} onChange={setAccountFilter} options={[['all', 'All accounts'], ...accounts.map((account) => [account.id, account.displayName || account.handle || account.platformId] as [string, string])]} />
              <FilterSelect icon={<Tag className="h-4 w-4" />} value={tagFilter} onChange={setTagFilter} options={[['all', 'All tags'], ...tagOptions.map((tag) => [tag, `#${tag}`] as [string, string])]} />
              <button onClick={() => setSelectMode((value) => !value)} className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-bold ${compact ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                <Grid2X2 className="h-4 w-4" /> Compact
              </button>
              <button 
                onClick={() => {
                  setSelectMode(prev => {
                    const next = !prev
                    if (!next) {
                      setSelectedDraftIds([])
                    }
                    return next
                  })
                }} 
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-bold ${selectMode ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <CheckSquare className="h-4 w-4" /> Select
              </button>
            </div>
          </div>

          {/* Batch Actions Panel */}
          {selectMode && selectedDraftIds.length > 0 && (
            <div className="flex flex-col gap-3 border-b border-slate-150 bg-emerald-50/20 px-5 py-3 dark:border-slate-850 dark:bg-emerald-950/10 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-white">
                  {selectedDraftIds.length}
                </div>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  已选择 <span className="font-extrabold text-slate-900 dark:text-white">{selectedDraftIds.length}</span> 个草稿
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleBatchApprove}
                  disabled={saving}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> 批量批准并发布
                </button>
                <button
                  onClick={handleBatchDiscard}
                  disabled={saving}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-rose-600 px-3 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> 批量删除
                </button>
                <button
                  onClick={() => setSelectedDraftIds([])}
                  disabled={saving}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  取消选择
                </button>
              </div>
            </div>
          )}

          {error && <div className="m-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

          <div className="min-h-[520px] p-3 md:p-5">
            {loading ? (
              <div className="flex h-72 items-center justify-center text-sm font-bold text-slate-400">加载草稿中...</div>
            ) : groupedDrafts.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
                <FileText className="h-10 w-10 text-slate-300" />
                <div className="text-sm font-bold text-slate-400">暂无匹配草稿</div>
              </div>
            ) : (
              <div className="space-y-7">
                {groupedDrafts.map(([heading, items]) => (
                  <section key={heading} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-black text-slate-900 dark:text-slate-50">{heading}</h3>
                      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                    </div>
                    <div className={`grid gap-3 ${compact ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'}`}>
                      {items.map((draft) => (
                        <DraftCard 
                          key={draft.id} 
                          draft={draft} 
                          compact={compact} 
                          selectMode={selectMode} 
                          selected={selectMode ? selectedDraftIds.includes(draft.id) : selectedId === draft.id} 
                          onOpen={() => handleCardClick(draft.id)} 
                          onSmartSchedule={() => handleSingleSmartSchedule(draft.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30 p-3 backdrop-blur-sm" onClick={closeEditor}>
          <div className="flex h-full w-full max-w-xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400 flex items-center gap-2">
                  <span>{selectedDraft ? STATUS_LABELS[selectedDraft.status] || selectedDraft.status : 'New draft'}</span>
                  {selectedDraft?.status === 'published' && selectedDraft.postUrl && (
                    <a
                      href={selectedDraft.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300 font-bold"
                    >
                      🔗 查看文章
                    </a>
                  )}
                </p>
                <h3 className="text-lg font-black text-slate-950 dark:text-white">
                  {selectedDraft ? (selectedDraft.status === 'published' ? '查看已发布文章' : '编辑草稿') : '新建草稿'}
                </h3>
              </div>
              <button onClick={closeEditor} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {selectedDraft?.status !== 'published' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">素材说明/今日主题</label>
                  <textarea
                    value={contentIdea}
                    onChange={(event) => setContentIdea(event.target.value)}
                    placeholder="输入内容创意或AI生成指令，例如：‘介绍我们的新菜单，突出新鲜食材和南洋风味’，AI将自动按所选平台特性重构文案..."
                    className="min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              )}
              
              {selectedDraft?.status !== 'published' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">创意 hooks (Creative Hooks)</label>
                    <button
                      type="button"
                      onClick={() => setShowHookGenerator(!showHookGenerator)}
                      className="inline-flex items-center gap-1 rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 text-[10px] font-extrabold transition-all"
                    >
                      <Sparkles className="h-3 w-3" />
                      {showHookGenerator ? '收起 Hooks 生成器' : 'Generate Hooks'}
                    </button>
                  </div>
                  <textarea
                    value={creativeHooks}
                    onChange={(event) => setCreativeHooks(event.target.value)}
                    placeholder="输入吸睛创意 hooks / 写作思路 / 爆款切入点，方便保存思路并供 AI 创作时使用..."
                    className="min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />

                  {showHookGenerator && (
                    <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/10 dark:bg-indigo-950/5 p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">行业类型</label>
                          <select
                            value={hookBusinessType}
                            onChange={(e) => setHookBusinessType(e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          >
                            <option value="F&B">餐饮美食 (F&B)</option>
                            <option value="eCommerce">电商零售 (eCommerce)</option>
                            <option value="SaaS">软件科技 (SaaS/IT)</option>
                            <option value="Coaching">知识博主 (Coach/Ed)</option>
                            <option value="LocalService">本地生活 (Service/Spa)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">钩子风格</label>
                          <select
                            value={hookStyle}
                            onChange={(e) => setHookStyle(e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          >
                            <option value="Contra-Narrative">打破认知 (反向阻断)</option>
                            <option value="Pain Point">痛点焦虑 (引发共鸣)</option>
                            <option value="Curiosity Gap">神秘好奇 (吸引留存)</option>
                            <option value="Direct Value">直接福利 (干货实操)</option>
                            <option value="Social Proof">数据背书 (建立信任)</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">产品主题/钩子核心词</label>
                        <input
                          type="text"
                          value={hookTopic}
                          onChange={(e) => setHookTopic(e.target.value)}
                          placeholder="例如：黄金流沙包、自动记账小程序... (为空则使用今日主题)"
                          className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={isGeneratingHooks}
                        onClick={handleGenerateHooks}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 px-3 py-2 text-xs font-bold text-white transition-colors disabled:opacity-50"
                      >
                        {isGeneratingHooks ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            正在生成 Reels 爆款 Hooks...
                          </>
                        ) : (
                          <>
                            <Zap className="h-3.5 w-3.5" />
                            生成 3 个爆款 Hooks
                          </>
                        )}
                      </button>

                      {generatedHooks.length > 0 && (
                        <div className="space-y-2 pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">推荐的 3 个高转化率 Opening Lines:</span>
                            <button
                              type="button"
                              onClick={handleGenerateHooks}
                              className="text-[10px] text-indigo-600 hover:underline font-bold dark:text-indigo-400"
                            >
                              重新生成
                            </button>
                          </div>
                          <div className="space-y-2.5">
                            {generatedHooks.map((h, i) => (
                              <div
                                key={i}
                                className="group relative rounded-md border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-950 p-3 hover:border-indigo-400 transition-all dark:hover:border-indigo-900"
                              >
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex items-start gap-1.5">
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 shrink-0 uppercase tracking-wide">屏幕贴纸</span>
                                    <span className="font-extrabold text-slate-900 dark:text-white leading-relaxed">{h.overlay}</span>
                                  </div>
                                  <div className="flex items-start gap-1.5">
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-black bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 shrink-0 uppercase tracking-wide">口播开头</span>
                                    <span className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium">{h.audio}</span>
                                  </div>
                                  <div className="flex items-start gap-1.5">
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 shrink-0 uppercase tracking-wide">画面设计</span>
                                    <span className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed italic">{h.visual}</span>
                                  </div>
                                </div>
                                <div className="mt-2.5 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const hookTextStr = `【画面设计】：${h.visual}\n【屏幕贴纸】：${h.overlay}\n【口播开头】：${h.audio}`
                                      setCreativeHooks(hookTextStr)
                                      setShowHookGenerator(false)
                                    }}
                                    className="inline-flex items-center gap-1 rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 text-[10px] font-bold transition-all"
                                  >
                                    <Check className="h-3 w-3" />
                                    选择此 Hook
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {selectedDraft && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">草稿正文 (Draft Caption)</label>
                    <textarea
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      placeholder="输入草稿正文..."
                      disabled={selectedDraft?.status === 'published'}
                      className="min-h-[160px] w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                  </div>
                  <input
                    value={hashtags}
                    onChange={(event) => setHashtags(event.target.value)}
                    placeholder="标签，用逗号分隔，例如 lunch, promo, weekend"
                    disabled={selectedDraft?.status === 'published'}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 min-h-[44px]">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">发布账号 (多选) <span className="text-red-500">*</span></p>
                  {accountOptions.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">未绑定任何账号</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {accountOptions.map((account) => {
                        const isSelected = selectedAccountIds.includes(account.id)
                        return (
                          <button
                            key={account.id}
                            type="button"
                            disabled={selectedDraft?.status === 'published'}
                            onClick={() => {
                              setSelectedAccountIds(prev => {
                                const next = prev.includes(account.id)
                                  ? prev.filter(id => id !== account.id)
                                  : [...prev, account.id]
                                setAccountId(next[0] || '')
                                return next
                              })
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all flex items-center gap-1.5 disabled:opacity-75 disabled:cursor-not-allowed ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-300'
                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            <span>{account.platformId.toLowerCase() === 'instagram' ? '📸' : account.platformId.toLowerCase() === 'facebook' ? '👥' : account.platformId.toLowerCase() === 'red' ? '📕' : account.platformId.toLowerCase() === 'tiktok' ? '🎵' : '🔗'}</span>
                            <span>{account.displayName || account.handle}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-end">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    disabled={selectedDraft?.status === 'published'}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              {selectedDraft && (
                <textarea
                  value={agentNote}
                  onChange={(event) => setAgentNote(event.target.value)}
                  placeholder="协作备注 / 修改说明"
                  disabled={selectedDraft?.status === 'published'}
                  className="min-h-20 w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              )}

              {/* Media & Assets Section */}
              <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-200">媒体与素材</h4>
                  <div className="flex items-center gap-2">
                    {attachedMedia.length > 0 && selectedDraft?.status !== 'published' && (
                      <button
                        type="button"
                        onClick={() => setAttachedMedia([])}
                        className="text-xs font-semibold text-rose-600 dark:text-rose-455 hover:underline cursor-pointer"
                      >
                        清空选择
                      </button>
                    )}
                    <span className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      已选: {attachedMedia.length}
                    </span>
                  </div>
                </div>

                {/* Drag-and-drop grid */}
                {attachedMedia.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400">
                      {selectedDraft?.status === 'published' ? '媒体内容' : '拖拽调整媒体排序'}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {attachedMedia.map((item, index) => {
                        const isVid = isVideoUrl(item.url)
                        return (
                          <div
                            key={`${item.type}-${item.id}-${index}`}
                            draggable={selectedDraft?.status !== 'published'}
                            onDragStart={(e) => selectedDraft?.status !== 'published' && handleDragStart(e, index)}
                            onDragOver={(e) => selectedDraft?.status !== 'published' && handleDragOver(e, index)}
                            onDragEnd={selectedDraft?.status !== 'published' ? handleDragEnd : undefined}
                            className={`relative aspect-square rounded-lg border border-slate-200 bg-slate-100 overflow-hidden dark:border-slate-800 dark:bg-slate-900 group shadow-sm transition-shadow ${
                              selectedDraft?.status === 'published'
                                ? 'cursor-default'
                                : draggedIndex === index
                                ? 'opacity-40 border-emerald-500 scale-95 cursor-grab active:cursor-grabbing'
                                : 'cursor-grab active:cursor-grabbing hover:shadow'
                            }`}
                          >
                            {isVid ? (
                              <video src={item.url.startsWith('http') ? item.url : `${item.url}#t=0.1`} preload="metadata" className="h-full w-full object-cover pointer-events-none" muted />
                            ) : (
                              <img src={item.url} className="h-full w-full object-cover pointer-events-none" alt="" />
                            )}
                            {selectedDraft?.status !== 'published' && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMedia(index)}
                                className="absolute top-1 right-1 rounded-full bg-red-500 hover:bg-red-600 p-1 text-white opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                            {isVid && (
                              <div className="absolute bottom-1 right-1 bg-black/50 p-0.5 rounded">
                                <Play className="h-3 w-3 text-white fill-white" />
                              </div>
                            )}
                            <div className={`absolute bottom-1 left-1 px-1 rounded text-[8px] font-black text-white ${
                              item.type === 'asset' ? 'bg-emerald-500/80' : 'bg-blue-500/80'
                            }`}>
                              {item.type === 'asset' ? '素材库' : '外链'}
                            </div>

                            {/* AI Image design & Video generation overlays */}
                            {selectedDraft?.status !== 'published' && item.type === 'asset' && !isVid && (
                              <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setActiveMediaOp({ index, action: 'design' })
                                    setMediaOpPrompt('')
                                  }}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] py-1 font-bold flex items-center justify-center gap-1"
                                >
                                  <Wand2 className="h-2.5 w-2.5" /> AI优化
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setActiveMediaOp({ index, action: 'video' })
                                    setMediaOpPrompt('')
                                  }}
                                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] py-1 font-bold flex items-center justify-center gap-1"
                                >
                                  <Video className="h-2.5 w-2.5" /> 生视频
                                </button>
                              </div>
                            )}

                            {/* Processing Overlay */}
                            {mediaProcessingIndex === index && (
                              <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center gap-1 z-20">
                                <Loader2 className="h-5 w-5 text-white animate-spin" />
                                <span className="text-[9px] text-white font-bold">
                                  {activeMediaOp?.action === 'video' ? '视频生成中...' : '图片优化中...'}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Inline media AI prompt form */}
                    {activeMediaOp && (
                      <div className="mt-3 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            {activeMediaOp.action === 'video' ? (
                              <>
                                <Video className="h-3.5 w-3.5 text-indigo-500" />
                                AI 图生视频 (第 {activeMediaOp.index + 1} 张图)
                              </>
                            ) : (
                              <>
                                <Wand2 className="h-3.5 w-3.5 text-emerald-500" />
                                AI 图片优化 (第 {activeMediaOp.index + 1} 张图)
                              </>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400">使用 Kie.ai API</span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={mediaOpPrompt}
                            onChange={(e) => setMediaOpPrompt(e.target.value)}
                            placeholder={
                              activeMediaOp.action === 'video'
                                ? "输入提示词，例如：'让锅里的食物冒热气，缓慢推近'..."
                                : "输入提示词，例如：'提高亮度，添加专业的美食滤镜'..."
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const item = attachedMedia[activeMediaOp.index]
                                if (item && item.type === 'asset') {
                                  handleMediaAIDesign(activeMediaOp.index, item.id, activeMediaOp.action)
                                }
                              }
                            }}
                            className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const item = attachedMedia[activeMediaOp.index]
                                if (item && item.type === 'asset') {
                                  handleMediaAIDesign(activeMediaOp.index, item.id, activeMediaOp.action)
                                }
                              }}
                              className="px-3 rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-bold hover:bg-slate-800"
                            >
                              确定
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMediaOp(null)
                                setMediaOpPrompt('')
                              }}
                              className="px-3 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 text-xs font-bold"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Add URL input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">添加外部媒体链接</label>
                  <div className="flex gap-2">
                    <input
                      value={newUrlInput}
                      disabled={selectedDraft?.status === 'published'}
                      onChange={(event) => setNewUrlInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          if (selectedDraft?.status !== 'published') handleAddUrl()
                        }
                      }}
                      placeholder="https://example.com/image.jpg"
                      className="h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      disabled={selectedDraft?.status === 'published'}
                      onClick={handleAddUrl}
                      className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      添加
                    </button>
                  </div>
                </div>

                {/* Browse brand assets */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">从品牌素材库中选择</label>
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md text-[10px] font-black">
                      {(['unused', 'all'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAssetTypeFilter(t)}
                          className={`px-2 py-0.5 rounded transition-all ${
                            assetTypeFilter === t
                              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                          }`}
                        >
                          {t === 'unused' ? '未使用' : '全部'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredAssets.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center dark:border-slate-800">
                      <p className="text-xs text-slate-400">
                        {assetTypeFilter === 'all' ? '暂无图片素材' : '品牌素材库中暂无素材'}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-300">请前往“素材”面板上传图片或视频</p>
                    </div>
                  ) : (
                    <>
                      <div className="max-h-[380px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-950 scrollbar-thin">
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
                          {filteredAssets.slice(0, assetPageSize).map((asset, idx) => {
                            const isSelected = selectedAssetIds.includes(asset.id)
                            const isVid = asset.mimeType.startsWith('video/')
                            return (
                              <div
                                key={asset.id}
                                className={`relative aspect-square rounded-xl overflow-hidden border bg-slate-100 dark:bg-slate-900 transition-all duration-200 group shadow-sm hover:scale-[1.03] hover:shadow-md ${
                                  isSelected 
                                    ? 'border-emerald-500 ring-2 ring-emerald-500/20' 
                                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-650'
                                }`}
                              >
                                <button
                                  type="button"
                                  disabled={selectedDraft?.status === 'published'}
                                  onClick={() => selectedDraft?.status !== 'published' && handleToggleAsset(asset)}
                                  className="absolute inset-0 w-full h-full text-left disabled:cursor-not-allowed"
                                >
                                  {isVid ? (
                                    <video src={asset.url.startsWith('http') ? asset.url : `${asset.url}#t=0.1`} preload="metadata" className="h-full w-full object-cover pointer-events-none" muted />
                                  ) : (
                                    <img src={asset.url} className="h-full w-full object-cover pointer-events-none" alt="" />
                                  )}
                                </button>

                                {isSelected && (
                                  <div className="absolute inset-0 bg-emerald-950/20 backdrop-blur-[0.5px] pointer-events-none" />
                                )}

                                {isSelected && (
                                  <div className={`absolute top-1.5 right-1.5 bg-emerald-500 rounded-full p-0.5 shadow-sm transition-colors z-10 ${selectedDraft?.status !== 'published' ? 'group-hover:bg-rose-600' : ''}`}>
                                    <Check className={`h-3 w-3 text-white stroke-[3px] block ${selectedDraft?.status !== 'published' ? 'group-hover:hidden' : ''}`} />
                                    {selectedDraft?.status !== 'published' && (
                                      <X className="h-3 w-3 text-white stroke-[3px] hidden group-hover:block" />
                                    )}
                                  </div>
                                )}

                                {isVid && (
                                  <div className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-[2px] p-1 rounded border border-white/10 shadow-sm pointer-events-none">
                                    <Play className="h-2.5 w-2.5 text-white fill-white" />
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setLightboxIndex(idx)
                                  }}
                                  className="absolute bottom-1.5 left-1.5 h-7 w-7 bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 backdrop-blur-md rounded-full shadow-sm flex items-center justify-center pointer-events-auto opacity-0 group-hover:opacity-100 transition-all duration-200 scale-90 group-hover:scale-100 z-10"
                                  title="预览大图"
                                >
                                  <Maximize2 className="h-3.5 w-3.5" />
                                </button>

                                {asset.filename && (
                                  <div className="absolute top-0 inset-x-0 bg-slate-950/70 p-1 text-[8px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    {asset.filename}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {filteredAssets.length > assetPageSize && (
                        <div className="flex justify-center pt-2">
                          <button
                            type="button"
                            onClick={() => setAssetPageSize(prev => prev + 12)}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 py-1.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-sm"
                          >
                            加载更多素材 (+12)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {selectedDraft?.status === 'pending_review' && (
                <textarea
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="审批意见，驳回时必填"
                  className="min-h-20 w-full rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-slate-800 outline-none focus:border-amber-400 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-slate-100"
                />
              )}

              {selectedDraft?.rejectionNote && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">驳回意见：{selectedDraft.rejectionNote}</div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800 w-full">
              <button
                type="button"
                onClick={() => {
                  const newCaptions: Record<string, string> = {}
                  const newHashtags: Record<string, string> = {}
                  const newStatuses: Record<string, 'generating' | 'completed' | 'failed'> = {}
                  selectedAccountIds.forEach(accId => {
                    newCaptions[accId] = caption
                    newHashtags[accId] = hashtags
                    newStatuses[accId] = 'completed'
                  })
                  setDraftCaptions(newCaptions)
                  setDraftHashtags(newHashtags)
                  setDraftStatuses(newStatuses)
                  setPreviewOnly(true)
                  setPreviewModalOpen(true)
                }}
                className={`rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 flex items-center gap-2 ${(!selectedDraft || selectedDraft.status === 'published') ? 'mr-auto' : ''}`}
              >
                <Eye className="h-4 w-4" /> 预览效果
              </button>
              {selectedDraft && selectedDraft.status !== 'published' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => discardDraft(selectedDraft.id)}
                  className="rounded-md border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30 flex items-center gap-1.5 mr-auto"
                >
                  <Trash2 className="h-4 w-4" /> 废弃
                </button>
              )}
              {selectedDraft?.status === 'published' ? (
                selectedDraft.postUrl ? (
                  <a
                    href={selectedDraft.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white transition-colors animate-pulse"
                  >
                    打开已发布文章
                  </a>
                ) : (
                  <button
                    disabled
                    className="inline-flex items-center gap-2 rounded-md bg-slate-300 dark:bg-slate-700 px-4 py-2 text-sm font-bold text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  >
                    打开已发布文章 (暂无链接)
                  </button>
                )
              ) : (
                <>
                  <button
                    type="button"
                    disabled={saving || (!caption.trim() && !contentIdea.trim()) || selectedAccountIds.length === 0 || isAiGenerating}
                    onClick={async () => {
                      setSaving(true)
                      try {
                        const targetAccountIds = [...selectedAccountIds]
                        const hasRed = targetAccountIds.some(id => {
                          const acc = accounts.find(a => a.id === id)
                          return acc && ['red', 'xiaohongshu', 'xhs'].includes(String(acc.platformId || '').toLowerCase())
                        })
                        if (!hasRed) {
                          const configRed = accounts.find(a => ['red', 'xiaohongshu', 'xhs'].includes(String(a.platformId || '').toLowerCase()))
                          if (configRed) {
                            targetAccountIds.push(configRed.id)
                          } else {
                            targetAccountIds.push('unconfigured_red')
                          }
                        }

                        const saved = await saveDraft('draft', '【AI 正在创作中...】', targetAccountIds)
                        if (saved && saved.length > 0) {
                          const newSelectedIds = targetAccountIds.map(id => {
                            if (id === 'unconfigured_red') {
                              const match = saved.find(d => ['red', 'xiaohongshu', 'xhs'].includes(String(d.account?.platformId || '').toLowerCase()))
                              return match ? (match.accountId || id) : id
                            }
                            if (id === 'unconfigured_google_business') {
                              const match = saved.find(d => ['google_business', 'google', 'google_maps'].includes(String(d.account?.platformId || '').toLowerCase()))
                              return match ? (match.accountId || id) : id
                            }
                            if (id === 'unconfigured_instagram') {
                              const match = saved.find(d => String(d.account?.platformId || '').toLowerCase() === 'instagram')
                              return match ? (match.accountId || id) : id
                            }
                            if (id === 'unconfigured_facebook') {
                              const match = saved.find(d => String(d.account?.platformId || '').toLowerCase() === 'facebook')
                              return match ? (match.accountId || id) : id
                            }
                            if (id === 'unconfigured_tiktok') {
                              const match = saved.find(d => String(d.account?.platformId || '').toLowerCase() === 'tiktok')
                              return match ? (match.accountId || id) : id
                            }
                            return id
                          }).filter((id): id is string => !!id)

                          const newCaptions: Record<string, string> = {}
                          const newHashtags: Record<string, string> = {}
                          const newStatuses: Record<string, 'generating' | 'completed' | 'failed'> = {}
                          saved.forEach(d => {
                            const accId = d.accountId || ''
                            newCaptions[accId] = '【AI 正在创作中...】'
                            newHashtags[accId] = ''
                            newStatuses[accId] = 'generating'
                          })

                          setCreatedDrafts(saved)
                          setSelectedAccountIds(newSelectedIds)
                          setDraftCaptions(newCaptions)
                          setDraftHashtags(newHashtags)
                          setDraftStatuses(newStatuses)
                          setIsAiGenerating(true)
                          setPreviewOnly(false)
                          setPreviewModalOpen(true)

                          // Trigger AI copywriting in parallel
                          await Promise.all(
                            saved.map(draft => triggerCopywriter(draft.id, true))
                          )
                        }
                      } catch (e: any) {
                        alert(e.message || 'AI 创作失败')
                      } finally {
                        setSaving(false)
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    ✨ AI 创作
                  </button>
                  <button
                    disabled={saving || (!caption.trim() && !contentIdea.trim()) || selectedAccountIds.length === 0}
                    onClick={async () => {
                      const saved = await saveDraft('draft')
                      if (saved) closeEditor()
                    }}
                    className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    保存
                  </button>
                  {selectedDraft && ['draft', 'failed'].includes(selectedDraft.status) && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSingleSmartSchedule(selectedDraft.id)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      <Sparkles className="h-4 w-4" /> 智能排期
                    </button>
                  )}

                  {selectedDraft?.status === 'pending_review' && (
                    <>
                      <button
                        type="button"
                        disabled={saving || isAiGenerating}
                        onClick={async () => {
                          setSaving(true)
                          try {
                            const targetAccountIds = [...selectedAccountIds]
                            const hasRed = targetAccountIds.some(id => {
                              const acc = accounts.find(a => a.id === id)
                              return acc && ['red', 'xiaohongshu', 'xhs'].includes(String(acc.platformId || '').toLowerCase())
                            })
                            if (!hasRed) {
                              const configRed = accounts.find(a => ['red', 'xiaohongshu', 'xhs'].includes(String(a.platformId || '').toLowerCase()))
                              if (configRed) {
                                targetAccountIds.push(configRed.id)
                              } else {
                                targetAccountIds.push('unconfigured_red')
                              }
                            }

                            const saved = await saveDraft(selectedDraft?.status || 'draft', '【AI 正在创作中...】', targetAccountIds)
                            if (saved && saved.length > 0) {
                              const newSelectedIds = targetAccountIds.map(id => {
                                if (id === 'unconfigured_red') {
                                  const match = saved.find(d => ['red', 'xiaohongshu', 'xhs'].includes(String(d.account?.platformId || '').toLowerCase()))
                                  return match ? (match.accountId || id) : id
                                }
                                if (id === 'unconfigured_google_business') {
                                  const match = saved.find(d => ['google_business', 'google', 'google_maps'].includes(String(d.account?.platformId || '').toLowerCase()))
                                  return match ? (match.accountId || id) : id
                                }
                                if (id === 'unconfigured_instagram') {
                                  const match = saved.find(d => String(d.account?.platformId || '').toLowerCase() === 'instagram')
                                  return match ? (match.accountId || id) : id
                                }
                                if (id === 'unconfigured_facebook') {
                                  const match = saved.find(d => String(d.account?.platformId || '').toLowerCase() === 'facebook')
                                  return match ? (match.accountId || id) : id
                                }
                                if (id === 'unconfigured_tiktok') {
                                  const match = saved.find(d => String(d.account?.platformId || '').toLowerCase() === 'tiktok')
                                  return match ? (match.accountId || id) : id
                                }
                                return id
                              }).filter((id): id is string => !!id)

                              const newCaptions: Record<string, string> = {}
                              const newHashtags: Record<string, string> = {}
                              const newStatuses: Record<string, 'generating' | 'completed' | 'failed'> = {}
                              saved.forEach(d => {
                                const accId = d.accountId || ''
                                newCaptions[accId] = '【AI 正在创作中...】'
                                newHashtags[accId] = ''
                                newStatuses[accId] = 'generating'
                              })

                              setCreatedDrafts(saved)
                              setSelectedAccountIds(newSelectedIds)
                              setDraftCaptions(newCaptions)
                              setDraftHashtags(newHashtags)
                              setDraftStatuses(newStatuses)
                              setIsAiGenerating(true)
                              setPreviewOnly(false)
                              setPreviewModalOpen(true)

                              // Trigger AI copywriting in parallel
                              await Promise.all(
                                saved.map(draft => triggerCopywriter(draft.id, true))
                              )
                            }
                          } catch (e: any) {
                            alert(e.message || 'AI 重新创作失败')
                          } finally {
                            setSaving(false)
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        ✨ AI 重新创作
                      </button>
                      <button disabled={saving} onClick={() => reviewDraft('reject')} className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" /> 驳回</button>
                      <button disabled={saving} onClick={() => reviewDraft('approve')} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" /> 批准</button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Platform Preview Mockups Dialog */}
      <PostPreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        brandName={brandName}
        selectedAccountIds={selectedAccountIds}
        accountOptions={accounts}
        draftCaptions={draftCaptions}
        setDraftCaptions={setDraftCaptions}
        draftHashtags={draftHashtags}
        setDraftHashtags={setDraftHashtags}
        draftStatuses={draftStatuses}
        isAiGenerating={isAiGenerating}
        saving={saving}
        attachedMedia={attachedMedia}
        onCancel={handleCancelCreation}
        onSaveDraft={handleSaveDraftsFromModal}
        onSchedule={handleSmartScheduleFromModal}
        onRegenerate={handleRegenerate}
        previewOnly={previewOnly}
      />

      {/* Lightbox Preview Modal */}
      {lightboxIndex !== null && filteredAssets[lightboxIndex] && (() => {
        const asset = filteredAssets[lightboxIndex]
        const isVid = asset.mimeType.startsWith('video/')
        const isSelected = selectedAssetIds.includes(asset.id)
        
        return (
          <div 
            className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
            onClick={() => setLightboxIndex(null)}
          >
            {/* Top Toolbar */}
            <div className="w-full flex items-center justify-between px-4 py-2 bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl max-w-5xl z-10" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col text-left">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">素材库预览 ({lightboxIndex + 1} / {filteredAssets.length})</span>
                <span className="text-sm text-white font-black truncate max-w-md mt-0.5">{asset.filename || '未命名素材'}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setLightboxIndex(null)} 
                className="h-9 w-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Media Content Area */}
            <div className="flex-1 w-full flex items-center justify-center relative py-6" onClick={(e) => e.stopPropagation()}>
              {/* Previous Button */}
              <button
                type="button"
                onClick={() => setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredAssets.length - 1))}
                className="absolute left-4 lg:left-8 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg border border-white/5 z-10"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              {/* Media Display */}
              <div className="max-h-[70vh] max-w-[85vw] flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl relative bg-slate-900/50 p-1 border border-white/10">
                {isVid ? (
                  <video src={asset.url.startsWith('http') ? asset.url : `${asset.url}#t=0.1`} controls autoPlay className="max-h-[70vh] max-w-[85vw] object-contain rounded-xl" />
                ) : (
                  <img src={asset.url} className="max-h-[70vh] max-w-[85vw] object-contain rounded-xl" alt="" />
                )}
              </div>

              {/* Next Button */}
              <button
                type="button"
                onClick={() => setLightboxIndex((prev) => (prev !== null && prev < filteredAssets.length - 1 ? prev + 1 : 0))}
                className="absolute right-4 lg:right-8 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg border border-white/5 z-10"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>

            {/* Bottom Actions Bar */}
            <div className="w-full flex items-center justify-center gap-3 py-2 z-10" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                disabled={selectedDraft?.status === 'published'}
                onClick={() => selectedDraft?.status !== 'published' && handleToggleAsset(asset)}
                className={`px-6 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                }`}
              >
                {isSelected ? (
                  <>
                    <X className="h-4 w-4 stroke-[3px]" />
                    <span>取消选择此素材</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 stroke-[3px]" />
                    <span>选择此素材</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function FilterSelect({ icon, value, onChange, options }: { icon: React.ReactNode; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="relative inline-flex h-9 items-center rounded-md border border-slate-200 bg-white pl-3 pr-8 text-sm font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
      <span className="mr-2 text-slate-400">{icon}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="appearance-none bg-transparent outline-none">
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>{label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-400" />
    </label>
  )
}

function DraftCard({ 
  draft, 
  compact, 
  selectMode, 
  selected, 
  onOpen, 
  onSmartSchedule 
}: { 
  draft: DraftItem 
  compact: boolean 
  selectMode: boolean 
  selected: boolean 
  onOpen: () => void 
  onSmartSchedule?: () => void 
}) {
  const media = mediaForDraft(draft)
  const platform = draft.account?.platformId
  const accountName = draft.account?.displayName || draft.account?.handle || platformLabel(platform)

  return (
    <div
      onClick={onOpen}
      className={`group overflow-hidden rounded-lg border bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900 cursor-pointer ${selected ? 'border-emerald-400 ring-2 ring-emerald-100 dark:ring-emerald-900/40' : 'border-slate-200 dark:border-slate-800'}`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          {selectMode && (
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-200 ${selected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-transparent'}`}>
              {selected && <Check className="h-3 w-3 stroke-[3px]" />}
            </span>
          )}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white dark:bg-white dark:text-slate-900">{accountInitial(draft)}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{accountName}</p>
            <p className="text-xs font-semibold text-slate-400">{formatCardTime(draftTimestamp(draft))}</p>
          </div>
        </div>
        <MoreVertical className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
      </div>

      {media.length > 0 ? (
        <div className={`grid gap-1 bg-slate-100 p-1 dark:bg-slate-950 ${media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {media.map((url, index) => (
            <div key={`${url}-${index}`} className={`overflow-hidden rounded bg-slate-200 dark:bg-slate-800 relative ${compact ? 'aspect-[4/3]' : 'aspect-square'}`}>
              {isVideoUrl(url) ? (
                <>
                  <video src={url} className="h-full w-full object-cover" muted />
                  <div className="absolute bottom-1 right-1 bg-black/50 p-1 rounded">
                    <Play className="h-3 w-3 text-white fill-white" />
                  </div>
                </>
              ) : (
                <img src={url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={`flex items-center justify-center bg-slate-100 text-slate-300 dark:bg-slate-950 ${compact ? 'h-20' : 'h-36'}`}>
          <FileText className="h-9 w-9" />
        </div>
      )}

      <div className="space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${platformBadgeClass(platform)}`}>{platformLabel(platform)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${STATUS_CLASSES[draft.status] || STATUS_CLASSES.draft}`}>{STATUS_LABELS[draft.status] || draft.status}</span>
        </div>
        <p className={`${compact ? 'line-clamp-2' : 'line-clamp-3'} text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200`}>{draft.caption || 'Untitled draft'}</p>
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-400">
          <span className="truncate">{draft.hashtags.map((tag) => `#${tag}`).join(' ') || 'No tags'}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {['draft', 'failed'].includes(draft.status) && !selectMode && onSmartSchedule && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onSmartSchedule()
                }}
                className="inline-flex items-center gap-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2 py-1 text-[11px] border border-indigo-100 transition-colors"
              >
                <Sparkles className="h-3 w-3" /> 智能排期
              </button>
            )}
            <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> View</span>
          </div>
        </div>
      </div>
    </div>
  )
}
