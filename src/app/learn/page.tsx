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
  
  // Skill Market Toggles
  const [skillCategory, setSkillCategory] = useState<'all' | 'content' | 'platform' | 'campaign' | 'ai'>('all')
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
      a: '第一步：在看板聊天框向 AI 发送指令“帮我生成 PostFast 账号绑定链接”；第二步：点击 AI 返回的专属链接，在 PostFast 页面中选择对应渠道授权；第三步：授权完毕后，返回 AMC 控制台刷新或重新保存配置，账号即自动同步出现。具体步骤详见使用手册 SOP-001。',
      tag: '账号与接入'
    },
    {
      id: 'q3',
      category: 'accounts',
      q: '目前系统支持哪些社交媒体平台？',
      a: '目前系统全面支持小红书、Instagram、Facebook、TikTok、Google Business Profile (GBP)、Yelp 等主流平台账号的发布管理、数据监控或评论回复。',
      tag: '账号与接入'
    },
    {
      id: 'q4',
      category: 'posts',
      q: 'AMC 多久发布一次内容？如何排期？',
      a: 'AI 员工会根据您在设置中配置的“每日发帖容量上限”以及素材库中打上“排期发布”标签的素材，自动进行推文排版和日历排程。通常在各社交平台的流量高峰时间段（如上午 9:00 或下午 18:00）由 AI 触发自动发送。',
      tag: '内容发布'
    },
    {
      id: 'q5',
      category: 'posts',
      q: '我需要人工审核每一条发帖内容吗？',
      a: '这完全取决于您的发布模式。在“老板审批”模式下，AI 创作的每一篇草稿都会以 pending_review 状态死锁在看板上，生成 require_input 任务，必须由主理人手动确认；在“自动驾驶”模式下，AI 员工会在文案符合品牌调性阈值后自动排期发布。',
      tag: '内容发布'
    },
    {
      id: 'q6',
      category: 'posts',
      q: '内容发布失败了该怎么处理？',
      a: '可在看板上点击查看失败的任务卡片以获取详细报错日志。最常见的原因是社交账号的 OAuth 令牌过期导致断连，请执行 SOP-002 重新授权后，在任务卡片上点击“重试发布”即可重新排队发送。',
      tag: '内容发布'
    },
    {
      id: 'q7',
      category: 'influencers',
      q: '套餐里包含达人探店，具体的协同流程是怎样的？',
      a: 'AMC 采用人机协同工作流：AI 员工在后台扫描筛选同城合适达人并撰写邀请 Brief (require_input)；主理人确认名单后，使用 AI 准备好的文案模板，通过品牌 WhatsApp/微信等渠道直接给达人发送私信邀约，并安排探店出品及现场核销。',
      tag: '达人探店'
    },
    {
      id: 'q8',
      category: 'influencers',
      q: '达人的费用如何进行结算？',
      a: '主理人需根据 AI 达人卡片中提供的合作预算（或免费置换资源说明），在探店现场或按商定条件直接向达人转账/付现。达人探店产生的合作费用最终会按季度包含在您的 AMC 订阅套餐核算内。',
      tag: '达人探店'
    },
    {
      id: 'q9',
      category: 'billing',
      q: '三个订阅套餐的核心区别是什么？如何中途升级？',
      a: 'Essential（基础版）仅提供核心发帖与看板协作；Growth（增长版）新增了自动处理 Google Review / 同城趋势监控及达人管理功能；Scale（规模版）额外支持多门店管理、深度品牌 Memory 自动巡检和定制化 AI 能力。如需中途升级，可进入设置中心 ➜ 订阅计划中进行升级。',
      tag: '订阅与账单'
    },
    {
      id: 'q10',
      category: 'reports',
      q: '月度绩效报告包含哪些数据？多久更新？',
      a: '月度报告汇总了各平台的总触达（Reach）、总互动率（Engagement Rate）、粉丝净增长、Google 评分变化、以及排名前 5 的爆款贴文。数据每天晚上自动从 API 中读取缓存更新，并在每月月初自动汇编成月度 Summary。',
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

  // Skill Market Data
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
      category: 'platform',
      title: '本地口碑守护者 (GBP & Review Defender)',
      desc: '24小时监控 Google Maps / 美团商家评价。5星好评由 AI 极速秒回以拉包搜索权重；低分差评私下拦截并生成看板预警，自动派发游戏预留补偿券。',
      icon: '⭐',
      rating: '5.0',
      installs: '940+',
      features: ['24h 差评预警', '五星好评秒回', '自动分发关怀礼券']
    },
    {
      id: 'trend-hunter',
      category: 'platform',
      title: '同城热点观察哨 (Local Trend Hunter)',
      desc: '每日两次扫描同城本地生活热门话题及竞品曝光，自动为创作线索提供本地化 Hook。',
      icon: '🔎',
      rating: '4.7',
      installs: '430+',
      features: ['同城热搜关键词提取', '文案爆款趋势解析', '同城爆品情报监控']
    },
    {
      id: 'analytics-logger',
      category: 'ai',
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
      id: 'dining-photos',
      category: 'content',
      title: '产品摄影风格优化插件',
      desc: '支持通过 AI 滤镜算法与构图优化方案，使产品宣传图具备“日式清新”、“港式市井烟火气”等高质感社交平台格调。',
      icon: '📸',
      rating: '4.6',
      installs: '190+',
      features: ['风格化调色建议', '排版布局模版', '构图线框指导']
    },
    {
      id: 'voucher-converter',
      category: 'campaign',
      title: '团购转化与卡券推广包',
      desc: '针对美团/大众点评/本地卡券上线的推广活动。AI 自动在社交媒体生成带卡券倒计时和“首批尝鲜”抢购的引流推文。',
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
    { date: '1月-2月', event: '农历华人新年 (Chinese New Year)', tip: '提前15天开始上线捞鱼、年夜饭预订、团圆套餐推广。AI 建议：结合小红书喜庆排版发布捞鱼视频。' },
    { date: '4月-5月', event: '开斋节 (Hari Raya Puasa)', tip: '适合推出合家欢套餐和清真友好菜品提示。AI 建议：在 Instagram 强调多元化本地社区聚餐故事。' },
    { date: '6月', event: '端午节 (Dragon Boat Festival)', tip: '主推传统/创新粽子礼盒、预售倒计时。AI 建议：在看板上传包粽子视频素材由 AI 自动剪辑生成预热脚本。' },
    { date: '8月9日', event: '新加坡国庆节 (National Day)', tip: '全岛爱国狂欢日，主推国庆红白主题甜品、买一送一或 $58.00 国庆专属限定双人套餐。' },
    { date: '9月-10月', event: '中秋节 (Mid-Autumn Festival)', tip: '主推月饼礼盒定制送礼、博饼中秋活动。AI 建议：提前20天开启小红书种草预售。' },
    { date: '12月25日', event: '圣诞节 (Christmas)', tip: '西方传统大节。主推火鸡套餐、圣诞聚会包房预订。AI 建议：主打高质感西式打卡、暖色调氛围感。' }
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
            { id: 'skills', label: '🛒 技能市场 (Market)', desc: '品牌 AI 员工专项扩展包' },
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
                  { id: 'part1', label: 'Part 1：系统概览与角色分工' },
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
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Part 1：系统概览与人机协作</h2>
                    
                    <div className="space-y-4 text-slate-350 text-sm leading-relaxed">
                      <div>
                        <h3 className="font-bold text-slate-200 text-base mb-1.5">1.1 AMC 是什么？</h3>
                        <p>AMC（AI Marketing Crew）是您专属的 AI 社交媒体营销团队，包含文案编写、达人配对、口碑监控等虚拟员工。AI 虚拟员工负责做方案、找资料、产出内容，而人类主理人仅需在看板上进行审核，保障终审权完全受控。</p>
                      </div>

                      <div className="h-px bg-slate-800/50 my-2" />

                      <div>
                        <h3 className="font-bold text-slate-200 text-base mb-1.5">1.2 主理人看板区域说明</h3>
                        <ul className="list-disc pl-5 space-y-1.5 mt-2">
                          <li><strong className="text-slate-200">AI 序列</strong>：展示目前在线为您品牌服务的 Agent，可一键切换老板审批模式与自动驾驶模式。</li>
                          <li><strong className="text-slate-200">待处理事项 / 任务泳道</strong>：当 AI 遇到素材缺失、链接失效或差评预警时，会在 **Require Input** 状态下死锁挂起，此时您在看板上会看到标红的任务提示，主理人在此栏中回复修改意见，AI 即可恢复运行。</li>
                          <li><strong className="text-slate-250">集成配置</strong>：输入对接的 API 授权密钥和飞书 Workspace 配置，确保数据实时畅通。</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Part 2 */}
                {openManualSection === 'part2' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Part 2：社媒账号接入 SOP</h2>
                    
                    {/* SOP-001 */}
                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-indigo-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase">SOP-001</div>
                      <h3 className="font-bold text-base text-slate-100">通过 PostFast OAuth 接入发布渠道</h3>
                      <p className="text-xs text-slate-400">适用场景：首次接入 Instagram、Facebook、TikTok、小红书等平台账号用于内容发布排程。</p>
                      <div className="h-px bg-indigo-500/10 my-2" />
                      <div className="space-y-3 text-sm text-slate-300">
                        <p><strong className="text-indigo-400">前提条件</strong>：已在 AMC **“配置”**（集成配置）中填写并保存了您的 **PostFast API Key**。</p>
                        <ol className="list-decimal pl-5 space-y-2 text-xs leading-relaxed">
                          <li><strong>获取授权链接</strong>：直接在看板上向 AI 虚拟员工发送消息，如 `“帮我生成 PostFast 账号绑定链接”`，AI 助手将自动调用 MCP 接口返回您的专属绑定 URL。或者直接登录您的 PostFast 后台。</li>
                          <li><strong>执行授权</strong>：点击获取的链接，进入 PostFast 页面，选择对应的社媒平台，登录并完成官方 OAuth 授权连接。</li>
                          <li><strong>触发同步</strong>：完成绑定后返回 AMC 控制台，点击右上角 **“配置”** 并点击 **“保存配置”**，绑定的账号及粉丝数据将自动同步呈现在主页“账号资产配置”网格中。</li>
                        </ol>
                        <div className="rounded bg-slate-950 p-2.5 text-[11px] text-amber-300/95 border border-amber-500/10">
                          ⚠️ 注意：主页上的 “+ 添加新账号” 仅用于手动输入账号密码以供本地自动化运行脚本及爬虫数据获取，无法通过 PostFast 进行 API 自动发布。
                        </div>
                      </div>
                    </div>

                    {/* SOP-002 */}
                    <div className="rounded-xl border border-slate-850 bg-slate-900/30 p-5 space-y-3 relative">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase">SOP-002</div>
                      <h3 className="font-bold text-base text-slate-100">社媒账号断连重新授权</h3>
                      <p className="text-xs text-slate-450">触发条件：账号状态显示"断连"或内容发布失败。</p>
                      <div className="h-px bg-slate-800/30 my-2" />
                      <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-350 leading-relaxed">
                        <li>进入配置中心，找到标记为断开状态的账号。</li>
                        <li>点击该账号旁边的“重新授权”按钮，浏览器将重新跳转至 PostFast 授权授权页面。</li>
                        <li>重新完成 OAuth 授权，确认返回 AMC 后状态显示为“已连接”。</li>
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
                        <li>打开看板，向 AI 员工发送你的本月营销需求（如“本月推出烤鱼新品，需要小红书主推”）。</li>
                        <li>AI 自动创建 Brief 行动卡片，并提取相关新品、价格以及要强调的方向。</li>
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
                        <li><strong>互动率 (Engagement Rate)</strong>：目标需大于 3% 以上，代表文案和配图对同城食客/买家极具吸引力。</li>
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
                      <h3 className="font-bold text-base text-slate-100">达人探店合作闭环流程</h3>
                      <p className="text-xs text-slate-450">适用于 Growth（增长版）或 Scale（规模版）套餐，季度自动派发候选额度。</p>
                      <div className="h-px bg-slate-800/30 my-2" />
                      <div className="space-y-3 text-xs text-slate-350">
                        <p className="font-semibold text-slate-200">🤖 AI 员工负责的环节 (全自动)：</p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>每日扫描筛选并输出同城餐饮/探店达人列表（包含粉丝数、以往带货表现及互动率）。</li>
                          <li>为品牌量身设计适合该达人的探店 Brief（必拍清单、平台 Hashtags 要求）。</li>
                          <li>生成邀约沟通的对话私信文案模板。</li>
                        </ul>
                        
                        <p className="font-semibold text-slate-200 mt-2">👤 人类主理人负责的步骤 (人工操作)：</p>
                        <ol className="list-decimal pl-5 space-y-1.5">
                          <li><strong>审核人选</strong>：在看板卡片上预览达人名单，点击批准确认或替换为备选达人。</li>
                          <li><strong>私信外联</strong>：复制 AI 准备好的个性化外联消息模板，通过官方 WhatsApp/社媒私信发给达人。</li>
                          <li><strong>探店当天接待</strong>：安排达人预约到店，出餐要快，前台提供 AMC 专属故事介绍话术。</li>
                          <li><strong>核销与返点</strong>：通过套餐核算报表，向达人线下支付现金或转账（达人发帖后，AI 将在后台自动捕获数据并汇总报告）。</li>
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
                            <td className="p-3 font-bold">内容发布显示“已失败”</td>
                            <td className="p-3">社媒平台 OAuth 令牌失效断连</td>
                            <td className="p-3 text-slate-400">去集成配置，对断连账号点击“重新授权”以刷新 token，然后对任务点击“重试”</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">看板几天没有出现新草稿任务</td>
                            <td className="p-3">未提交本月营销 Brief 需求</td>
                            <td className="p-3 text-slate-400">参考 SOP-003，向 AI 发送你本月的要求；或者检查素材库中是否标记了“排期发布”标签</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">小红书/美团评价回复有延迟</td>
                            <td className="p-3">前台浏览器插件（Extension）连接中断</td>
                            <td className="p-3 text-slate-400">确保在您的前台发帖电脑中打开了 Chrome 开发者扩展并加载了 chrome-extension 目录</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* 3. Skill Market Tab */}
          {activeTab === 'skills' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Category filters */}
              <div className="flex flex-wrap gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80 max-w-fit">
                {[
                  { id: 'all', label: '全部技能' },
                  { id: 'content', label: '内容创作' },
                  { id: 'platform', label: '平台运营' },
                  { id: 'campaign', label: '活动营销' },
                  { id: 'ai', label: 'AI 能力扩展' }
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
                        { title: '课程 03：如何使用手机拍出高质感产品图', duration: '15m', progress: 50, desc: '日常光线、摆盘构图与成片调色教学。' },
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
                        { title: '课程 05：剖析 Instagram 最新算法与流量分发机制', duration: '25m', desc: '算法如何推送 Reels 视频，哪些标签能精准定位同城人群。' },
                        { title: '课程 06：零本地缓存架构 (Zero Local Cache) 实操细节', duration: '15m', desc: '理解为什么 AI 必须通过实时接口（MCP/REST）获取最新看板数据。' },
                        { title: '课程 07：达人探店外联邀约与预算把控', duration: '22m', desc: '如何利用 AI 准备的 Brief 和邀约文案，实现 90% 的意向到达率。' },
                        { title: '课程 08：用 Google Maps 评论回写与星级裂变新客到店', duration: '30m', desc: '全天候自动化差评拦截和好评模板生成，最大化搜索引擎权重。' }
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
                    { title: 'Case 1: 一家新加坡新开中餐厅 3 个月小红书自然涨粉 2,000 完整路径', desc: '通过每日捕获同城热搜词并输出针对性美食笔记，配合本地达人第一波置换。内容展现真实烟火气，实现引流闭环。' },
                    { title: 'Case 2: 精细化单条 Instagram Reels 短视频直接为包厢引流 50 桌预订复盘', desc: '拆解短视频的前 3 秒黄金 Hooks 设定，配合文案中卡券二维码的扫码返点闭环设计。' },
                    { title: 'Case 3: 差评危机应对自救：如何利用 AI 评论守护让门店在 6 个月内从 3.8 分攀升至 4.6 分', desc: '利用 Google Maps / 美团商户接口，实现 24 小时低分预警人工私下赔付，以及向五星好评自动回复答谢拉升搜索。' }
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
