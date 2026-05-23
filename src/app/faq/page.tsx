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
  MapPin,
  UtensilsCrossed,
  MousePointerClick
} from 'lucide-react'

// Slide data types
interface Slide {
  id: number
  title: string
  subtitle: string
  tag: string
}

const slides: Slide[] = [
  { id: 0, title: '人机协同 · 出海破局', subtitle: 'Global Dining Brand Social Media & Reputation OS', tag: 'PRODUCT VISION' },
  { id: 1, title: '跨国运营四大痛点', subtitle: '中餐品牌走向全球化的深水阻碍', tag: 'MARKET PAIN POINTS' },
  { id: 2, title: '五大硬核技术柱石', subtitle: '如何用物理隔离与网关拦截保障安全', tag: 'TECHNICAL ARCHITECTURE' },
  { id: 3, title: 'O2O 口碑客流闭环', subtitle: '海外到店口碑拦截与本地 SEO 自然流量爆破', tag: 'SCENARIO EMPOWERMENT' },
  { id: 4, title: '竞品对比星级矩阵', subtitle: 'AMC 对标传统 RPA 与海外代运营代沟', tag: 'COMPETITIVE MATRIX' },
  { id: 5, title: 'SaaS 定价与动态 ROI', subtitle: '以技术红利替代昂贵海外代运营成本', tag: 'INVESTMENT & ROI' }
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
    question: '国内运营频繁翻墙发布 Meta (Instagram) 会封号，AMC 怎么解决？',
    answer: '这是出海品牌最大的痛点。异地 IP 变动和代理服务器极易触发 Instagram 和 Google 的登录验证甚至直接永久封号。AMC 采用“本地浏览器插件桥”技术：国内总部在看板上生成文案后，指令通过 SSE 长连接发往海外门店电脑上的 Chrome 插件。发帖动作完全在海外门店店员的前台浏览器中执行，使用的是海外店面真实的本地 IP、真实设备与指纹。对平台而言这就是百分之百的本地自然发帖，风险彻底归零。'
  },
  {
    category: 'security',
    question: '商家不需要向系统提供 Instagram 或 Yelp 的账号密码吗？',
    answer: '是的，完全不需要。传统 RPA 方案需要用户将敏感的登录 Session、Cookie 或者是明文的账号密码托管在服务商的云端服务器上，面临极大的安全隐患。AMC 采用零凭证托管架构，发帖和回复指令由看板中转，指令下发到门店本地浏览器后，在本地的活跃 Session（店员已登录好的页面）中模拟键鼠点击。敏感登录信息物理隔绝在门店本地，服务器不存任何密码。'
  },
  {
    category: 'automation',
    question: '如果国内总部对 AI 生成的英文文案或当地俚语把控不准怎么办？',
    answer: 'AMC 拥有“人机 Markdown 沟通通道”和“DAG 任务依赖拦截”机制。AI 本地化 Agent 在生成文案时若遇到不确定或可能违反品牌调性的内容，会自动挂起任务为 `pending` 状态，并在任务卡片的评论区中列出待选的几套英文文案以及对应的中文大意解释。国内的主编团队可以在评论区留言指导，AI 收到后自愈重写，通过审核后才解禁下发发帖指令。'
  },
  {
    category: 'integrations',
    question: '中英文自媒体并行运营，看板是如何支撑的？',
    answer: 'AMC 在看板底层设计了“AI Agent 一等公民”的多智能体协作模式。您可以同时配置“小红书中文引流 Agent”（针对海外华人客群）和“Instagram 英文本土化 Agent”（针对海外当地西人客群）。它们有各自的 API Key 和模型设定，总部通过同一张 Kanban 画布即可协同管理双语种、多平台的发布与口碑任务，防止跨语境运营混乱。'
  },
  {
    category: 'automation',
    question: '任务依赖中的 DAG 拦截是如何防范“AI 抢跑发表”的？',
    answer: '系统支持配置前置 Blockers（任务依赖）。例如，任务B（海外 Agent 自动发帖）前置依赖于任务A（国内总部人工审核内容大纲）。在任务A非 Done/Void 状态下，即使外部 Agent 的发帖代码发生幻觉并不断尝试请求发布，AMC 集中式 API 网关也会在接口级别抛出 `400 Blocked` 错误拦截指令下发，确保发布流程绝对受控。'
  },
  {
    category: 'pricing',
    question: 'AMC Kanban 怎么收费？在海外支持哪些支付币种？',
    answer: 'AMC 主要提供按门店订阅的 SaaS 服务包：出海先锋版（$99/月/门店，支持中英文双 Agent 及插件桥）；多店旗舰版（$499/月/连锁，支持多店大盘、集中式网关、总部审批流）。此外可以叠加购买 AI 运营流量包（根据每月实际回复的 Yelp/Google 评价和发帖数量消耗）。我们支持美元（USD）、人民币（RMB）双币种结算。'
  },
  {
    category: 'integrations',
    question: '我们已经有 Dify 了，系统可以与我们的 Dify 工作流无缝对接吗？',
    answer: '完全支持。AMC 遵循 Dify-First 设计理念，看板专注负责“协作表现层、人机审批、审计日志和本地执行网关”，而把复杂的自然语言处理（如中英文翻译、语气 localization、Yelp 负面情绪分析）完全解耦给您在 Dify 中创建好的工作流。通过 Agent API 接口，Dify 工作流可以直接读取/回写看板卡片状态，具有极高的定制自由度。'
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
  const [avgWage, setAvgWage] = useState(4500) // Default $4500/month for US local SMM

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

  // ROI Calculations in USD ($)
  const manualLaborCost = storeCount * (avgWage * 0.4) * 12
  const amcTotalCost = (storeCount <= 3 ? 99 : 499) * 12 + (storeCount * 30 * 12)
  const savedCost = Math.round(manualLaborCost - amcTotalCost)
  const expectedTrafficIncreasePercent = 22
  const additionalVisits = storeCount * 180 * 12
  const conversionValue = Math.round(additionalVisits * 0.05 * 45)

  // Filtered FAQ Items
  const filteredFaqs = faqData.filter(faq => {
    const matchQuery = faq.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    const matchCategory = selectedFaqCategory === 'all' || faq.category === selectedFaqCategory
    return matchQuery && matchCategory
  })

  return (
    <div className="min-h-screen bg-[#03050d] text-slate-100 font-sans antialiased overflow-x-hidden relative selection:bg-indigo-500 selection:text-white">
      {/* star dotted grid background */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none -z-10"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Cyber Mesh Nebulas */}
      <div className="absolute top-0 left-10 w-[700px] h-[700px] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none -z-10 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-20 right-10 w-[800px] h-[800px] bg-purple-500/5 rounded-full blur-[160px] pointer-events-none -z-10 animate-pulse" style={{ animationDuration: '12s' }} />
      <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Premium Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#03050d]/80 border-b border-slate-900/80 transition-all shadow-lg shadow-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 relative overflow-hidden group">
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <Bot className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <span className="font-black text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-indigo-300">AMC KANBAN</span>
              <span className="ml-2.5 px-2 py-0.5 text-[8px] font-black tracking-widest text-indigo-400 bg-indigo-500/10 rounded-full border border-indigo-500/20 uppercase">GLOBAL DINING</span>
            </div>
          </div>

          {/* Mode Toggle Switcher */}
          <div className="flex bg-slate-950 border border-slate-800/80 rounded-full p-1 shadow-inner relative z-10">
            <button
              onClick={() => setActiveTab('deck')}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-black transition-all ${
                activeTab === 'deck'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              产品展示 (PITCH DECK)
            </button>
            <button
              onClick={() => setActiveTab('faq')}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-black transition-all ${
                activeTab === 'faq'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/10'
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow">
        <AnimatePresence mode="wait">
          {activeTab === 'deck' ? (
            <motion.div
              key="deck-mode"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="flex flex-col lg:flex-row gap-10 items-stretch min-h-[calc(100vh-220px)]"
            >
              {/* Grand Navigation Sidebar */}
              <div className="lg:w-72 flex flex-row lg:flex-col gap-3 overflow-x-auto lg:overflow-x-visible pb-4 lg:pb-0 border-b lg:border-b-0 lg:border-r border-slate-900 pr-0 lg:pr-8 shrink-0 hide-scrollbar justify-start">
                <div className="hidden lg:block mb-5">
                  <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-4">DECK CHAPTERS</h4>
                </div>
                {slides.map((slide, idx) => (
                  <button
                    key={slide.id}
                    onClick={() => setCurrentSlide(idx)}
                    className={`flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all shrink-0 border relative overflow-hidden ${
                      currentSlide === idx
                        ? 'bg-gradient-to-br from-indigo-950/40 to-slate-950 border-indigo-500/40 text-indigo-300 shadow-xl shadow-indigo-950/40'
                        : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                    }`}
                  >
                    {currentSlide === idx && (
                      <motion.div 
                        layoutId="active-bar" 
                        className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" 
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                    <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-md ${
                      currentSlide === idx ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-900 text-slate-600'
                    }`}>
                      {String(slide.id + 1).padStart(2, '0')}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold">{slide.title}</span>
                      <span className="text-[9px] text-slate-500 mt-0.5 hidden lg:inline truncate max-w-[170px]">{slide.subtitle}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Main Deck Canvas */}
              <div className="flex-1 flex flex-col justify-between bg-slate-950/60 border border-slate-900 rounded-3xl p-8 md:p-12 backdrop-blur-2xl relative overflow-hidden shadow-2xl shadow-indigo-950/20">
                {/* Dotted corner decoration */}
                <div className="absolute top-4 right-4 text-slate-800 font-mono text-[9px] select-none pointer-events-none">
                  AMC_OS_PITCH_DECK_V2.1 // CONFIDENTIAL
                </div>

                {/* Slide Title Panel */}
                <div className="flex flex-col border-b border-slate-900 pb-6 mb-8">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-black text-indigo-400 tracking-wider uppercase">
                      {slides[currentSlide].tag}
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <h2 className="text-2xl md:text-4xl font-black text-white mt-2 tracking-tight">
                    {slides[currentSlide].title}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1 font-medium">{slides[currentSlide].subtitle}</p>
                </div>

                {/* Slide Content Canvas */}
                <div className="flex-grow flex flex-col justify-center py-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentSlide}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="w-full"
                    >
                      {/* Slide 0: Product Vision (Full-Scale Grand Design) */}
                      {currentSlide === 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                          <div className="lg:col-span-7 space-y-6">
                            <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-3.5 py-1.5 rounded-full text-xs font-black">
                              <Sparkles className="w-4 h-4 text-indigo-400" />
                              人机协作的全球大航海时代
                            </div>
                            <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tight text-white">
                              让海外自媒体与口碑运营<br />
                              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400">告别跨国风控与昂贵人工</span>
                            </h1>
                            <p className="text-base text-slate-300 leading-relaxed font-medium">
                              出海中餐品牌走向全球时，常因为“不懂本地英文文案”、“雇不起海外代运营（ Agency ）”或“跨国发布频繁遭遇风控封号”而错失大好市场。AMC 将 AI 智能体打造成您店里的虚拟员工，在安全合规的前提下，替您接管中英文双自媒体运营和海外口碑治理。
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 pt-4">
                              <button
                                onClick={() => setCurrentSlide(1)}
                                className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-sm font-black px-8 py-4 rounded-2xl shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/35 transition-all group cursor-pointer"
                              >
                                剖析海外运营四大痛点
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                              </button>
                              <button
                                onClick={() => setActiveTab('faq')}
                                className="flex items-center justify-center gap-2 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 text-slate-300 text-sm font-black px-8 py-4 rounded-2xl transition-all cursor-pointer"
                              >
                                常见问题 FAQ
                              </button>
                            </div>
                          </div>

                          {/* Atmospheric Visualizer Art */}
                          <div className="lg:col-span-5 flex items-center justify-center relative">
                            {/* Radial Ambient Glow */}
                            <div className="absolute w-72 h-72 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
                            
                            {/* Visual Grid canvas */}
                            <div className="w-80 h-80 rounded-3xl bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800/80 p-6 flex flex-col justify-between shadow-2xl relative">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-mono text-slate-500">SYSTEM STATUS: ONLINE</span>
                                <div className="flex gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-red-400" />
                                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                </div>
                              </div>

                              {/* Central Visual */}
                              <div className="flex-grow flex flex-col items-center justify-center py-6 relative">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/20 relative z-10 animate-bounce" style={{ animationDuration: '3s' }}>
                                  <UtensilsCrossed className="w-10 h-10 text-white" />
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-44 h-44 border border-indigo-500/10 rounded-full animate-ping" style={{ animationDuration: '4s' }} />
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-32 h-32 border border-purple-500/20 rounded-full animate-pulse" />
                                </div>
                              </div>

                              {/* Interactive badges */}
                              <div className="flex justify-between gap-2">
                                <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-center flex-1">
                                  <div className="text-[8px] text-slate-500 font-bold">国内总部 (HQ)</div>
                                  <div className="text-[10px] font-black text-indigo-400 mt-0.5">控制与审核</div>
                                </div>
                                <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-center flex-1">
                                  <div className="text-[8px] text-slate-500 font-bold">海外店面 (Plugin)</div>
                                  <div className="text-[10px] font-black text-emerald-400 mt-0.5">本地发布</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slide 1: Market Pain Points */}
                      {currentSlide === 1 && (
                        <div className="space-y-8 py-2">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {/* Card 1 */}
                            <div className="bg-slate-950/40 border border-slate-900 hover:border-indigo-500/35 rounded-3xl p-6 transition-all group relative overflow-hidden shadow-lg hover:shadow-indigo-950/10 flex flex-col justify-between min-h-[220px]">
                              <div className="absolute -top-12 -right-12 w-28 h-28 bg-red-500/5 rounded-full blur-xl group-hover:bg-red-500/10 transition-all" />
                              <div>
                                <span className="text-xs font-mono font-black text-red-500 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md">PAIN 01</span>
                                <h3 className="text-base font-black text-white mt-4">本地文案与文化断层</h3>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed font-medium mt-2">
                                国内团队写出的英文英文干瘪生硬，不懂海外俚语和网络爆梗。AMC 自研本地化 Agent，自动生成生动地道的海外本地文案，配以精准标签。
                              </p>
                            </div>

                            {/* Card 2 */}
                            <div className="bg-slate-950/40 border border-slate-900 hover:border-indigo-500/35 rounded-3xl p-6 transition-all group relative overflow-hidden shadow-lg hover:shadow-indigo-950/10 flex flex-col justify-between min-h-[220px]">
                              <div className="absolute -top-12 -right-12 w-28 h-28 bg-yellow-500/5 rounded-full blur-xl group-hover:bg-yellow-500/10 transition-all" />
                              <div>
                                <span className="text-xs font-mono font-black text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-md">PAIN 02</span>
                                <h3 className="text-base font-black text-white mt-4">本土代运营价格高昂</h3>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed font-medium mt-2">
                                聘请欧美本土自媒体代运营，单店月收高达 $3k-$5k。AI 自动发帖和回复可以替代 90% 繁杂的人工操作，削减大笔代运营费用。
                              </p>
                            </div>

                            {/* Card 3 */}
                            <div className="bg-slate-950/40 border border-slate-900 hover:border-indigo-500/35 rounded-3xl p-6 transition-all group relative overflow-hidden shadow-lg hover:shadow-indigo-950/10 flex flex-col justify-between min-h-[220px]">
                              <div className="absolute -top-12 -right-12 w-28 h-28 bg-orange-500/5 rounded-full blur-xl group-hover:bg-orange-500/10 transition-all" />
                              <div>
                                <span className="text-xs font-mono font-black text-orange-500 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-md">PAIN 03</span>
                                <h3 className="text-base font-black text-white mt-4">跨国登录引发的风控封号</h3>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed font-medium mt-2">
                                从中国翻墙登录海外 Meta 或 Google 商家后台风险极高。AMC 插件直接运行在海外店面的本地网络电脑上，走 100% 当地绿色 IP。
                              </p>
                            </div>

                            {/* Card 4 */}
                            <div className="bg-slate-950/40 border border-slate-900 hover:border-indigo-500/35 rounded-3xl p-6 transition-all group relative overflow-hidden shadow-lg hover:shadow-indigo-950/10 flex flex-col justify-between min-h-[220px]">
                              <div className="absolute -top-12 -right-12 w-28 h-28 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-all" />
                              <div>
                                <span className="text-xs font-mono font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">PAIN 04</span>
                                <h3 className="text-base font-black text-white mt-4">中英文自媒体并行割裂</h3>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed font-medium mt-2">
                                既要服务当地西人群体（IG/Yelp），又要维护华人受众（小红书/微信）。双语 Agent 在一张看板上协作，中英渠道无缝并轨。
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slide 2: Core Technical Pillars (Animated Diagram / Interactive Canvas) */}
                      {currentSlide === 2 && (
                        <div className="flex flex-col lg:flex-row gap-8 py-2 items-stretch">
                          {/* Sidebar selector */}
                          <div className="lg:w-72 flex flex-col gap-2 shrink-0">
                            {[
                              { id: 1, label: '🤖 中英文双语 Agent 体系', icon: Bot },
                              { id: 2, label: '🔌 跨国安全“本地插件桥”', icon: Globe },
                              { id: 3, label: '🔒 总部管控 DAG 审批流', icon: Lock },
                              { id: 4, label: '💬 错误挂起与断点 Resume', icon: MessageSquare },
                              { id: 5, label: '🪵 集中式网关负载审计记录', icon: Sliders }
                            ].map(hub => (
                              <button
                                key={hub.id}
                                onClick={() => setSelectedTechHub(hub.id)}
                                className={`text-xs font-black px-5 py-3.5 rounded-xl text-left border flex items-center gap-3 transition-all cursor-pointer ${
                                  selectedTechHub === hub.id
                                    ? 'bg-gradient-to-r from-indigo-600 via-indigo-900 to-indigo-950 border-indigo-500/60 text-white shadow-xl shadow-indigo-950/20'
                                    : 'bg-slate-900/40 border-slate-900 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                                }`}
                              >
                                <hub.icon className={`w-4 h-4 ${selectedTechHub === hub.id ? 'text-indigo-300' : 'text-slate-500'}`} />
                                {hub.label}
                              </button>
                            ))}
                          </div>

                          {/* Dynamic Architecture Display */}
                          <div className="flex-grow bg-[#050814] border border-slate-850 rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-2xl relative">
                            {/* Background mesh glow inside panel */}
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/0 rounded-3xl pointer-events-none" />

                            <div className="space-y-4 relative z-10">
                              {selectedTechHub === 1 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                                    <Bot className="w-4 h-4" /> Multi-Agent 双系统并轨
                                  </div>
                                  <h3 className="text-xl font-black text-white">中英文 Agent 联合作战</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    多 Agent 模型下，系统可自动为不同任务派发对应的语种智能体（如“小红书引流 Agent”及“Instagram 本地化 Agent”）。每一个 Agent 在系统都有独立的 API Key、心跳活跃检测与模型参数设定。
                                  </p>
                                  <div className="bg-slate-950/90 border border-slate-900 rounded-xl p-4 font-mono text-[10px] text-indigo-300/90 shadow-inner">
                                    <span className="text-slate-500">// API Key 级别鉴权，总部看板并行管理</span><br />
                                    POST /api/tasks/create (assignee: <span className="text-emerald-400">RED_Chinese_Agent</span>)<br />
                                    POST /api/tasks/create (assignee: <span className="text-purple-400">IG_English_Agent</span>)
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 2 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                                    <Globe className="w-4 h-4" /> SSE (Server-Sent Events) 长连接网页穿透
                                  </div>
                                  <h3 className="text-xl font-black text-white">店面本地 Session 模拟执行，绕过所有跨国风控</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    AMC 仅下发具体的逻辑指令，发帖和 Yelp 回复都在纽约/伦敦/巴黎店内的电脑端执行。插件在前台活跃标签页中模拟人的打字和点击，走的是海外店面真实本地 IP，杜绝翻墙被封。
                                  </p>
                                  <div className="bg-slate-950/90 border border-slate-900 p-4 rounded-xl flex items-center justify-between text-[10px] font-mono">
                                    <span className="text-slate-500">SSE Bridge Command:</span>
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px]">ACTION: PUBLISH_IG</span>
                                    <span className="text-slate-500">IP: NY_MEMBER_SHOP</span>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 3 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                                    <Lock className="w-4 h-4" /> DAG (有向无环图) 接口拦截
                                  </div>
                                  <h3 className="text-xl font-black text-white">国内总部掌握终审权，拦截 AI 幻觉发布</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    任务之间支持 blockers 自依赖。当“国内总部审核”前置步骤处于非 Done 状态时，即使 AI 尝试发布，网关也会在 API 层面直接物理拒绝发帖 Agent 的 API Key 更新请求，保障信息合规。
                                  </p>
                                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-xl text-[10px] font-bold">
                                    <XCircle className="w-4 h-4 shrink-0" />
                                    <span>API GATEWAY: [400 Blocked] HQ approval is required before publishing.</span>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 4 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                                    <MessageSquare className="w-4 h-4" /> Markdown Context Preserved Thread
                                  </div>
                                  <h3 className="text-xl font-black text-white">AI 挂起 pending，人类评论区 Resume 自愈</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    AI 在文案中检测到敏感词或发生错误时会自动挂起任务为 pending。人类主编可以直接在同一任务卡片的 Markdown 评论区内进行内容修正，一键 Resume 即可在原断点处自愈重跑。
                                  </p>
                                  <div className="border border-slate-900 rounded-xl p-3 bg-slate-950/80 flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[10px] font-mono font-black text-emerald-400 shrink-0">AI</div>
                                    <div className="flex-1 space-y-1">
                                      <div className="text-[10px] text-slate-500 font-bold">Yelp Responder Agent 15:40</div>
                                      <p className="text-[10px] text-slate-200 leading-relaxed font-normal">❌ 错误：客人提到的拼写细节“hot pot flavor”可能存在文化梗歧义，已挂起 pending，请修改文案。</p>
                                    </div>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 5 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                                    <Sliders className="w-4 h-4" /> Transparent Gateway Log
                                  </div>
                                  <h3 className="text-xl font-black text-white">对 Agent 完全透明的 API 网关与日志高亮</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    AMC 集中式透明网关记录所有的请求 payload，并在发生异常（如网络抖动）时拦截并返回极其精准的报错回传，协助 Agent 自动修正行为，提供无死角的审计保障。
                                  </p>
                                  <div className="flex justify-between items-center bg-slate-950/90 border border-slate-900 p-3.5 rounded-xl text-[9px] font-mono">
                                    <span className="text-slate-500">审计分类: 浏览器插件桥</span>
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">EXTENSION_CMD_RECV</span>
                                    <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">EXTENSION_CMD_ERR</span>
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="text-[10px] text-slate-500 text-right mt-6 pt-3 border-t border-slate-900/60">
                              点击左侧架构柱石，切换查看跨境技术实现细节
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slide 3: O2O Living Services Closed Loop (Grand Visual Layout) */}
                      {currentSlide === 3 && (
                        <div className="space-y-6 py-2">
                          <div className="flex bg-slate-950 border border-slate-900 rounded-2xl p-1 w-full overflow-x-auto hide-scrollbar">
                            {[
                              { id: 0, label: '🛑 差评内部私下拦截' },
                              { id: 1, label: '🚀 Yelp/Google Maps SEO 爆破' },
                              { id: 2, label: '👥 熟人聚餐拉新核销' },
                              { id: 3, label: '⏳ 闲时动态卡券调控' }
                            ].map((tab, idx) => (
                              <button
                                key={tab.id}
                                onClick={() => setSelectedScenario(idx)}
                                className={`text-[11px] font-black px-4 py-2.5 rounded-xl text-center flex-1 shrink-0 transition-all cursor-pointer ${
                                  selectedScenario === idx
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-[#050814]/40 border border-slate-900 rounded-3xl p-8">
                            <div className="lg:col-span-7 space-y-4">
                              {selectedScenario === 0 && (
                                <>
                                  <h3 className="text-xl font-black text-white">吐槽直通老板，将一星差评扼杀在公网前</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    顾客对菜品（如不够辣、牛肉太柴）产生负面情绪时，引导其通过桌贴二维码或内部小程序直通通道向商家投诉。系统获取吐槽后立即通知海外店长，并向该桌顾客派发致歉代金券平息情绪。
                                  </p>
                                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl flex items-start gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping mt-1 shrink-0" />
                                    <span className="text-xs text-slate-400">
                                      <strong>和解率统计</strong>：在到店阶段进行私下内部调和补偿，能有效拦截 85% 以上流向 Yelp/Google Maps 的一星公开差评，捍卫品牌声誉。
                                    </span>
                                  </div>
                                </>
                              )}

                              {selectedScenario === 1 && (
                                <>
                                  <h3 className="text-xl font-black text-white">评价 2 分钟极速秒回，获取 Google Maps SEO 溢价流量</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    Google 算法偏爱活跃商家。AI 24小时值守秒回 5 星好评，低星差评5分钟内安抚引导。通过不断刷新商户响应时间，使得商家的 Google Local 搜索排名提升 2-3 位。
                                  </p>
                                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl flex items-start gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse mt-1 shrink-0" />
                                    <span className="text-xs text-slate-400">
                                      <strong>流量爆破</strong>：在海外本地“Hotpot near me”或“Bobatea”检索中，Google 3-Pack（前三位商户榜单）所带来的自然客流价值单店年均可达数万美元。
                                    </span>
                                  </div>
                                </>
                              )}

                              {selectedScenario === 2 && (
                                <>
                                  <h3 className="text-xl font-black text-white">海外聚餐熟人裂变拉新，大额副券二次同行核销</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    扫码器配置同桌多人（如3人以上）同扫门槛解锁福利，新客抽中奖品后生成联合副券，该卡券必须“双人同行”或“分享第二人核销”方能生效，以此引流海外主流客群。
                                  </p>
                                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl flex items-start gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse mt-1 shrink-0" />
                                    <span className="text-xs text-slate-400">
                                      <strong>裂变杠杆</strong>：依靠聚餐熟人社交链发券，让您的每一位海外老顾客都成为品牌自发的拉新销售员，实现客单价与新客比例倍增。
                                    </span>
                                  </div>
                                </>
                              )}

                              {selectedScenario === 3 && (
                                <>
                                  <h3 className="text-xl font-black text-white">波谷时段动态调价卡券，保护周末黄金利润率</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    系统依据历史运营大盘，对周一至周四下午低峰段进行闲时折扣卡券派发，消化后厨和堂食冗余运力。周末高峰期折扣卡券自动锁定，不稀释任何核心利润。
                                  </p>
                                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl flex items-start gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse mt-1 shrink-0" />
                                    <span className="text-xs text-slate-400">
                                      <strong>桌效平衡</strong>：将客流合理分流到周内，既满足了价格敏感型客户的需求，又释放了餐厅的综合桌效，防范周末排队导致的客人流失。
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* visual mockup screen */}
                            <div className="lg:col-span-5 border border-slate-800 rounded-3xl bg-slate-950 p-5 max-w-sm w-full mx-auto shadow-2xl relative">
                              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-800 rounded-full flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-slate-900" />
                              </div>
                              
                              <div className="bg-[#0b0d1a] rounded-2xl p-5 mt-5 min-h-[220px] flex flex-col justify-between border border-slate-900">
                                <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                                  <span className="text-[10px] font-black text-slate-400">O2O 口碑闭环引擎</span>
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                    <span className="text-[8px] rounded bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 font-mono">Live</span>
                                  </div>
                                </div>

                                {/* Mock Interactive Render */}
                                <div className="py-4 text-center space-y-3">
                                  {selectedScenario === 0 && (
                                    <>
                                      <div className="text-xs font-black text-slate-200">差评直通车拦截中</div>
                                      <div className="text-[10px] text-red-400 bg-red-500/5 py-1.5 px-3 border border-red-500/10 rounded-lg italic">
                                        "The customer complained that the beef brisket was too tough!"
                                      </div>
                                      <div className="text-[9px] bg-emerald-500/15 text-emerald-400 py-1.5 px-3 rounded-xl border border-emerald-500/20 inline-block font-bold">
                                        Voucher Send: $15 OFF致歉券
                                      </div>
                                    </>
                                  )}
                                  {selectedScenario === 1 && (
                                    <>
                                      <div className="text-xs font-black text-slate-200">Google Local Maps SEO</div>
                                      <div className="text-[9px] text-slate-400">Rating: ⭐⭐⭐⭐⭐ (5 Stars)</div>
                                      <div className="text-[9px] bg-slate-950 border border-slate-850 p-2.5 rounded-lg text-left text-slate-300 max-h-16 overflow-y-auto leading-relaxed">
                                        AI Auto-Response: "Thank you for loving our hotpot! We look forward to serving you again."
                                      </div>
                                    </>
                                  )}
                                  {selectedScenario === 2 && (
                                    <>
                                      <div className="text-xs font-black text-slate-200">三人同行拉新解锁</div>
                                      <div className="flex justify-center gap-2.5 py-1">
                                        <div className="w-7 h-7 rounded-full bg-indigo-600 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold">U1</div>
                                        <div className="w-7 h-7 rounded-full bg-indigo-600 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold">U2</div>
                                        <div className="w-7 h-7 rounded-full bg-indigo-600 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold">U3</div>
                                      </div>
                                      <div className="text-[9px] text-emerald-400 font-bold">🎉 3 scans detected! Joint Voucher Issued.</div>
                                    </>
                                  )}
                                  {selectedScenario === 3 && (
                                    <>
                                      <div className="text-xs font-black text-slate-200">波谷闲时流量优化</div>
                                      <div className="text-[9px] text-slate-400">Active hours: Mon-Thu 2:00-5:30 PM</div>
                                      <div className="text-[10px] font-bold text-indigo-400 animate-pulse">
                                        ⏳ Off-Peak Coupon: 15% OFF Dining
                                      </div>
                                    </>
                                  )}
                                </div>

                                <div className="text-[8px] text-slate-500 text-center border-t border-slate-850 pt-2 font-medium">
                                  海外店面手机终端模拟展示
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
                              <tr className="border-b border-slate-850 text-slate-400 uppercase tracking-widest text-[9px]">
                                <th className="py-4 px-5">比较维度</th>
                                <th className="py-4 px-5 text-indigo-400 bg-indigo-950/20 font-black border-x border-slate-900/50 rounded-t-xl">AMC Kanban (出海版)</th>
                                <th className="py-4 px-5">传统 RPA (如 UiPath)</th>
                                <th className="py-4 px-5">海外本土代运营 (Agency)</th>
                                <th className="py-4 px-5">通用看板 (Jira/Linear)</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                                <td className="py-4.5 px-5 font-black text-slate-100">跨国网络及风控防护</td>
                                <td className="py-4.5 px-5 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-900/50">⭐⭐⭐⭐⭐ (100% 门店本地IP)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (VPN/代理极易遭封禁)</td>
                                <td className="py-4.5 px-5 text-emerald-400">⭐⭐⭐⭐⭐ (当地人操作)</td>
                                <td className="py-4.5 px-5 text-slate-500">❌ 不涉及</td>
                              </tr>
                              <tr className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                                <td className="py-4.5 px-5 font-black text-slate-100">运营资金成本</td>
                                <td className="py-4.5 px-5 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-900/50">⭐⭐⭐⭐⭐ (极低，单店$99起)</td>
                                <td className="py-4.5 px-5 text-yellow-500">⭐⭐⭐ (脚本维护开销大)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (昂贵，月均 $3k-$5k)</td>
                                <td className="py-4.5 px-5 text-emerald-400">⭐⭐⭐⭐⭐ (低)</td>
                              </tr>
                              <tr className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                                <td className="py-4.5 px-5 font-black text-slate-100">中英文自媒体兼顾</td>
                                <td className="py-4.5 px-5 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-900/50">⭐⭐⭐⭐⭐ (中英 Agent 双语并轨)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (中外接口极难融合编写)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (老外不懂小红书/微信)</td>
                                <td className="py-4.5 px-5 text-slate-500">❌ 需人工处理</td>
                              </tr>
                              <tr className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                                <td className="py-4.5 px-5 font-black text-slate-100">总部管控防跑飞</td>
                                <td className="py-4.5 px-5 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-900/50">⭐⭐⭐⭐⭐ (网关 DAG 严格物理拦截)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (无拦截，AI 幻觉即发)</td>
                                <td className="py-4.5 px-5 text-yellow-500">⭐⭐⭐ (跨时区确认慢)</td>
                                <td className="py-4.5 px-5 text-slate-500">❌ 依靠人类自觉对齐</td>
                              </tr>
                              <tr className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                                <td className="py-4.5 px-5 font-black text-slate-100">架构及业务规则柔性</td>
                                <td className="py-4.5 px-5 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-900/50">⭐⭐⭐⭐⭐ (Dify-First, 模块热切换)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (改流程需重写底层代码)</td>
                                <td className="py-4.5 px-5 text-slate-500">❌ 无技术底座</td>
                                <td className="py-4.5 px-5 text-slate-500">❌ 无 AI 编排</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Slide 5: ROI Calculator & SaaS Pricing (Grand Layout) */}
                      {currentSlide === 5 && (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch py-2">
                          {/* Left: SaaS Tier cards in USD */}
                          <div className="xl:col-span-5 space-y-4 flex flex-col justify-center">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">SaaS 订阅与流量套餐 (USD)</h4>
                            
                            <div className="grid grid-cols-1 gap-4">
                              {/* Tier 1 */}
                              <div className="bg-slate-950/60 border border-slate-900 hover:border-indigo-500/30 rounded-2xl p-5 flex flex-col justify-between transition-all relative overflow-hidden group shadow-lg">
                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                <div>
                                  <div className="flex justify-between items-center">
                                    <div className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">出海先锋版</div>
                                    <span className="text-[9px] text-slate-500 font-mono">SINGLE STORE</span>
                                  </div>
                                  <div className="text-2xl font-black text-white mt-3">$99<span className="text-xs font-normal text-slate-400"> / 月 / 门店</span></div>
                                  <ul className="text-xs text-slate-400 mt-3 space-y-1.5 leading-relaxed">
                                    <li>• 支持中英文双 Agent 席位及看板协同</li>
                                    <li>• 零密码插件桥海外本地 IP 通道授权</li>
                                    <li>• 基础审计日志数据（保留7天）</li>
                                  </ul>
                                </div>
                                <button className="w-full mt-5 py-2 bg-slate-900 border border-slate-800 hover:border-indigo-500/40 text-white hover:text-indigo-300 rounded-xl text-xs font-black transition-all cursor-pointer">选择该方案</button>
                              </div>

                              {/* Tier 2 */}
                              <div className="bg-gradient-to-b from-[#0c0d1e] to-[#04050d] border border-indigo-500/40 rounded-2xl p-5 flex flex-col justify-between relative shadow-xl shadow-indigo-950/20 group">
                                <div className="absolute top-3 right-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider">RECOMMENDED</div>
                                <div>
                                  <div className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 inline-block">多店旗舰版</div>
                                  <div className="text-2xl font-black text-white mt-3">$499<span className="text-xs font-normal text-slate-400"> / 月 / 连锁</span></div>
                                  <ul className="text-xs text-slate-400 mt-3 space-y-1.5 leading-relaxed">
                                    <li>• 无限制海外门店与双语 Agent 席位绑定</li>
                                    <li>• 国内总部-店面两级 DAG 审核流物理拦截</li>
                                    <li>• 集中网关审计数据无限制高级报表导出</li>
                                  </ul>
                                </div>
                                <button className="w-full mt-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-500/20 transition-all cursor-pointer">选择该方案</button>
                              </div>
                            </div>
                          </div>

                          {/* Right: Dynamic ROI Calculator Dashboard (Grand/大气 Layout) */}
                          <div className="xl:col-span-7 bg-[#050814]/80 border border-slate-900 rounded-3xl p-8 flex flex-col justify-between shadow-2xl relative">
                            {/* Decorative background grid inside dashboard */}
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/0 rounded-3xl pointer-events-none" />

                            <div className="space-y-6 relative z-10">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  <Calculator className="w-4 h-4 text-indigo-400" />
                                  出海连锁门店 ROI 动态测算器 (USD)
                                </h4>
                                <span className="text-[9px] font-bold text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-900">US MARKET DATA</span>
                              </div>

                              {/* Slider 1: Store Count */}
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-slate-400">海外门店数量 (分店)</span>
                                  <span className="text-indigo-400 text-sm">{storeCount} 家门店</span>
                                </div>
                                <input
                                  type="range"
                                  min="1"
                                  max="50"
                                  value={storeCount}
                                  onChange={(e) => setStoreCount(Number(e.target.value))}
                                  className="w-full accent-indigo-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
                                />
                              </div>

                              {/* Slider 2: Average Social Media Manager Wage */}
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-slate-400">海外当地社交媒体经理月薪 (欧美薪酬)</span>
                                  <span className="text-indigo-400 text-sm">${avgWage} USD</span>
                                </div>
                                <input
                                  type="range"
                                  min="2000"
                                  max="10000"
                                  step="500"
                                  value={avgWage}
                                  onChange={(e) => setAvgWage(Number(e.target.value))}
                                  className="w-full accent-indigo-500 h-1.5 bg-slate-900 rounded-lg cursor-pointer"
                                />
                              </div>

                              {/* Calculations Output */}
                              <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-900 shadow-inner flex flex-col justify-between">
                                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">传统海外代运营年费</div>
                                  <div className="text-xl md:text-2xl font-black text-red-400 mt-1">${manualLaborCost.toLocaleString()}</div>
                                </div>
                                <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-900 shadow-inner flex flex-col justify-between">
                                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">AMC 协同运营年成本</div>
                                  <div className="text-xl md:text-2xl font-black text-emerald-400 mt-1">${amcTotalCost.toLocaleString()}</div>
                                </div>
                              </div>
                            </div>

                            {/* Annual Saved Total */}
                            <div className="mt-8 pt-5 border-t border-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 relative z-10">
                              <div>
                                <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">每年预计净节省运营开支</span>
                                <h3 className="text-2xl md:text-4.5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-indigo-400 to-purple-400 mt-1 leading-none">
                                  ${savedCost.toLocaleString()} USD/年
                                </h3>
                              </div>
                              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl p-3 text-center shrink-0 flex flex-col justify-center min-w-[130px]">
                                <div className="text-[9px] font-black uppercase tracking-wider">本地 Maps 搜索提升</div>
                                <div className="text-lg font-black mt-0.5">+{expectedTrafficIncreasePercent}%</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Footer Slider controls */}
                <div className="border-t border-slate-900 pt-6 mt-8 flex items-center justify-between">
                  <button
                    disabled={currentSlide === 0}
                    onClick={() => setCurrentSlide(prev => prev - 1)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-900 hover:border-slate-800 text-xs font-black text-slate-300 disabled:opacity-30 disabled:hover:border-slate-950 transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    上一章节
                  </button>
                  
                  {/* Pips */}
                  <div className="flex gap-2">
                    {slides.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSlide(idx)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          currentSlide === idx ? 'bg-indigo-500 w-8' : 'bg-slate-900 hover:bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    disabled={currentSlide === slides.length - 1}
                    onClick={() => setCurrentSlide(prev => prev + 1)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-xs font-black text-white rounded-xl disabled:opacity-30 transition-all cursor-pointer"
                  >
                    下一章节
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            // FAQ Database Mode (Grand Accordion list)
            <motion.div
              key="faq-mode"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="space-y-8 max-w-4xl mx-auto min-h-[calc(100vh-220px)]"
            >
              {/* Search & Category Header */}
              <div className="space-y-6">
                <div className="text-center space-y-3">
                  <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-3 py-1 rounded-full text-xs font-black">
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                    SUPPORT & FAQS
                  </div>
                  <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">常见问题与出海解决方案 (FAQ)</h1>
                  <p className="text-sm text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed">
                    查询关于跨国发布如何免遭安全风控、多语言 AI Agent 双语如何协同、API 网关日志追溯以及 Dify 工作流对接的硬核技术疑问
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative max-w-lg mx-auto">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="输入关键词，例如“风控”、“小红书”、“Dify”或“Yelp”..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-2xl text-xs text-slate-200 placeholder-slate-500 transition-all shadow-inner"
                  />
                </div>

                {/* Category Buttons */}
                <div className="flex justify-center gap-2 flex-wrap">
                  {[
                    { id: 'all', label: '全部问题' },
                    { id: 'security', label: '🔒 安全与跨国风控' },
                    { id: 'automation', label: '🤖 自愈与流转' },
                    { id: 'integrations', label: '🔌 接入与 Dify' },
                    { id: 'pricing', label: '💰 订阅与定价' }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedFaqCategory(cat.id as any)}
                      className={`text-[11px] font-black px-4 py-2 rounded-full border transition-all cursor-pointer ${
                        selectedFaqCategory === cat.id
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/10'
                          : 'bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* FAQ Accordion List */}
              <div className="space-y-4 pt-2">
                <AnimatePresence>
                  {filteredFaqs.length > 0 ? (
                    filteredFaqs.map((faq, idx) => {
                      const isExpanded = expandedFaqIndex === idx
                      return (
                        <motion.div
                          key={faq.question}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -15 }}
                          transition={{ duration: 0.25 }}
                          className="bg-slate-950/40 border border-slate-900 hover:border-slate-800 rounded-3xl overflow-hidden transition-all shadow-lg"
                        >
                          <button
                            onClick={() => setExpandedFaqIndex(isExpanded ? null : idx)}
                            className="w-full flex items-center justify-between p-5 text-left font-black text-xs md:text-sm text-slate-200 hover:text-white cursor-pointer"
                          >
                            <span className="flex items-center gap-3">
                              {faq.category === 'security' && <Lock className="w-4 h-4 text-indigo-400" />}
                              {faq.category === 'automation' && <Zap className="w-4 h-4 text-emerald-400" />}
                              {faq.category === 'integrations' && <BookOpen className="w-4 h-4 text-purple-400" />}
                              {faq.category === 'pricing' && <Calculator className="w-4 h-4 text-indigo-400" />}
                              {faq.question}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                          
                          {/* Expanded Answer */}
                          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                            isExpanded ? 'max-h-[300px] border-t border-slate-900 p-5 bg-slate-950/50' : 'max-h-0'
                          }`}>
                            <p className="text-xs md:text-sm text-slate-400 leading-relaxed font-medium">
                              {faq.answer}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })
                  ) : (
                    <div className="text-center py-16 text-slate-500 text-xs font-medium">
                      没有找到包含该关键词的常见问题解答。
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Section */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-10 text-center text-[10px] text-slate-600 relative z-10">
        <div className="max-w-7xl mx-auto px-4 space-y-3">
          <p>© 2026 AMC Command Center. All rights reserved. 出海中餐人机协同任务操作系统版权所有.</p>
          <div className="flex justify-center gap-4 text-slate-500 font-bold">
            <button onClick={() => { setActiveTab('deck'); setCurrentSlide(0) }} className="hover:text-slate-300 cursor-pointer">产品演示</button>
            <span>·</span>
            <button onClick={() => { setActiveTab('faq'); setSelectedFaqCategory('all') }} className="hover:text-slate-300 cursor-pointer">常见问题</button>
            <span>·</span>
            <a href="/board" className="hover:text-slate-300">返回协作看板</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
