'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  GraduationCap,
  HelpCircle,
  BookOpen,
  ShoppingBag,
  Award,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowRight,
  Clock,
  Sparkles,
  Lock,
  ShieldAlert,
  Tags,
  PlayCircle,
  AlertTriangle,
  Download,
  Calendar,
  ExternalLink,
  Search,
  Star,
  TrendingUp
} from 'lucide-react'

export default function LearnPage() {
  const [activeTab, setActiveTab] = useState<'qa' | 'manual' | 'skills' | 'school'>('qa')
  
  // Q&A Category States
  const [qaSearch, setQaSearch] = useState('')
  const [qaCategory, setQaCategory] = useState<'all' | 'accounts' | 'posts' | 'influencers' | 'billing' | 'reports'>('all')
  const [openFaq, setOpenFaq] = useState<string | null>(null)

  // Manual Chapter States
  const [manualSearch, setManualSearch] = useState('')
  const [openManualSection, setOpenManualSection] = useState<string | null>('part2')
  
  // Skill Hub Toggles
  const [skillCategory, setSkillCategory] = useState<'all' | 'marketing' | 'content' | 'self-improvement' | 'other'>('all')
  const [installedSkills, setInstalledSkills] = useState<string[]>(['social-writer', 'review-defender', 'analytics-logger'])

  // School Curriculum Category States
  const [schoolCategory, setSchoolCategory] = useState<'courses' | 'cases' | 'calendar'>('courses')

  // FAQ Wording Drafts
  const faqs = [
    {
      id: 'q1',
      category: 'accounts',
      q: '为什么手动添加的账号无法用于内容发布？',
      a: '手动添加账号（填写账号密码）仅用于本地前台自动化运行脚本及数据爬取使用（例如模拟前台自然点击以规避风控，安全免封）。要使 AI 虚拟员工能够自动发帖和进行日历排程，必须在集成配置中填入您的 PostFast API Key，并通过官方 OAuth 流程授权绑定。',
      tag: '账号与接入'
    },
    {
      id: 'q2',
      category: 'accounts',
      q: 'PostFast OAuth 授权的正确步骤是什么？',
      a: '步骤一：在看板聊天框向 AI 发送指令“帮我生成 PostFast 账号绑定链接”；步骤二：点击 AI 返回的专属链接，在 PostFast 页面中选择对应渠道授权；步骤三：授权完毕后，返回 AMC 控制台刷新或重新保存配置，账号即自动同步出现。具体步骤详见使用手册 SOP-001。',
      tag: '账号与接入'
    },
    {
      id: 'q3',
      category: 'accounts',
      q: '支持哪些社交平台？',
      a: '目前系统全面支持小红书、Instagram、Facebook、TikTok、Google Business Profile (GBP)、Yelp 等主流平台账号的发布管理、数据监控或评论回复。',
      tag: '账号与接入'
    },
    {
      id: 'q4',
      category: 'accounts',
      q: '账号断连了怎么办？',
      a: '如果由于 OAuth 令牌过期导致账号断开连接，您只需前往“集成配置”页面，在对应账号后点击“重新授权”，按照提示完成 PostFast 重新授权即可。详见 SOP-002。',
      tag: '账号与接入'
    },
    {
      id: 'q5',
      category: 'posts',
      q: 'AMC 多久发布一次内容？',
      a: 'AI 员工会根据您在设置中配置的“每日发帖容量上限”以及素材库中打上“排期发布”标签的素材，自动进行推文排版和日历排程。通常在各社交平台的流量高峰时间段由 AI 触发自动发送。',
      tag: '内容发布'
    },
    {
      id: 'q6',
      category: 'posts',
      q: '我需要审核每一条内容吗？',
      a: '这完全取决于您的发布模式。在“老板审批”模式下，AI 创作的每一篇草稿都会以 pending_review 状态死锁在看板上，生成 require_input 任务，必须由主理人手动确认；在“自动驾驶”模式下，AI 员工会在文案符合品牌调性阈值后自动排期发布。',
      tag: '内容发布'
    },
    {
      id: 'q7',
      category: 'posts',
      q: '如何修改已排期的内容？',
      a: '您可以在看板或内容日历中找到已排期的内容卡片，点击进入详情页，可直接修改文案、图片或调整发布时间，保存后系统会自动同步更新。',
      tag: '内容发布'
    },
    {
      id: 'q8',
      category: 'posts',
      q: '发布失败了怎么处理？',
      a: '可在看板上点击查看失败的任务卡片以获取详细报错日志。最常见的原因是社交账号的 OAuth 令牌过期导致断连，请执行 SOP-002 重新授权后，在任务卡片上点击“重试发布”即可重新排队发送。',
      tag: '内容发布'
    },
    {
      id: 'q9',
      category: 'influencers',
      q: '达人探店/合作，谁来负责执行？',
      a: '为了确保品牌定位与现场配合的绝对掌控，达人合作与到店体验由主理人在线下完全自主发起和安排（包括达人筛选、沟通邀约、现场接待以及费用结算）。AMC 的 AI 虚拟员工不参与达人的评估筛选，仅在预设的推广节点在看板上自动生成 require_input 状态的任务卡片，向您收集现场拍摄的照片或视频素材。',
      tag: '达人探店'
    },
    {
      id: 'q10',
      category: 'influencers',
      q: 'AMC 协助筛选达人吗？',
      a: 'AMC 系统不负责达人筛选、甄别与外联邀约。该决策权和执行过程完全交给主理人，主理人可结合本地趋势自主挑选最契合品牌的达人伙伴。在达人产出素材后，您可以直接将照片或视频上传至看板任务，由 AI 协助内容排版。',
      tag: '达人探店'
    },
    {
      id: 'q11',
      category: 'influencers',
      q: '达人费用如何结算？',
      a: '所有的合作形式（如免费产品置换或付现合作）及费用结算完全由主理人与达人在线下直接商定和执行。AMC 订阅套餐仅覆盖系统功能使用、AI Agent 运营编排及自动化发布，不包含支付给达人的合作费用。',
      tag: '达人探店'
    },
    {
      id: 'q12',
      category: 'influencers',
      q: '探店素材如何上传与发布？',
      a: '当看板上出现标红的 Require Input 达人探店素材上传任务时，点击卡片并将收集的高清图片与短视频素材上传。点击 Resume 确认后，AI 虚拟员工将自动进行小红书/Instagram 等多平台推文编写、Hashtags 匹配与排期发布。',
      tag: '达人探店'
    },
    {
      id: 'q13',
      category: 'billing',
      q: '三个套餐的核心区别是什么？',
      a: 'Essential（基础版）仅提供核心发帖与看板协作；Growth（增长版）新增了自动处理 Google Review / 同城趋势监控及支持探店素材收集发布功能；Scale（规模版）额外支持多门店管理、深度品牌 Memory 自动巡检和定制化 AI 能力。',
      tag: '订阅与账单'
    },
    {
      id: 'q14',
      category: 'billing',
      q: '中途升级套餐如何操作？',
      a: '您可以在任意时间进入设置中心 ➜ 订阅计划中点击升级。系统会自动按当前账期剩余天数折算费用，并立即解锁高级功能。',
      tag: '订阅与账单'
    },
    {
      id: 'q15',
      category: 'billing',
      q: '创始会员优惠如何申请？',
      a: '如果您是受邀参与测试的创始会员，可在支付页面输入您的专属激活码，或联系 AMC 客服进行人工审核并申请续费折扣。',
      tag: '订阅与账单'
    },
    {
      id: 'q16',
      category: 'reports',
      q: '月度报告包含哪些数据？',
      a: '月度报告汇总了各平台的总触达（Reach）、总互动率（Engagement Rate）、粉丝净增长、Google 评分变化、以及排名前 5 的爆款贴文。',
      tag: '数据与报告'
    },
    {
      id: 'q17',
      category: 'reports',
      q: '如何查看单条内容的表现？',
      a: '在主控面板的“数据报告”区域或“已发布”任务卡片中，点击具体的推文，即可查看其在对应平台上的实时点赞、分享、评论 and 曝光数据。',
      tag: '数据与报告'
    },
    {
      id: 'q18',
      category: 'reports',
      q: '数据多久更新一次？',
      a: '系统通过 PostFast 及各大平台的 API 接口，每日晚上自动拉取并更新前一日的最新互动与曝光数据。',
      tag: '数据与报告'
    }
  ]

  // Filtered FAQs based on category + search
  const filteredFaqs = useMemo(() => {
    return faqs.filter(faq => {
      const matchCat = qaCategory === 'all' || faq.category === qaCategory
      const matchSearch =
        faq.q.toLowerCase().includes(qaSearch.toLowerCase()) ||
        faq.a.toLowerCase().includes(qaSearch.toLowerCase())
      return matchCat && matchSearch
    })
  }, [qaCategory, qaSearch])

  // Skill Hub Data
  const skills = [
    {
      id: 'social-writer',
      category: 'content',
      title: '社交内容创作官 (Social Content Writer)',
      desc: '识别产品图自动生成多语言推文草稿；自动解析热门小红书排版与 Hashtag。',
      icon: '📝',
      rating: '4.9',
      installs: '1,280+',
      features: ['多平台配图分析', '小红书精细排版与 Hashtags', '自动生成本地化 Hooks']
    },
    {
      id: 'review-defender',
      category: 'marketing',
      title: '本地口碑守护者 (GBP & Review Defender)',
      desc: '24小时监控 Google Maps / 美团商家评价。5星好评由 AI 极速秒回以提升搜索引擎权重；低分差评私下拦截并生成看板预警，自动分发关怀优惠券。',
      icon: '⭐',
      rating: '5.0',
      installs: '940+',
      features: ['24h 差评预警', '五星好评秒回', '自动分发关怀礼券']
    },
    {
      id: 'trend-hunter',
      category: 'marketing',
      title: '同城热点观察哨 (Local Trend Hunter)',
      desc: '每日两次扫描同城本地生活热门话题及竞品曝光，自动为创作线索提供本地化 Hook。',
      icon: '🔎',
      rating: '4.7',
      installs: '430+',
      features: ['同城热搜关键词提取', '文案爆款趋势解析', '同城爆品情报监控']
    },
    {
      id: 'analytics-logger',
      category: 'self-improvement',
      title: '数据巡检与记忆日志 (Analytics & Memory Logger)',
      desc: '周日自动拉取 PostFast / Lark 运营数据，整理成周报文档写入品牌 Memory 并回流看板。',
      icon: '🪵',
      rating: '4.8',
      installs: '860+',
      features: ['指标分析报表', '自动回写 Memory', '周报推送与建议']
    },
    {
      id: 'holiday-pack',
      category: 'content',
      title: '节假日营销专项包 (Holiday Campaign Pack)',
      desc: '提前包含新加坡本地传统及公共节日（华人新年/圣诞/国庆节）的专属活动文案模板与配图节奏建议。',
      icon: '🎉',
      rating: '4.9',
      installs: '310+',
      features: ['节日文案库', '智能推荐发布节奏', '节日特定模板']
    },
    {
      id: 'product-photos',
      category: 'content',
      title: '产品摄影与视觉优化插件',
      desc: '支持通过 AI 滤镜算法与排版优化方案，使产品宣传图具备“日式清新”、“现代简约”、“高端质感”等高社交属性格调。',
      icon: '📸',
      rating: '4.6',
      installs: '190+',
      features: ['风格化调色建议', '排版布局模版', '构图视觉指导']
    },
    {
      id: 'voucher-converter',
      category: 'marketing',
      title: '团购转化与卡券推广包',
      desc: '针对各大平台或本地卡券上线的推广活动。AI 自动在社交媒体生成带卡券倒计时和“限时抢购”引流推文。',
      icon: '🏷️',
      rating: '4.8',
      installs: '540+',
      features: ['卡券倒计时设计', '推广文案库', '卡券分发状态监测']
    }
  ]

  const filteredSkills = useMemo(() => {
    return skills.filter(s => skillCategory === 'all' || s.category === skillCategory)
  }, [skillCategory])

  const handleToggleSkill = (id: string) => {
    if (installedSkills.includes(id)) {
      setInstalledSkills(installedSkills.filter(s => s !== id))
    } else {
      setInstalledSkills([...installedSkills, id])
    }
  }

  // School Calendar Data
  const calendarEvents = [
    { date: '1月-2月', event: '农历华人新年 (Chinese New Year)', tip: '提前15天开始上线新年限定礼盒、新春大促推广。AI 建议：结合小红书喜庆排版发布礼盒开箱与主打产品种草视频。' },
    { date: '4月-5月', event: '开斋节 (Hari Raya Puasa)', tip: '适合推出节日限定礼包和多元化本地社区故事推广。AI 建议：在 Instagram 强调本地化社区互动与温情故事。' },
    { date: '6月', event: '端午节 (Dragon Boat Festival)', tip: '主推端午限定款产品、预售倒计时。AI 建议：在看板上传产品制作或包装过程视频素材，由 AI 自动剪辑生成预热脚本。' },
    { date: '8月9日', event: '新加坡国庆节 (National Day)', tip: '全岛爱国狂欢日，主推国庆红白主题产品、限时买一送一或国庆专属折扣活动推广。' },
    { date: '9月-10月', event: '中秋节 (Mid-Autumn Festival)', tip: '主推中秋联名/限定礼盒定制送礼活动。AI 建议：提前20天开启小红书种草预售。' },
    { date: '12月25日', event: '圣诞节 (Christmas)', tip: '西方传统大节。主推圣诞限定礼品包、年终大促活动。AI 建议: 主打高质感节日氛围、暖色调视觉风格。' }
  ]

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="mx-auto max-w-5xl px-6 py-12">
        
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Link
            href="/board"
            className="inline-flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            ← 返回主控面板
          </Link>
        </div>

        {/* Learning Hub Banner */}
        <header className="mb-10 relative">
          <div className="absolute top-0 right-0 opacity-15 blur-3xl w-64 h-64 bg-indigo-600 rounded-full pointer-events-none"></div>
          
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
            <GraduationCap size={14} /> AMC 学习与赋能中心
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            AMC 学习中心
          </h1>
          <p className="mt-3 max-w-3xl text-sm sm:text-base text-slate-450 leading-relaxed">
            掌握 AMC，让每一分订阅费发挥最大价值。这是一站式餐饮/零售品牌主理人与 AI 员工深度协作的指南中心。
          </p>
        </header>

        {/* Grid Main 4 Tabs */}
        <div className="mb-10 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { id: 'qa', label: '❓ 常见问题 (Q&A)', desc: '快速解答操作与发布疑问' },
            { id: 'manual', label: '📋 使用手册 (Manual)', desc: '标准协作 SOP 与系统说明' },
            { id: 'skills', label: '🛒 技能中心 (Skill Hub)', desc: '精选营销与内容创作技能包' },
            { id: 'school', label: '🎓 AMC 学院 (School)', desc: '流量提效与本地营销知识' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'qa' | 'manual' | 'skills' | 'school')}
              className={`p-4 rounded-2xl border text-left transition-all duration-300 ${
                activeTab === tab.id
                  ? 'border-indigo-500 bg-indigo-950/40 shadow-lg shadow-indigo-950/40'
                  : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700/80 hover:bg-slate-900/60 cursor-pointer'
              }`}
            >
              <h3 className="font-bold text-sm sm:text-base text-slate-100 flex items-center gap-1.5">
                {tab.label}
              </h3>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                {tab.desc}
              </p>
            </button>
          ))}
        </div>

        {/* Tab content panel */}
        <section className="min-h-[500px]">

          {/* 1. FAQ Tab */}
          {activeTab === 'qa' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* FAQ Search and Filter Header */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between border-b border-slate-800/80 pb-4">
                <div className="flex flex-wrap gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80">
                  {[
                    { id: 'all', label: '全部' },
                    { id: 'accounts', label: '账号接入' },
                    { id: 'posts', label: '内容发布' },
                    { id: 'influencers', label: '达人探店' },
                    { id: 'billing', label: '订阅账单' },
                    { id: 'reports', label: '数据报告' }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setQaCategory(cat.id as typeof qaCategory)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        qaCategory === cat.id
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Search Box */}
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={qaSearch}
                    onChange={e => setQaSearch(e.target.value)}
                    placeholder="搜索常见问题..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/40 text-xs font-semibold text-slate-200 placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
              </div>

              {/* FAQ Accordion List */}
              <div className="space-y-4">
                {filteredFaqs.length > 0 ? (
                  filteredFaqs.map((faq) => {
                    const isOpen = openFaq === faq.id
                    return (
                      <div
                        key={faq.id}
                        className={`rounded-xl border transition-all duration-200 ${
                          isOpen
                            ? 'border-indigo-500/40 bg-slate-900/60 shadow shadow-indigo-950/20'
                            : 'border-slate-800/80 bg-slate-900/20 hover:border-slate-700/80 hover:bg-slate-900/40'
                        }`}
                      >
                        <div
                          onClick={() => setOpenFaq(isOpen ? null : faq.id)}
                          className="flex items-center justify-between p-4 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3">
                            <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-400 border border-indigo-500/20">
                              {faq.tag}
                            </span>
                            <h3 className="font-bold text-slate-100 text-sm sm:text-base pr-4">
                              {faq.q}
                            </h3>
                          </div>
                          <div className="text-slate-500">
                            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>

                        {isOpen && (
                          <div className="border-t border-slate-800/80 p-5 bg-slate-950/50 rounded-b-xl text-slate-350 text-sm leading-relaxed whitespace-pre-wrap">
                            {faq.a}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <div className="py-20 text-center text-slate-500 text-xs">
                    没有找到符合筛选条件的常见问题。
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. User Manual Tab */}
          {activeTab === 'manual' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-in fade-in duration-200">
              
              {/* Left Navigation Menu */}
              <div className="md:col-span-4 space-y-2">
                <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest px-3">手册章节目录</p>
                {[
                  { id: 'part1', label: 'Part 1：系统概览与工作循环' },
                  { id: 'part2', label: 'Part 2：账号接入操作 (SOP)' },
                  { id: 'part3', label: 'Part 3：日常内容协作 (SOP)' },
                  { id: 'part4', label: 'Part 4：达人探店流程 (SOP)' },
                  { id: 'part5', label: 'Part 5：常见故障自查' }
                ].map(chap => (
                  <button
                    key={chap.id}
                    onClick={() => setOpenManualSection(chap.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                      openManualSection === chap.id
                        ? 'bg-indigo-600/15 border-indigo-500/35 text-indigo-400 shadow'
                        : 'border-transparent text-slate-400 hover:bg-slate-900/50 hover:text-slate-200 cursor-pointer'
                    }`}
                  >
                    {chap.label}
                  </button>
                ))}
              </div>

              {/* Right Content View */}
              <div className="md:col-span-8 space-y-6">
                
                {/* Part 1 */}
                {openManualSection === 'part1' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Part 1：系统概览与工作循环</h2>
                    
                    <div className="space-y-4 text-slate-350 text-sm leading-relaxed">
                      <div>
                        <h3 className="font-bold text-slate-200 text-base mb-1.5">1.1 AMC 是什么</h3>
                        <p>AMC（AI Marketing Crew）是一个整体的 AI 营销团队，而非简单的一个工具。团队由 <strong>AMC Agent</strong>（AI 虚拟员工）和 <strong>AMC 品牌主理人</strong>（人工对接人）共同组成。您无需区分哪件事是 AI 做的、哪件事是人工做的——对您来说，这是一个整体的营销支撑团队。在 AMC 团队中，主理人与 AMC Agent 是紧密合作的同事，共同为您服务。您只需要关注：提出需求、审核关键决策、以及在达人探店当天做好现场接待。</p>
                      </div>

                      <div className="h-px bg-slate-800/50 my-2" />

                      <div>
                        <h3 className="font-bold text-slate-200 text-base mb-1.5">1.2 与 AMC 团队的标准工作循环</h3>
                        <p>AMC 的工作以月为单位持续循环开展。在一个新品牌开工后，工作循环如下：</p>
                        <div className="my-3 rounded-xl bg-slate-900/60 p-4 border border-slate-800 text-xs text-indigo-300 font-mono space-y-1">
                          <p>新品牌开工</p>
                          <p>  ↓</p>
                          <p><strong>1. 策略讨论</strong> ➜ AMC 品牌主理人与你沟通品牌定位、目标客群与内容方向</p>
                          <p>  ↓</p>
                          <p><strong>2. 素材整理</strong> ➜ 你提供菜品照片、品牌故事或活动信息，AMC 进行整理与补充</p>
                          <p>  ↓</p>
                          <p><strong>3. 内容生产</strong> ➜ AMC Agent 开始制作草稿，需要你确认时生成 require_input 任务</p>
                          <p>  ↓</p>
                          <p><strong>4. 排期发布</strong> ➜ 确认通过后自动进入发布排期，按计划自动发布到各平台</p>
                          <p>  ↓</p>
                          <p><strong>5. 数据复盘</strong> ➜ 与同事（AMC Agent）一起检视发布效果，查看数据报告；AMC Agent 自动更新对品牌的理解并调优策略</p>
                          <p>  ↓</p>
                          <p><strong>6. 下一轮优化</strong> ➜ 根据复盘数据调整内容方向，工作循环继续</p>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          💡 提示：AMC Agent 会在合作中不断积累对您品牌的认知（记录在品牌记忆文件中），合作时间越长，生成的内容和策略就越精准，越不需要您进行频繁干预。
                        </p>
                      </div>

                      <div className="h-px bg-slate-800/50 my-2" />

                      <div>
                        <h3 className="font-bold text-slate-200 text-base mb-1.5">1.3 看板介绍</h3>
                        <ul className="list-disc pl-5 space-y-1.5 mt-2">
                          <li><strong className="text-slate-200">各功能区说明</strong>：内容看板展示已发布和排期中的内容；社媒账号提供接入状态；数据报告展示关键效果指标；配置中心用于接入外部 API 密钥。</li>
                          <li><strong className="text-slate-200">Require Input 任务说明</strong>：当 AI 遇到素材缺失、链接失效或差评预警时，会在 **Require Input** 状态下死锁挂起，此时您在看板上会看到明显的任务卡片，输入反馈意见即可推进 AI 运行。当该栏目有待审核任务时，该栏目的任务数量角标将自动变成醒目的红色。</li>
                          <li><strong className="text-slate-200">通知机制</strong>：当有需要您确认的任务或账号断连时，系统会通过微信/飞书或浏览器推送实时通知。</li>
                        </ul>
                      </div>

                      <div className="h-px bg-slate-800/50 my-2" />

                      <div>
                        <h3 className="font-bold text-slate-200 text-base mb-1.5">1.4 账号权限说明</h3>
                        <ul className="list-disc pl-5 space-y-1.5 mt-2">
                          <li><strong className="text-slate-200">客户账号 vs AMC 团队账号的权限区别</strong>：主理人拥有终审权与最高配置权限；AMC 团队账号拥有在被授权的范围内进行内容创作、数据拉取和辅助互动的操作权限。</li>
                          <li><strong className="text-slate-200">多门店 / 多品牌管理</strong>：支持在一个 AMC 账户下无缝切换和配置多个不同的品牌资产或门店，由独立的 AI 虚拟员工组提供个性化营销服务。</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Part 2 */}
                {openManualSection === 'part2' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Part 2：账号接入操作</h2>
                    
                    {/* SOP-001 */}
                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-indigo-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase">SOP-001</div>
                      <h3 className="font-bold text-base text-slate-100">通过 PostFast OAuth 接入社媒账号</h3>
                      <p className="text-xs text-slate-400">适用场景：首次接入 Instagram、Facebook、TikTok、小红书等平台账号用于发布和排期。</p>
                      <div className="h-px bg-indigo-500/10 my-2" />
                      <div className="space-y-3 text-sm text-slate-300">
                        <p><strong className="text-indigo-400">前提条件</strong>：已在 AMC **“配置”**（集成配置）中填写并保存了您的 **PostFast API Key**。</p>
                        <ol className="list-decimal pl-5 space-y-2 text-xs leading-relaxed">
                          <li><strong>获取授权链接</strong>：
                            <ul className="list-disc pl-4 mt-1 space-y-1">
                              <li><span className="text-indigo-400">方法一（推荐）</span>：直接在看板上向 AI 虚拟员工发送消息，如 <code>“帮我生成 PostFast 账号绑定链接”</code>，AI 助手将自动调用 MCP 接口返回您的专属绑定 URL。</li>
                              <li><span className="text-indigo-400">方法二</span>：直接登录您的 PostFast 后台控制台。</li>
                            </ul>
                          </li>
                          <li><strong>执行授权</strong>：点击获取的链接或在 PostFast 后台选择对应的社媒平台完成 OAuth 官方授权绑定。</li>
                          <li><strong>触发同步</strong>：完成绑定后返回 AMC 控制台，点击右上角 **“配置”** 并点击 **“保存配置”**（或直接刷新网页），绑定的账号及粉丝数据将自动同步呈现在主页“账号资产配置”网格中。</li>
                        </ol>
                        <div className="rounded bg-slate-950 p-2.5 text-[11px] text-amber-300/95 border border-amber-500/10">
                          ⚠️ 注意：手动添加账号（通过主页“添加新账号”填写用户名密码）不能用于 PostFast 的 API 自动内容发布，仅供本地自动化运行脚本及爬虫使用。
                        </div>
                      </div>
                    </div>

                    {/* SOP-002 */}
                    <div className="rounded-xl border border-slate-850 bg-slate-900/30 p-5 space-y-3 relative">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase">SOP-002</div>
                      <h3 className="font-bold text-base text-slate-100">社媒账号断连重新授权</h3>
                      <p className="text-xs text-slate-455">触发条件：账号状态显示"断连"或内容发布失败。</p>
                      <div className="h-px bg-slate-800/30 my-2" />
                      <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-350 leading-relaxed">
                        <li>进入配置中心，找到断连账号。</li>
                        <li>点击“重新授权” ➜ 重新完成 PostFast OAuth 流程。</li>
                        <li>确认状态恢复为“已连接”。</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Part 3 */}
                {openManualSection === 'part3' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Part 3：日常协作 SOP</h2>
                    
                    {/* SOP-003 */}
                    <div className="rounded-xl border border-slate-850 bg-slate-900/30 p-5 space-y-3 relative">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase">SOP-003</div>
                      <h3 className="font-bold text-base text-slate-100">月度 Brief 提交流程</h3>
                      <p className="text-xs text-slate-450">执行频率：每月第一个工作日提交本月大方向（如有特定新品）。</p>
                      <div className="h-px bg-slate-800/30 my-2" />
                      <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-350 leading-relaxed">
                        <li>打开看板，向 AI 员工发送你的本月营销需求（如“本月推出新季主推款产品，需要小红书主推”）。</li>
                        <li>AI 自动创建 Brief 行动卡片，并提取相关产品、价格以及要强调的方向。</li>
                        <li>AMC 在 24 小时内确认并根据此 Brief 自动生成发布日历计划。</li>
                      </ol>
                    </div>

                    {/* SOP-004 */}
                    <div className="rounded-xl border border-slate-850 bg-slate-900/30 p-5 space-y-3 relative">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase">SOP-004</div>
                      <h3 className="font-bold text-base text-slate-100">日常素材提交规范</h3>
                      <p className="text-xs text-slate-450">执行频率：每周一次（建议每周一），确保存放足量素材供 AI 创作。</p>
                      <div className="h-px bg-slate-800/30 my-2" />
                      <ul className="list-disc pl-5 space-y-2 text-xs text-slate-350 leading-relaxed">
                        <li><strong>图片要求</strong>：3-5 张，自然光充足的店铺环境或产品大特写，建议 1080px 以上。</li>
                        <li><strong>视频要求</strong>：1-2 条，15-60 秒手持拍摄的短视频片段。</li>
                        <li><strong>打标操作</strong>：上传至素材库后，选中多张图片并点击“排期发布”标签。AI 员工识别后，将自动为您安排推文草稿排期，使用后该标签会自动去除。</li>
                      </ul>
                    </div>

                    {/* SOP-005 */}
                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-3 relative">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-indigo-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase">SOP-005</div>
                      <h3 className="font-bold text-base text-slate-100">内容草稿审核与人机协同</h3>
                      <p className="text-xs text-indigo-400/90 font-medium">界面提示：当看板 "Require Input" 状态有挂起任务时，该栏目的统计角标将自动显现为醒目的红色。</p>
                      <div className="h-px bg-indigo-500/10 my-2" />
                      <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-300 leading-relaxed">
                        <li><strong>观察红标</strong>：打开看板主页，注意查看带有红色提示的 **Require Input** 状态任务栏。</li>
                        <li><strong>预览草稿</strong>：点击草稿卡片，在预览中查看 AI 员工自动排版的图文、Hashtag 以及排期时间。</li>
                        <li><strong>执行动作</strong>：选择 <strong>批准发布</strong> ➜ 任务进入自动排期队列；选择 <strong>提交修改</strong> ➜ 输入你的反馈意见并保存。</li>
                        <li><strong>恢复运行 (Resume)</strong>：主理人修改完文案或提供反馈后，在看板上点击一键 <strong>“Resume”</strong>，AI 将立即获取最新修改成果并无缝恢复发帖流程。</li>
                      </ol>
                    </div>

                    {/* SOP-006 */}
                    <div className="rounded-xl border border-slate-850 bg-slate-900/30 p-5 space-y-3 relative">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase">SOP-006</div>
                      <h3 className="font-bold text-base text-slate-100">月度报告核心数据监控</h3>
                      <p className="text-xs text-slate-450">数据监控：掌握核心指标，调整下月运营策略。</p>
                      <div className="h-px bg-slate-800/30 my-2" />
                      <ul className="list-disc pl-5 space-y-2 text-xs text-slate-350 leading-relaxed">
                        <li><strong>触达总次数 (Reach)</strong>：您的发帖被总计看到的人次，是品牌曝光的底盘。</li>
                        <li><strong>互动率 (Engagement Rate)</strong>：目标需大于 3% 以上，代表文案和配图对同城消费者/买家极具吸引力。</li>
                        <li><strong>谷歌地图/ Yelp 评分监控</strong>：关注评分涨幅，五星好评是否有序回写以拉升搜索引擎权重。</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Part 4 */}
                {openManualSection === 'part4' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Part 4：达人探店 SOP</h2>
                    
                    {/* SOP-007 */}
                    <div className="rounded-xl border border-slate-850 bg-slate-900/30 p-5 space-y-3 relative">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase">SOP-007</div>
                      <h3 className="font-bold text-base text-slate-100">达人探店与素材收集流程</h3>
                      <p className="text-xs text-slate-455">适用场景：主理人自主安排达人到店体验，AI Agent 负责生成任务以收集推广素材。</p>
                      <div className="h-px bg-slate-800/30 my-2" />
                      <div className="space-y-3 text-xs text-slate-350">
                        <p className="font-semibold text-slate-200">🤖 AMC AI Agent 负责（协作配合）：</p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li><strong>自动发起任务</strong>：在预设的推广节点，在看板上自动生成 <strong>Require Input</strong> 状态的素材收集任务卡片。</li>
                          <li><strong>内容创作与发布</strong>：当主理人上传完探店素材并确认后，AI 自动进行文案排版、Hashtag 匹配，并排期发布。</li>
                        </ul>
                        
                        <p className="font-semibold text-slate-200 mt-2">👤 主理人负责（完全自主安排）：</p>
                        <ol className="list-decimal pl-5 space-y-1.5">
                          <li><strong>步骤 1：达人筛选与沟通</strong>：主理人根据品牌调性，在线下自行寻找达人、沟通合作机制（如产品免费体验、置换等）并确认到店时间。</li>
                          <li><strong>步骤 2：到店接待与体验</strong>：
                            <ul className="list-disc pl-4 mt-0.5 space-y-1">
                              <li>提前准备好店内的特色/主推产品。</li>
                              <li>安排优先体验与周到接待，可向达人做口头品牌背景/故事介绍。</li>
                            </ul>
                          </li>
                          <li><strong>步骤 3：收集并上传素材</strong>：
                            <ul className="list-disc pl-4 mt-0.5 space-y-1">
                              <li>向达人索取拍摄好的照片或视频素材。</li>
                              <li>打开看板上标红的 <strong>Require Input</strong> 探店任务卡片，将高清素材上传并保存。</li>
                              <li>点击 <strong>Resume</strong> 推进任务，AI 虚拟员工将立即开始创作。</li>
                            </ul>
                          </li>
                        </ol>
                      </div>
                    </div>
                  </div>
                )}

                {/* Part 5 */}
                {openManualSection === 'part5' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Part 5：常见故障自查排除</h2>
                    
                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
                      <table className="w-full text-xs text-slate-300 text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="p-3 font-bold text-slate-200">故障现象</th>
                            <th className="p-3 font-bold text-slate-200">可能原因</th>
                            <th className="p-3 font-bold text-slate-200">自助解决步骤</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          <tr>
                            <td className="p-3 font-bold">内容没有按时发布</td>
                            <td className="p-3">账号断连</td>
                            <td className="p-3 text-slate-400">执行 SOP-002，对断连账号点击“重新授权”以刷新 token，确认状态恢复为“已连接”</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">看板没有新任务</td>
                            <td className="p-3">当月 Brief 未提交</td>
                            <td className="p-3 text-slate-400">执行 SOP-003，点击“新建 Brief”提交本月产品及促销活动；或者检查素材库中是否标记了“排期发布”标签</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">达人内容与品牌不符</td>
                            <td className="p-3">Brief 说明不够具体</td>
                            <td className="p-3 text-slate-400">联系 AMC 客服或更新达人 Brief 模板中的必拍内容与话题要求</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">月度报告数据异常</td>
                            <td className="p-3">账号数据同步延迟</td>
                            <td className="p-3 text-slate-400">等待 24 小时后刷新；如数据仍未更新请联系 AMC 团队处理</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* 3. Skill Hub Tab */}
          {activeTab === 'skills' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Category filters */}
              <div className="flex flex-wrap gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80 max-w-fit">
                {[
                  { id: 'all', label: '全部技能' },
                  { id: 'marketing', label: '营销推广 (Marketing)' },
                  { id: 'content', label: '内容创作 (Content Writing)' },
                  { id: 'self-improvement', label: '自我优化 (Self-Improvement)' },
                  { id: 'other', label: '其它常用 (Other Useful)' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSkillCategory(cat.id as typeof skillCategory)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      skillCategory === cat.id
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Grid Layout of Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredSkills.map((skill) => {
                  const isInstalled = installedSkills.includes(skill.id)
                  return (
                    <div
                      key={skill.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 flex flex-col justify-between hover:border-indigo-500/30 transition-all duration-300"
                    >
                      <div>
                        {/* Header info */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">{skill.icon}</span>
                            <h3 className="font-bold text-sm sm:text-base text-slate-100">{skill.title}</h3>
                          </div>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
                              isInstalled
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {isInstalled ? '已激活' : '未安装'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed mb-4">{skill.desc}</p>
                        
                        {/* Rating & Installs */}
                        <div className="flex items-center gap-4 text-[10px] text-slate-500 font-bold mb-4">
                          <span className="flex items-center gap-1 text-amber-500">
                            <Star size={11} fill="currentColor" /> {skill.rating}
                          </span>
                          <span>活跃使用数: {skill.installs}</span>
                        </div>

                        {/* Bullets */}
                        <div className="space-y-1 border-t border-slate-800/80 pt-3.5 mb-4">
                          <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1 font-bold">技能优势</span>
                          {skill.features.map((feat, fIdx) => (
                            <div key={fIdx} className="flex items-center gap-2 text-xs text-slate-350">
                              <CheckCircle2 size={12} className="text-indigo-400 shrink-0" />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action Toggle Button */}
                      <button
                        onClick={() => handleToggleSkill(skill.id)}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${
                          isInstalled
                            ? 'bg-slate-900 border border-slate-800 text-rose-500 hover:bg-rose-950/20 hover:border-rose-900/30'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow shadow-indigo-900/25'
                        } cursor-pointer`}
                      >
                        {isInstalled ? '卸载技能插件' : '一键启用技能'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 4. AMC School Tab */}
          {activeTab === 'school' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Category buttons */}
              <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800/80 max-w-fit mb-4">
                {[
                  { id: 'courses', label: '📖 培训课程' },
                  { id: 'cases', label: '📈 经典案例复盘' },
                  { id: 'calendar', label: '🗓️ 新加坡营销日历' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSchoolCategory(cat.id as typeof schoolCategory)}
                    className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                      schoolCategory === cat.id
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Courses list */}
              {schoolCategory === 'courses' && (
                <div className="space-y-6">
                  
                  {/* Category: Entry Level */}
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3 px-1">入门级基础课程</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { title: '课程 01：为什么同城实体店需要精细的社媒运营？', duration: '12m', progress: 100, desc: '餐饮/零售行业的同城获客漏斗核心逻辑。' },
                        { title: '课程 02：新加坡平台玩法全解析', duration: '20m', progress: 100, desc: 'Instagram, TikTok, 小红书, Google Maps 流量特点。' },
                        { title: '课程 03：如何使用手机拍出高质感产品图', duration: '15m', progress: 50, desc: '日常光线、产品构图与成片调色教学。' },
                        { title: '课程 04：AI Marketing Crew 与主理人的黄金协作', duration: '18m', progress: 0, desc: '解锁看板协作、要求输入与自动驾驶参数配置。' }
                      ].map((course, idx) => (
                        <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-2 hover:border-slate-700 transition duration-200 flex flex-col justify-between">
                          <div className="space-y-1.5">
                            <h4 className="font-bold text-sm text-slate-100 flex items-start gap-2">
                              <PlayCircle size={15} className="text-indigo-400 shrink-0 mt-0.5" />
                              <span>{course.title}</span>
                            </h4>
                            <p className="text-xs text-slate-400 leading-relaxed">{course.desc}</p>
                          </div>
                          
                          <div className="flex items-center justify-between gap-4 text-[10px] text-slate-500 font-bold border-t border-slate-800/60 pt-2.5 mt-2">
                            <span className="flex items-center gap-1"><Clock size={11} /> {course.duration}</span>
                            <div className="flex items-center gap-2">
                              <span>已学: {course.progress}%</span>
                              <div className="w-16 h-1 rounded-full bg-slate-800 overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${course.progress}%` }}></div>
                              </div>
                            </div>
                            <button className="text-indigo-400 hover:text-indigo-300 underline font-extrabold cursor-pointer">
                              {course.progress === 100 ? '温习课程' : course.progress > 0 ? '继续学习' : '开始学习'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Category: Advanced Level */}
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3 px-1">进阶高级运营课程</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { title: '课程 05：剖析 Instagram 最新算法与同城流量分发机制', duration: '25m', desc: '算法如何推送 Reels 视频，哪些标签能精准定位同城人群。' },
                        { title: '课程 06：如何写出让本地消费者产生强烈购买欲的文案', duration: '15m', desc: '掌握同城文案的痛点与吸睛钩子（Hooks），让您的产品文案极具吸引力与高转化率。' },
                        { title: '课程 07：达人合作外联邀约与预算把控', duration: '22m', desc: '如何利用 AI 准备的 Brief 和邀约文案，实现 90% 的意向合作率。' },
                        { title: '课程 08：用 Google Maps 评论回写与星级裂变引流新客', duration: '30m', desc: '全天候自动化差评拦截和好评模板生成，最大化搜索引擎权重。' }
                      ].map((course, idx) => (
                        <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-2 hover:border-slate-700 transition duration-200 flex flex-col justify-between">
                          <div className="space-y-1.5">
                            <h4 className="font-bold text-sm text-slate-100 flex items-start gap-2">
                              <PlayCircle size={15} className="text-indigo-400 shrink-0 mt-0.5" />
                              <span>{course.title}</span>
                            </h4>
                            <p className="text-xs text-slate-400 leading-relaxed">{course.desc}</p>
                          </div>
                          
                          <div className="flex items-center justify-between gap-4 text-[10px] text-slate-500 font-bold border-t border-slate-800/60 pt-2.5 mt-2">
                            <span className="flex items-center gap-1"><Clock size={11} /> {course.duration}</span>
                            <span className="text-slate-600">未学习</span>
                            <button className="text-indigo-400 hover:text-indigo-300 underline font-extrabold cursor-pointer">开始学习</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* Cases tab */}
              {schoolCategory === 'cases' && (
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { title: 'Case 1: 一家新加坡独立设计师品牌 3 个月小红书自然涨粉 2,000 完整路径', desc: '通过每日捕获同城热度词并输出针对性产品穿搭/种草笔记，配合本地达人第一波置换。内容展现高质感生活方式，实现销售闭环。' },
                    { title: 'Case 2: 精细化单条 Instagram Reels 短视频直接引流 500+ 笔产品订单复盘', desc: '拆解短视频的前 3 秒黄金 Hooks 设定，配合文案中限时优惠券及一键跳转下单的闭环设计。' },
                    { title: 'Case 3: 差评与售后危机应对：如何利用 AI 评论守护让品牌评分在 6 个月内从 3.8 分攀升至 4.7 分', desc: '利用 Google Maps 及各大商户接口，实现 24 小时低分预警、关怀补偿，以及向五星好评自动回复答谢拉升搜索权重。' }
                  ].map((c, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 space-y-2">
                      <div className="flex items-center gap-2 text-indigo-400">
                        <TrendingUp size={16} />
                        <h4 className="font-bold text-slate-100 text-sm sm:text-base">{c.title}</h4>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-350 leading-relaxed">{c.desc}</p>
                      <button className="text-xs font-bold text-indigo-400 hover:underline pt-1.5 cursor-pointer block">阅读案例全文 →</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Calendar tab */}
              {schoolCategory === 'calendar' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-850 bg-slate-900/40 p-4 text-xs text-slate-400 leading-relaxed">
                    💡 **小贴士**：新加坡全年的重点营销节点。AI 虚拟员工会根据以下日历表自动提前 10–20 天提示您准备物料，并在您的内容发布排期中提供相应的主题模板与本地化推文。
                  </div>

                  <div className="space-y-3">
                    {calendarEvents.map((cal, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900/20 p-4 flex flex-col sm:flex-row items-start gap-4">
                        <div className="sm:w-32 font-black text-indigo-400 text-sm flex-shrink-0">
                          {cal.date}
                        </div>
                        <div className="space-y-1 leading-relaxed">
                          <h4 className="font-bold text-slate-100 text-xs sm:text-sm">{cal.event}</h4>
                          <p className="text-slate-400 text-xs">{cal.tip}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

        </section>

        {/* Security Alert Block */}
        <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900/20 p-5 flex items-start gap-3">
          <ShieldAlert size={20} className="text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-slate-200">运营安全与合规协议</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              为确保您的账号安全及避免接口调用封禁，请严格遵守本手册所述之 SOP 规范。请避免在未授权的第三方助手或非沙盒环境内直接运行 API 写入指令。手动创建的 API 账号凭证必须在本地前台插件连接激活状态下工作。
            </p>
          </div>
        </section>

      </div>
    </main>
  )
}
