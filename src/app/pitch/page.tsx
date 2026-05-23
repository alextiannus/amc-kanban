'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  Bot,
  ShieldCheck,
  Layers,
  MessageSquare,
  Activity,
  CheckCircle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Calculator,
  HelpCircle,
  Search,
  Building2,
  Sparkles,
  Lock,
  RefreshCw,
  Sliders,
  Globe,
  Percent,
  ChevronDown,
  ChevronUp,
  Award,
  Zap,
  BookOpen,
  MousePointerClick
} from 'lucide-react'

// Slide data types
interface Slide {
  id: number
  title: string
  subtitle: string
}

const slides: Slide[] = [
  { id: 0, title: '产品愿景', subtitle: '人机协同任务操作系统 (Human-AI Collaborative Task OS)' },
  { id: 1, title: '三大痛点', subtitle: 'AI落地企业业务流的阻碍' },
  { id: 2, title: '核心技术柱石', subtitle: 'AMC Kanban 五大硬核创新' },
  { id: 3, title: 'O2O闭环场景', subtitle: '本地生活口碑与客流引流方案' },
  { id: 4, title: '竞品对比矩阵', subtitle: '为什么 AMC 是最优选' },
  { id: 5, title: '定价与ROI估算', subtitle: '低投入，高回报的商业模式' }
]

// FAQ data types
interface FaqItem {
  question: string
  answer: string
  category: 'security' | 'automation' | 'integrations' | 'pricing'
}

const faqData: FaqItem[] = [
  {
    category: 'security',
    question: 'AMC 浏览器插件桥是如何做到“零凭证泄漏”的？',
    answer: '传统 RPA 方案需要用户将商家后台的账号密码或 Cookie 上传至云端服务器托管，一旦服务商遭遇攻击即面临泄露风险。AMC 采用 SSE (Server-Sent Events) 双向异步长连接机制，服务器仅向下发送操作指令（如“点击第2行”、“在输入框键入X”），实际的网页注入和模拟执行完全在商家的本地浏览器窗口中完成。敏感的登录 Session 始终留在商家本地内存，服务器绝对不存储用户的任何密码或账号凭证。'
  },
  {
    category: 'security',
    question: '使用浏览器插件执行自动化操作会被美团/点评等平台封号吗？',
    answer: '平台的风控系统主要通过检测“异地 IP 登录”、“非人类指纹特征的 API 机器请求”或“高速异常点击”来封号。而 AMC 插件桥是在商家平时自己使用的电脑、熟悉的 IP、真实的 Chrome 浏览器活跃标签页中注入原生按键事件模拟。对平台而言，该行为表现与真实的人类操作（相同的 IP、相同的浏览器环境、真实的键鼠输入延迟）毫无二致，因此能够极其安全地穿透高强度风控，风险接近于零。'
  },
  {
    category: 'automation',
    question: '如果 AI 执行过程中产生了“幻觉”或者报错，系统如何处理？',
    answer: 'AMC 拥有“人机 Markdown 沟通通道”和“DAG 任务依赖拦截”机制。当 AI 遇到无法确定的内容或执行失败时，不会无限循环重试或盲目乱试，而是将任务卡片置为 `pending` 状态，并在详情卡中通过专属的隔离评论区，贴出高可读性的错误日志及备选方案。人类经理可以直接在评论区修改配置或进行文字修正，点击 `Resume AI` 即可将上下文无缝传回，AI 会在断点处自愈重跑，无需从头开始。'
  },
  {
    category: 'integrations',
    question: 'Dify-First 架构是指什么？我们必须配合 Dify 使用吗？',
    answer: 'Dify-First 是 AMC 的核心设计哲学：看板本身不负责复杂的 LLM 推理、RAG 知识库或多智能体逻辑，而是将这些“认知层”的逻辑完全交给业界主流的 Dify 工作流管理。看板则专注于“任务流转、权限、操作审计、人机协作 UI 及本地执行网关”。这种“认知与表现分离”的架构使商家能够在 Dify 中任意热切换模型、拖拽式调整回复话术，而无需修改看板的代码，带来无与伦比的架构柔性。'
  },
  {
    category: 'automation',
    question: '任务依赖中的 DAG 拦截是如何起作用的？',
    answer: '系统支持配置前置 Blockers（任务依赖）。例如，任务B（AI 自动排版并发布小红书）依赖于任务A（人类审核内容大纲）。当任务A处于非 Done/Void 状态时，即使 AI 拿着自己的 API Key 尝试通过 PATCH 接口更新任务B的状态，集中式网关也会强制抛出 400 错误并拦截执行。这种物理层面的接口拦截彻底限制了 AI 在未经人类审批或工序准备未完成时擅自动作，构成了绝对的安全防线。'
  },
  {
    category: 'pricing',
    question: 'AMC Kanban 怎么收费？对于连锁品牌有优惠吗？',
    answer: 'AMC 提供三种维度的收费模式：1. SaaS 基础订阅（单店版 $49-$99/月）；2. 专业版/多店版（$299-$599/月），支持不限门店、不限 Agent 席位及完整的 DAG/集中式网关；3. 按量付费套餐（根据每月回复的评价及发帖数量消耗额度）。对于大型连锁零售/餐饮集团，我们支持私有化部署和定制化合同，详情可咨询大客户服务团队。'
  },
  {
    category: 'integrations',
    question: '系统支持哪些海外和国内平台？',
    answer: '内容发布与自动化执行模块（基于 PostFast 与插件桥）目前对 Google Business Profile、Yelp 有深度官方 API 集成。对于国内大众点评、美团、小红书等无官方 API 接口的平台，我们提供已编译好的 Chrome 插件，实现一键本地 Session 注入与自动读写。后续将支持飞书、Slack、Notion 等协同软件的 Webhook 触发。'
  }
]

export default function PitchDeckPage() {
  const [activeTab, setActiveTab] = useState<'deck' | 'faq'>('deck')
  const [currentSlide, setCurrentSlide] = useState(0)
  
  // Slide 2: Core Tech Hub State
  const [selectedTechHub, setSelectedTechHub] = useState(1)

  // Slide 3: Scenario State
  const [selectedScenario, setSelectedScenario] = useState(0)

  // Slide 5: ROI Calculator Input State
  const [storeCount, setStoreCount] = useState(10)
  const [avgWage, setAvgWage] = useState(6000)

  // FAQ Search & Category Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFaqCategory, setSelectedFaqCategory] = useState<'all' | 'security' | 'automation' | 'integrations' | 'pricing'>('all')
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(null)

  // Keyboard navigation for Slide Deck
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'deck') return
      if (e.key === 'ArrowRight') {
        setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide(prev => Math.max(0, prev - 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab])

  // ROI Calculations
  const manualLaborCost = storeCount * (avgWage * 0.4) * 12 // Assume 40% of standard staff time spent on review management/copywriting
  const amcTotalCost = (storeCount <= 3 ? 99 : 399) * 12 + (storeCount * 30 * 12) // SaaS subscription + small monitoring labor buffer
  const savedCost = Math.round(manualLaborCost - amcTotalCost)
  const expectedTrafficIncreasePercent = 22 // Average Google Maps Local Search SEO optimization boost
  const additionalVisits = storeCount * 180 * 12 // Average additional guest views from maps rank boost per year
  const conversionValue = Math.round(additionalVisits * 0.05 * 80) // 5% conversion rate to guest, average transaction value 80

  // Filtered FAQ Items
  const filteredFaqs = faqData.filter(faq => {
    const matchQuery = faq.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    const matchCategory = selectedFaqCategory === 'all' || faq.category === selectedFaqCategory
    return matchQuery && matchCategory
  })

  return (
    <div className="min-h-screen bg-[#070913] text-slate-100 font-sans antialiased overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      {/* Dynamic Futuristic Background Gradients */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* Header Section */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-[#070913]/70 border-b border-slate-800/60 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-black text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-indigo-400">AMC Dashboard</span>
              <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-emerald-400 bg-emerald-500/10 rounded uppercase">Pitch Deck</span>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-[#0f132a] border border-slate-800 rounded-full p-1 shadow-inner">
            <button
              onClick={() => setActiveTab('deck')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeTab === 'deck'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              产品演示
            </button>
            <button
              onClick={() => setActiveTab('faq')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeTab === 'faq'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              常见问题 (FAQ)
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow">
        <AnimatePresence mode="wait">
          {activeTab === 'deck' ? (
            <motion.div
              key="deck-mode"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col lg:flex-row gap-8 items-stretch min-h-[calc(100vh-180px)]"
            >
              {/* Sidebar Navigation */}
              <div className="lg:w-64 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 border-b lg:border-b-0 lg:border-r border-slate-800/80 pr-0 lg:pr-6 shrink-0 hide-scrollbar">
                <div className="hidden lg:block mb-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-3">演示章节</h4>
                </div>
                {slides.map((slide, idx) => (
                  <button
                    key={slide.id}
                    onClick={() => setCurrentSlide(idx)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all shrink-0 ${
                      currentSlide === idx
                        ? 'bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 shadow-md shadow-indigo-950/20'
                        : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                    }`}
                  >
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      currentSlide === idx ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {String(slide.id + 1).padStart(2, '0')}
                    </span>
                    <span className="text-xs font-bold hidden sm:inline">{slide.title}</span>
                  </button>
                ))}
              </div>

              {/* Deck Presentation Window */}
              <div className="flex-1 flex flex-col justify-between bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md relative overflow-hidden shadow-2xl">
                {/* Header within slide */}
                <div className="flex items-center justify-between border-b border-slate-800/50 pb-4 mb-6">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-400 tracking-wider uppercase">AMC PITCH DECK · SECTION {currentSlide + 1}</span>
                    <h2 className="text-xl md:text-2xl font-black text-white mt-1">{slides[currentSlide].title}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{slides[currentSlide].subtitle}</p>
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-600 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md">
                    {currentSlide + 1} / {slides.length}
                  </div>
                </div>

                {/* Dynamic Slide Content */}
                <div className="flex-grow flex flex-col justify-center py-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentSlide}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}
                      className="w-full"
                    >
                      {/* Slide 0: Product Vision */}
                      {currentSlide === 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center py-4">
                          <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full text-xs font-bold">
                              <Sparkles className="w-3.5 h-3.5" />
                              人机协同的全新阶段
                            </div>
                            <h1 className="text-3xl md:text-5xl font-black leading-tight tracking-tight text-white">
                              让 AI 与人类在同一张看板上协作
                            </h1>
                            <p className="text-sm md:text-base text-slate-400 leading-relaxed">
                              传统的 AI 工具仅作为插件默默在后台运作，AMC Kanban 颠覆性地将 AI Agent 设为“一等执行主体”。无论是任务发布、评论交流，还是网页自动化，AI 都会留下可视化、可重试、可审计的数字凭证。
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 pt-2">
                              <button
                                onClick={() => setCurrentSlide(1)}
                                className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-sm font-bold px-6 py-3 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all group"
                              >
                                了解落地三大痛点
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                              </button>
                              <button
                                onClick={() => setActiveTab('faq')}
                                className="flex items-center justify-center gap-2 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 text-slate-300 text-sm font-bold px-6 py-3 rounded-xl transition-all"
                              >
                                查看 FAQ 详情
                              </button>
                            </div>
                          </div>

                          {/* Interactive Glowing Tech Hub Art */}
                          <div className="flex items-center justify-center relative">
                            <div className="w-64 h-64 md:w-80 md:h-80 rounded-full border border-indigo-500/15 flex items-center justify-center relative animate-pulse">
                              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-purple-500/5 rounded-full blur-xl" />
                              
                              {/* Inner ring */}
                              <div className="w-44 h-44 md:w-56 md:h-56 rounded-full border border-purple-500/20 flex items-center justify-center relative">
                                <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-500/40 flex flex-col items-center justify-center shadow-2xl relative z-10">
                                  <Activity className="w-8 h-8 text-indigo-400 mb-1" />
                                  <span className="text-[10px] font-bold text-indigo-300 tracking-wider">AMC CORE</span>
                                </div>
                              </div>

                              {/* Orbiting Satellite 1 (Human) */}
                              <div className="absolute top-2 left-10 md:left-14 bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 z-20">
                                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                <span className="text-[10px] font-bold text-slate-300">Human (人类审核)</span>
                              </div>

                              {/* Orbiting Satellite 2 (AI Agent) */}
                              <div className="absolute bottom-6 right-10 md:right-14 bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 z-20">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                <span className="text-[10px] font-bold text-slate-300">AI Agent (自动执行)</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slide 1: Market Pain Points */}
                      {currentSlide === 1 && (
                        <div className="space-y-8 py-2">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Card 1 */}
                            <div className="bg-[#0c0e20]/60 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-6 transition-all group relative overflow-hidden">
                              <div className="absolute -top-10 -right-10 w-24 h-24 bg-red-500/5 rounded-full blur-xl group-hover:bg-red-500/10 transition-all" />
                              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-400 mb-4 font-bold font-mono">
                                01
                              </div>
                              <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                                黑盒不可控 <span className="text-xs font-normal text-red-400/80 bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">无安全边界</span>
                              </h3>
                              <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
                                传统 AI 在后台单向运作，一旦遇到偶发的评论逻辑、接口错误或超出范围的要求，便会无限尝试，甚至越权跑飞产生业务事故。人类主理人无法实施中途插手干预。
                              </p>
                            </div>

                            {/* Card 2 */}
                            <div className="bg-[#0c0e20]/60 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-6 transition-all group relative overflow-hidden">
                              <div className="absolute -top-10 -right-10 w-24 h-24 bg-yellow-500/5 rounded-full blur-xl group-hover:bg-yellow-500/10 transition-all" />
                              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20 text-yellow-400 mb-4 font-bold font-mono">
                                02
                              </div>
                              <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                                国内平台无API <span className="text-xs font-normal text-yellow-400/80 bg-yellow-500/5 px-2 py-0.5 rounded border border-yellow-500/10">接口自动化受阻</span>
                              </h3>
                              <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
                                美团、大众点评、小红书等高频本地生活平台极其封闭，没有为一般商家开放读写 API。采用传统的 API 请求对接方案完全不可行，阻碍了智能营销的自动化落地。
                              </p>
                            </div>

                            {/* Card 3 */}
                            <div className="bg-[#0c0e20]/60 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-6 transition-all group relative overflow-hidden">
                              <div className="absolute -top-10 -right-10 w-24 h-24 bg-orange-500/5 rounded-full blur-xl group-hover:bg-orange-500/10 transition-all" />
                              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 text-orange-400 mb-4 font-bold font-mono">
                                03
                              </div>
                              <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                                账号泄露与风控 <span className="text-xs font-normal text-orange-400/80 bg-orange-500/5 px-2 py-0.5 rounded border border-orange-500/10">异地异机易封号</span>
                              </h3>
                              <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
                                将店铺账号的明文密码或后端 Cookie 托管给第三方云端 SaaS 风险极高。此外，云端服务器在全国各地漂移的 IP 代理极易触发平台安全风控，导致降权封号。
                              </p>
                            </div>
                          </div>
                          
                          <div className="bg-indigo-950/30 border border-indigo-900/40 rounded-xl p-4 flex items-center gap-3">
                            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
                            <span className="text-xs text-indigo-300">
                              <strong>AMC 破局思路</strong>：无需收集密码，用“本地浏览器沙盒注入 + 看板前置依赖 DAG 栅栏”打破传统黑盒自动化的局限。
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Slide 2: Core Technical Pillars */}
                      {currentSlide === 2 && (
                        <div className="flex flex-col md:flex-row gap-6 py-2">
                          {/* Left Navigation Buttons */}
                          <div className="md:w-60 flex flex-col gap-2">
                            {[
                              { id: 1, label: '🤖 AI “一等公民” 体系' },
                              { id: 2, label: '🔌 零托管“浏览器插件桥”' },
                              { id: 3, label: '🔒 DAG 任务依赖拦截' },
                              { id: 4, label: '💬 Markdown 人机通道' },
                              { id: 5, label: '🪵 对 AI 透明的 API 网关' }
                            ].map(hub => (
                              <button
                                key={hub.id}
                                onClick={() => setSelectedTechHub(hub.id)}
                                className={`text-xs font-bold px-4 py-3 rounded-xl text-left border transition-all ${
                                  selectedTechHub === hub.id
                                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-900 border-indigo-500 text-white shadow-md'
                                    : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                                }`}
                              >
                                {hub.label}
                              </button>
                            ))}
                          </div>

                          {/* Right Content Pane (Detailed description and simulation rendering) */}
                          <div className="flex-1 bg-[#0c0e20]/80 border border-slate-800 rounded-2xl p-6 min-h-[300px] flex flex-col justify-between">
                            <div className="space-y-4">
                              {selectedTechHub === 1 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                    <Bot className="w-4 h-4" /> AI 智能体专属 Profile 与凭证隔离
                                  </div>
                                  <h3 className="text-lg font-black text-white">每个 AI Agent 都是有身份印记的合规成员</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    系统为每个接入的外部智能体派发唯一 API Key (`Bearer apiKey`)。在看板中，他们不再是隐形的后台线程，而是拥有独立名片、专属配色、在线状态心跳灯和权限分配的团队人员。
                                  </p>
                                  <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 font-mono text-[10px] text-indigo-300">
                                    <span className="text-slate-500">// AI Agent 专属 HTTP 鉴权请求头</span><br />
                                    GET /api/tasks<br />
                                    Authorization: Bearer <span className="text-emerald-400">amc_agent_key_92fa...</span>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 2 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                    <Globe className="w-4 h-4" /> 零托管·SSE 网页脚本模拟操作
                                  </div>
                                  <h3 className="text-lg font-black text-white">彻底避免凭证泄露的网页穿透技术</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    商家端插件通过 SSE 长连接监听指令，收到来自 AI 的回复请求后，直接在商家本机活跃的点评/美团后台标签页中注入 DOM 模拟脚本。
                                  </p>
                                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-2 rounded-lg text-[10px]">
                                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                                    <span>商家密码和 Cookie 无需离机托管，通过本地浏览器指纹完全防风控封号。</span>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 3 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                    <Lock className="w-4 h-4" /> 严格依赖校验 (DAG)
                                  </div>
                                  <h3 className="text-lg font-black text-white">构建 AI Agent 的硬核行车护栏</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    任务之间支持构建 blockers 关联。当某项 AI 执行任务存在未 Done 的依赖时，集中式网关在 API 级别强制拦截 AI 领取或操作状态更新的请求，杜绝 AI 乱跑越过审核。
                                  </p>
                                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-[10px]">
                                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>API 网关拦截报错：`400 Bad Request: Task has active blockers`。</span>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 4 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                    <MessageSquare className="w-4 h-4" /> 上下文自恢复评论区
                                  </div>
                                  <h3 className="text-lg font-black text-white">AI pending 时的人机交互与断点续传</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    AI 报错或卡壳时，自动贴出日志将卡片挂起为 pending。人类主理人在同一卡片的 Markdown 评论区修正参数或给出指令，一键 Resume 即可续传，省去重新启动整条业务流的麻烦。
                                  </p>
                                  <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/60 flex items-start gap-3">
                                    <div className="w-7 h-7 rounded bg-emerald-500/15 flex items-center justify-center text-[10px] font-bold text-emerald-400">AI</div>
                                    <div className="flex-1 space-y-1">
                                      <div className="text-[10px] text-slate-400 font-bold">小红书发布Agent 14:02</div>
                                      <p className="text-[10px] text-slate-200">❌ 错误：文案中检测到屏蔽敏感词，已自动 pending，请人工复核说明。</p>
                                    </div>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 5 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                    <Sliders className="w-4 h-4" /> 集中网关拦截与断言注入
                                  </div>
                                  <h3 className="text-lg font-black text-white">Agent 透明网关与容错模拟审计</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    看板前台设有对 Agent 完全透明的 API 网关。不仅能完美记录全部请求与返回负载用于合规追溯，还能模拟各种网络抖动和接口失效，帮助 AI 进行自愈调试。
                                  </p>
                                  <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg flex items-center gap-2 justify-between text-[10px]">
                                    <span className="text-slate-400">系统审计日志高亮：</span>
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[9px]">EXTENSION_CMD_RECV</span>
                                    <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-mono text-[9px]">EXTENSION_CMD_ERR</span>
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="text-[10px] text-slate-500 text-right mt-4 pt-2 border-t border-slate-800/40">
                              点击左侧按钮切换查看更多技术特性
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slide 3: O2O Living Services Closed Loop */}
                      {currentSlide === 3 && (
                        <div className="space-y-6 py-2">
                          {/* Interactive Tabs */}
                          <div className="flex bg-[#0f132a] border border-slate-800 rounded-xl p-1 w-full overflow-x-auto hide-scrollbar">
                            {[
                              { id: 0, label: '🛑 差评内部拦截' },
                              { id: 1, label: '🚀 Google Maps SEO 秒回' },
                              { id: 2, label: '👥 聚餐社交裂变' },
                              { id: 3, label: '⏳ 闲时动态卡券调控' }
                            ].map((tab, idx) => (
                              <button
                                key={tab.id}
                                onClick={() => setSelectedScenario(idx)}
                                className={`text-[11px] font-bold px-3 py-2 rounded-lg text-center flex-1 shrink-0 transition-all ${
                                  selectedScenario === idx
                                    ? 'bg-indigo-600 text-white shadow'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          {/* Dynamic Content Pane for Scenario */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-[#0c0e20]/40 border border-slate-850 rounded-2xl p-6">
                            <div className="space-y-4">
                              {selectedScenario === 0 && (
                                <>
                                  <h3 className="text-lg font-black text-white">差评私下内部化解，拦截公网负面声誉</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    顾客通过桌贴二维码扫码吐槽直接向系统提交意见。系统拦截极速报警店长，同时自动派发致歉代金券，将矛盾化解在到店期间，免除大众点评及大众口碑差评。
                                  </p>
                                  <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                                    <li>扫码直通老板吐槽反馈 H5，阻隔差评上榜公网</li>
                                    <li>系统触发飞书/Lark 高优先级机器人提醒，店长5分钟介入</li>
                                    <li>自动赠送补偿性“致歉电子消费券”提升客情调和成功率</li>
                                  </ul>
                                </>
                              )}

                              {selectedScenario === 1 && (
                                <>
                                  <h3 className="text-lg font-black text-white">24/7 评论极速秒回，暴增 Google Maps SEO 排名</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    Google 评价算法将商家的“回复时效与活跃度”作为本地搜排名加分项。AI Agent 对 5 星好评秒回（2分钟内），提升店铺权重，拦截低星差评并自动发券挽回。
                                  </p>
                                  <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                                    <li>AI 极速秒回 Google/Yelp 5星好评，提升本地自然搜索流量</li>
                                    <li>差评附带私人补偿券链接，通过短信/WhatsApp自动挽回</li>
                                    <li>极大解放店面人手，无需天天盯着国外 Maps 后台</li>
                                  </ul>
                                </>
                              )}

                              {selectedScenario === 2 && (
                                <>
                                  <h3 className="text-lg font-black text-white">多人同桌同扫解锁，裂变拉新新玩法</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    扫码检测本桌同扫人数，达到设定阈值（如3人同扫）自动解锁整桌大额赠品或折扣，用户抽中后派发“必须带好友到店使用”的同行核销联合券。
                                  </p>
                                  <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                                    <li>聚餐熟人社交场景裂变，大额赠品快速锁定同桌新客</li>
                                    <li>双人同行副券设计，以旧客带新客促成二次到店</li>
                                    <li>结合大盘，实时统计多人社交裂变所激发的整体 GMV 增额</li>
                                  </ul>
                                </>
                              )}

                              {selectedScenario === 3 && (
                                <>
                                  <h3 className="text-lg font-black text-white">削峰填谷，闲时运力动态调控防利润稀释</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    设定卡券仅在工作日闲时（如周一至周四 14:00-17:30）可用，智能转盘下发该限时券，精准平衡餐厅桌效，防范周末高峰利润摊薄。
                                  </p>
                                  <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                                    <li>波谷低效时段定向优惠，释放厨房产能和员工多余运力</li>
                                    <li>周末/节假日黄金期卡券锁死，保护主力利润免遭优惠券侵蚀</li>
                                    <li>系统自动配合美团/点评广告推流，打出限时引流组合拳</li>
                                  </ul>
                                </>
                              )}
                            </div>

                            {/* visual mockup screen */}
                            <div className="border border-slate-800 rounded-2xl bg-slate-950 p-4 max-w-sm mx-auto shadow-inner relative">
                              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-slate-800 rounded-full flex items-center justify-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                              </div>
                              
                              <div className="bg-[#0f132a] rounded-xl p-4 mt-4 min-h-[180px] flex flex-col justify-between border border-slate-850">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                  <span className="text-[10px] font-bold text-slate-400">口碑营销闭环引擎</span>
                                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">Live</span>
                                </div>

                                {/* Mock Interactive Render */}
                                <div className="py-3 text-center space-y-2">
                                  {selectedScenario === 0 && (
                                    <>
                                      <div className="text-xs font-bold text-slate-200">差评直通车拦截中</div>
                                      <div className="text-[10px] text-red-400 italic">“服务态度太差，菜上太慢了！”</div>
                                      <div className="text-[9px] bg-emerald-500/15 text-emerald-400 py-1.5 px-3 rounded-lg border border-emerald-500/20 inline-block">
                                        已自动派发：￥30致歉无门槛券
                                      </div>
                                    </>
                                  )}
                                  {selectedScenario === 1 && (
                                    <>
                                      <div className="text-xs font-bold text-slate-200">Google Local SEO Boost</div>
                                      <div className="text-[9px] text-slate-400">星级: ⭐⭐⭐⭐⭐ (5星)</div>
                                      <div className="text-[9px] bg-slate-900 border border-slate-800 p-2 rounded text-left text-slate-300 max-h-16 overflow-y-auto">
                                        AI 回复：“感谢支持，2分钟内已极速应答并同步刷新排名机制！”
                                      </div>
                                    </>
                                  )}
                                  {selectedScenario === 2 && (
                                    <>
                                      <div className="text-xs font-bold text-slate-200">社交裂变解锁进度</div>
                                      <div className="flex justify-center gap-2 py-1">
                                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[9px]">A</div>
                                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[9px]">B</div>
                                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[9px]">C</div>
                                      </div>
                                      <div className="text-[9px] text-emerald-400">🎉 已达到3人同扫，全桌赠送网红招牌菜！</div>
                                    </>
                                  )}
                                  {selectedScenario === 3 && (
                                    <>
                                      <div className="text-xs font-bold text-slate-200">闲时卡券智能引擎</div>
                                      <div className="text-[9px] text-slate-400">时段: 周一至周四 14:00-17:30</div>
                                      <div className="text-[10px] font-bold text-indigo-400 animate-pulse">
                                        ⏳ 闲时特惠中 · 拒绝在黄金周末稀释利润
                                      </div>
                                    </>
                                  )}
                                </div>

                                <div className="text-[8px] text-slate-500 text-center border-t border-slate-800/80 pt-2">
                                  模拟商家小程序/平台终端展示
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slide 4: Competitor Matrix */}
                      {currentSlide === 4 && (
                        <div className="overflow-x-auto py-2">
                          <table className="w-full text-xs text-left text-slate-300 border-collapse">
                            <thead>
                              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-widest text-[9px]">
                                <th className="py-3 px-4">比较维度</th>
                                <th className="py-3 px-4 text-indigo-400 bg-indigo-950/20 font-bold border-x border-slate-800/50">AMC Kanban (V2)</th>
                                <th className="py-3 px-4">传统 RPA (如 UiPath)</th>
                                <th className="py-3 px-4">学术型多 Agent (如 EDICT)</th>
                                <th className="py-3 px-4">传统看板 (Jira/Linear)</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b border-slate-850 hover:bg-slate-900/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-100">AI 为一等公民</td>
                                <td className="py-3.5 px-4 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-800/50">✅ 独立 Profile/API Key</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 仅为后台模拟键鼠</td>
                                <td className="py-3.5 px-4 text-emerald-400">✅ 深度绑定官僚制</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 仅供人类使用的卡片</td>
                              </tr>
                              <tr className="border-b border-slate-850 hover:bg-slate-900/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-100">密码与凭证托管</td>
                                <td className="py-3.5 px-4 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-800/50">✅ 0 托管 (本地浏览器注入)</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 必须将密码存至云端</td>
                                <td className="py-3.5 px-4 text-slate-400">不涉及外部执行</td>
                                <td className="py-3.5 px-4 text-slate-400">不涉及自动化执行</td>
                              </tr>
                              <tr className="border-b border-slate-850 hover:bg-slate-900/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-100">错误处理与容错</td>
                                <td className="py-3.5 px-4 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-800/50">✅ 挂起 pending + 评论区 Resume</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 直接崩掉，人工重启改码</td>
                                <td className="py-3.5 px-4 text-yellow-500">⚠️ 模型级重试，耗费Token</td>
                                <td className="py-3.5 px-4 text-slate-400">纯人工流转操作</td>
                              </tr>
                              <tr className="border-b border-slate-850 hover:bg-slate-900/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-100">业务规则物理防线</td>
                                <td className="py-3.5 px-4 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-800/50">✅ 集中式网关 (DAG 强拦截)</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 依赖脚本代码内控制</td>
                                <td className="py-3.5 px-4 text-yellow-500">⚠️ 固定流程，缺乏灵活性</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 依靠人类团队自觉遵守</td>
                              </tr>
                              <tr className="border-b border-slate-850 hover:bg-slate-900/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-100">架构解耦与变更</td>
                                <td className="py-3.5 px-4 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-800/50">✅ 极高 (Dify-First, 随意换LLM)</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 极低 (脚本变动伤筋动骨)</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 极低 (模型与系统耦合)</td>
                                <td className="py-3.5 px-4 text-slate-400">无 AI 编排集成</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Slide 5: ROI Calculator & SaaS Pricing */}
                      {currentSlide === 5 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch py-2">
                          {/* Left: SaaS Tier cards */}
                          <div className="space-y-4 flex flex-col justify-center">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">SaaS 阶梯定价方案</h4>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Tier 1 */}
                              <div className="bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 rounded-xl p-4 flex flex-col justify-between transition-all">
                                <div>
                                  <div className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded inline-block">单店先锋版</div>
                                  <div className="text-lg font-black text-white mt-2">$49 - $99<span className="text-xs font-normal text-slate-400">/月</span></div>
                                  <ul className="text-[10px] text-slate-400 mt-2 space-y-1">
                                    <li>• 基础人机看板，2个 Agent 席位</li>
                                    <li>• 零凭证本地浏览器插件授权</li>
                                    <li>• 历史审计日志保留 7 天</li>
                                  </ul>
                                </div>
                                <button className="w-full mt-4 py-1.5 bg-slate-800 hover:bg-indigo-600 text-white rounded-lg text-[10px] font-bold transition-all">选择基础版</button>
                              </div>

                              {/* Tier 2 */}
                              <div className="bg-gradient-to-b from-[#11132f] to-[#0c0e20] border border-indigo-500/30 rounded-xl p-4 flex flex-col justify-between relative shadow-lg">
                                <div className="absolute top-2 right-2 bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider">PRO</div>
                                <div>
                                  <div className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded inline-block">连锁多店版</div>
                                  <div className="text-lg font-black text-white mt-2">$299 - $599<span className="text-xs font-normal text-slate-400">/月</span></div>
                                  <ul className="text-[10px] text-slate-400 mt-2 space-y-1">
                                    <li>• 跨门店大盘，不限 Agent 席位</li>
                                    <li>• 完整 DAG 依赖强拦截 API 网关</li>
                                    <li>• 无限制高级审计数据报表导出</li>
                                  </ul>
                                </div>
                                <button className="w-full mt-4 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-lg text-[10px] font-bold shadow transition-all">选择专业版</button>
                              </div>
                            </div>
                          </div>

                          {/* Right: Interactive ROI Calculator */}
                          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                            <div className="space-y-4">
                              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Calculator className="w-4 h-4 text-emerald-500" />
                                连锁门店 ROI 动态测算器
                              </h4>

                              {/* Slider 1: Store Count */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-slate-400">拥有门店数量</span>
                                  <span className="text-indigo-400">{storeCount} 家</span>
                                </div>
                                <input
                                  type="range"
                                  min="1"
                                  max="50"
                                  value={storeCount}
                                  onChange={(e) => setStoreCount(Number(e.target.value))}
                                  className="w-full accent-indigo-500"
                                />
                              </div>

                              {/* Slider 2: Average Salary */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-slate-400">门店运营人员月均工资</span>
                                  <span className="text-indigo-400">￥{avgWage} 元</span>
                                </div>
                                <input
                                  type="range"
                                  min="3000"
                                  max="15000"
                                  step="500"
                                  value={avgWage}
                                  onChange={(e) => setAvgWage(Number(e.target.value))}
                                  className="w-full accent-indigo-500"
                                />
                              </div>

                              {/* Calculations Output */}
                              <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                                  <div className="text-[9px] text-slate-400 font-bold">传统运营年成本</div>
                                  <div className="text-sm font-black text-red-400 mt-0.5">￥{manualLaborCost.toLocaleString()}</div>
                                </div>
                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                                  <div className="text-[9px] text-slate-400 font-bold">AMC 协同运营年成本</div>
                                  <div className="text-sm font-black text-emerald-400 mt-0.5">￥{amcTotalCost.toLocaleString()}</div>
                                </div>
                              </div>
                            </div>

                            {/* Annual Saved Total */}
                            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                              <div>
                                <span className="text-[9px] text-slate-500 font-bold">每年预计净节省支出</span>
                                <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400">
                                  ￥{savedCost.toLocaleString()} 元/年
                                </h3>
                              </div>
                              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg px-2.5 py-1 text-center shrink-0">
                                <div className="text-[8px] font-bold">Google Maps 流量增加</div>
                                <div className="text-xs font-black">+{expectedTrafficIncreasePercent}%</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Footer Slider controls */}
                <div className="border-t border-slate-800/50 pt-4 mt-6 flex items-center justify-between">
                  <button
                    disabled={currentSlide === 0}
                    onClick={() => setCurrentSlide(prev => prev - 1)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 disabled:opacity-30 disabled:hover:border-slate-800 transition-all"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    上一页
                  </button>
                  
                  {/* Pips */}
                  <div className="flex gap-1.5">
                    {slides.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSlide(idx)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          currentSlide === idx ? 'bg-indigo-500 w-6' : 'bg-slate-800 hover:bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    disabled={currentSlide === slides.length - 1}
                    onClick={() => setCurrentSlide(prev => prev + 1)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-xs font-bold text-white rounded-lg disabled:opacity-30 transition-all"
                  >
                    下一页
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            // FAQ Database Mode
            <motion.div
              key="faq-mode"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 max-w-4xl mx-auto min-h-[calc(100vh-180px)]"
            >
              {/* Search & Category Header */}
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h1 className="text-2xl md:text-3xl font-black text-white">常见问题与深度解答 (FAQ)</h1>
                  <p className="text-xs md:text-sm text-slate-400">查询关于系统安全、密码托管、网页自动化和 Dify 接入的疑问</p>
                </div>

                {/* Search Bar */}
                <div className="relative max-w-md mx-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="输入关键词搜索安全性、插件桥等问题..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl text-xs text-slate-200 placeholder-slate-500 transition-all shadow-inner"
                  />
                </div>

                {/* Category Buttons */}
                <div className="flex justify-center gap-1.5 flex-wrap">
                  {[
                    { id: 'all', label: '全部问题' },
                    { id: 'security', label: '🔒 安全与凭证' },
                    { id: 'automation', label: '🤖 自动与自愈' },
                    { id: 'integrations', label: '🔌 接入与 Dify' },
                    { id: 'pricing', label: '💰 商业与定价' }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedFaqCategory(cat.id as any)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${
                        selectedFaqCategory === cat.id
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* FAQ Accordion List */}
              <div className="space-y-3 pt-2">
                <AnimatePresence>
                  {filteredFaqs.length > 0 ? (
                    filteredFaqs.map((faq, idx) => {
                      const isExpanded = expandedFaqIndex === idx
                      return (
                        <motion.div
                          key={faq.question}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className="bg-slate-950/40 border border-slate-850 hover:border-slate-800 rounded-2xl overflow-hidden transition-all shadow-md"
                        >
                          <button
                            onClick={() => setExpandedFaqIndex(isExpanded ? null : idx)}
                            className="w-full flex items-center justify-between p-4 text-left font-bold text-xs md:text-sm text-slate-200 hover:text-white"
                          >
                            <span className="flex items-center gap-2">
                              {faq.category === 'security' && <Lock className="w-3.5 h-3.5 text-indigo-400" />}
                              {faq.category === 'automation' && <Zap className="w-3.5 h-3.5 text-emerald-400" />}
                              {faq.category === 'integrations' && <BookOpen className="w-3.5 h-3.5 text-purple-400" />}
                              {faq.category === 'pricing' && <Calculator className="w-3.5 h-3.5 text-indigo-400" />}
                              {faq.question}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                          
                          {/* Expanded Answer with smooth height animation */}
                          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                            isExpanded ? 'max-h-[300px] border-t border-slate-850/60 p-4 bg-slate-950/30' : 'max-h-0'
                          }`}>
                            <p className="text-xs md:text-sm text-slate-400 leading-relaxed font-normal">
                              {faq.answer}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })
                  ) : (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      没有找到匹配该关键词的常见问题。
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Section */}
      <footer className="border-t border-slate-900 bg-slate-950/50 py-8 text-center text-[10px] text-slate-600">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>© 2026 AMC Command Center. All rights reserved. 人机协同任务操作系统版权所有.</p>
          <div className="flex justify-center gap-4 text-slate-500">
            <button onClick={() => { setActiveTab('deck'); setCurrentSlide(0) }} className="hover:text-slate-300">产品演示</button>
            <span>·</span>
            <button onClick={() => { setActiveTab('faq'); setSelectedFaqCategory('all') }} className="hover:text-slate-300">常见问题</button>
            <span>·</span>
            <a href="/board" className="hover:text-slate-300">返回协作看板</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
