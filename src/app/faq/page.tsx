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
  { id: 0, title: '出海愿景', subtitle: '出海中餐品牌人机协同自媒体与口碑系统 (Global Dining OS)' },
  { id: 1, title: '海外四大痛点', subtitle: '中餐品牌跨国运营的痛处与阻碍' },
  { id: 2, title: '核心技术柱石', subtitle: 'AMC Kanban 针对出海的五大硬核创新' },
  { id: 3, title: 'O2O餐饮闭环', subtitle: '海外到店口碑与自然客流拉新方案' },
  { id: 4, title: '竞品对比矩阵', subtitle: '为什么 AMC 是出海品牌的最佳搭档' },
  { id: 5, title: '定价与ROI估算', subtitle: '替代高昂海外代运营的投资回报率' }
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
  const [activeTab, setActiveTab] = useState<'deck' | 'faq'>('faq')
  const [currentSlide, setCurrentSlide] = useState(0)
  
  // Slide 2: Core Tech Hub State
  const [selectedTechHub, setSelectedTechHub] = useState(1)

  // Slide 3: Scenario State
  const [selectedScenario, setSelectedScenario] = useState(0)

  // Slide 5: ROI Calculator Input State - Pivoted for USD overseas operational wages
  const [storeCount, setStoreCount] = useState(10)
  const [avgWage, setAvgWage] = useState(4500) // Default $4500/month for US local social media managers

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

  // ROI Calculations in USD ($) - Pivoted to local US labor costs
  const manualLaborCost = storeCount * (avgWage * 0.4) * 12 // Assume 40% of local SMM employee wage spent on posting, translation, Yelp responding
  const amcTotalCost = (storeCount <= 3 ? 99 : 499) * 12 + (storeCount * 30 * 12) // SaaS Subscription + small manual auditing buffer
  const savedCost = Math.round(manualLaborCost - amcTotalCost)
  const expectedTrafficIncreasePercent = 22 // Average Google Maps Local Search SEO optimization boost
  const additionalVisits = storeCount * 180 * 12 // Average additional guest views from maps rank boost per year
  const conversionValue = Math.round(additionalVisits * 0.05 * 45) // 5% conversion rate to guest, average transaction value $45 USD

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
              <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-emerald-400 bg-emerald-500/10 rounded uppercase">FAQ & Deck</span>
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
                              出海中餐品牌自媒体与口碑合规系统
                            </div>
                            <h1 className="text-3xl md:text-5xl font-black leading-tight tracking-tight text-white text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-indigo-300">
                              国内总部把控，海外安全执行，中英文双线运营
                            </h1>
                            <p className="text-sm md:text-base text-slate-400 leading-relaxed">
                              打破出海餐饮自媒体运营痛点，AMC Kanban 将 AI 智能体设为“一等协作公民”。AI 跨语境生成本土文案，总部在线审核阻断，再通过海外门店本地 IP 安全通道分流发布，让中餐品牌在国际市场高效拓客。
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 pt-2">
                              <button
                                onClick={() => setCurrentSlide(1)}
                                className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-sm font-bold px-6 py-3 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all group"
                              >
                                了解出海四大痛点
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                              </button>
                              <button
                                onClick={() => setActiveTab('faq')}
                                className="flex items-center justify-center gap-2 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 text-slate-300 text-sm font-bold px-6 py-3 rounded-xl transition-all"
                              >
                                进入常见问题
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
                                  <Building2 className="w-8 h-8 text-indigo-400 mb-1" />
                                  <span className="text-[10px] font-bold text-indigo-300 tracking-wider">GLOBAL DINING</span>
                                </div>
                              </div>

                              {/* Orbiting Satellite 1 (China HQ) */}
                              <div className="absolute top-2 left-8 md:left-12 bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 z-20">
                                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                <span className="text-[10px] font-bold text-slate-300">国内总部 (管控审核)</span>
                              </div>

                              {/* Orbiting Satellite 2 (US Store Plugin) */}
                              <div className="absolute bottom-6 right-8 md:right-12 bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 z-20">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                <span className="text-[10px] font-bold text-slate-300">海外分店 (本地IP执行)</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slide 1: Market Pain Points */}
                      {currentSlide === 1 && (
                        <div className="space-y-8 py-2">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Card 1 */}
                            <div className="bg-[#0c0e20]/60 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-5 transition-all group relative overflow-hidden">
                              <div className="absolute -top-10 -right-10 w-24 h-24 bg-red-500/5 rounded-full blur-xl group-hover:bg-red-500/10 transition-all" />
                              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-400 mb-3 font-bold font-mono text-sm">
                                01
                              </div>
                              <h3 className="text-sm font-black text-white mb-1.5 flex items-center gap-1.5">
                                本地文案与文化断层
                              </h3>
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                国内团队缺乏海外本土语境，机翻感的英文很难触达老外。AMC 提供海外本土化创作智能体，自动生成本土潮流文案与 Hashtags。
                              </p>
                            </div>

                            {/* Card 2 */}
                            <div className="bg-[#0c0e20]/60 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-5 transition-all group relative overflow-hidden">
                              <div className="absolute -top-10 -right-10 w-24 h-24 bg-yellow-500/5 rounded-full blur-xl group-hover:bg-yellow-500/10 transition-all" />
                              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20 text-yellow-400 mb-3 font-bold font-mono text-sm">
                                02
                              </div>
                              <h3 className="text-sm font-black text-white mb-1.5 flex items-center gap-1.5">
                                本土代运营价格高昂
                              </h3>
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                聘请欧美本土自媒体代运营，单店月收高达 $3k-$5k，成本侵蚀严重。AI 自动操作能够替代 90% 基础工作，大幅削减支出。
                              </p>
                            </div>

                            {/* Card 3 */}
                            <div className="bg-[#0c0e20]/60 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-5 transition-all group relative overflow-hidden">
                              <div className="absolute -top-10 -right-10 w-24 h-24 bg-orange-500/5 rounded-full blur-xl group-hover:bg-orange-500/10 transition-all" />
                              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20 text-orange-400 mb-3 font-bold font-mono text-sm">
                                03
                              </div>
                              <h3 className="text-sm font-black text-white mb-1.5 flex items-center gap-1.5">
                                异地跨国登录风控封号
                              </h3>
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                频繁更换代理或通过国内 IP 跨国登录 Yelp / Meta 极其危险。插件桥在海外门店店员电脑执行，使用的是完全正规的当地 IP 绿色通道。
                              </p>
                            </div>

                            {/* Card 4 */}
                            <div className="bg-[#0c0e20]/60 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-5 transition-all group relative overflow-hidden">
                              <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-all" />
                              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400 mb-3 font-bold font-mono text-sm">
                                04
                              </div>
                              <h3 className="text-sm font-black text-white mb-1.5 flex items-center gap-1.5">
                                中英文自媒体割裂
                              </h3>
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                既要服务当地老外群体（IG/Yelp），又要服务华人同胞（小红书/微信）。双语 Agent 看板并轨，将国内和海外运营合并在同一体系下。
                              </p>
                            </div>
                          </div>
                          
                          <div className="bg-indigo-950/30 border border-indigo-900/40 rounded-xl p-4 flex items-center gap-3">
                            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
                            <span className="text-xs text-indigo-300">
                              <strong>针对海外市场的破局方案</strong>：无需收集密码，用“国内总部集中管控 + 海外门店本地执行 + AI 双语 Agent 协同”打通闭环。
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
                              { id: 1, label: '🤖 中英文双语 Agent 体系' },
                              { id: 2, label: '🔌 跨国防封“本地插件桥”' },
                              { id: 3, label: '🔒 总部管控 DAG 审批拦截' },
                              { id: 4, label: '💬 评论日志挂起与 Resume' },
                              { id: 5, label: '🪵 集中网关负载审计记录' }
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

                          {/* Right Content Pane */}
                          <div className="flex-1 bg-[#0c0e20]/80 border border-slate-800 rounded-2xl p-6 min-h-[300px] flex flex-col justify-between">
                            <div className="space-y-4">
                              {selectedTechHub === 1 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                    <Bot className="w-4 h-4" /> AI 智能体专属 Profile 与多角色分配
                                  </div>
                                  <h3 className="text-lg font-black text-white">中英文自媒体并行作战，各司其职</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    系统为每项任务定义清晰的 assignee。您可以将小红书发帖分配给“中文华人运营智能体”，将 Instagram 和 Yelp 分配给“英文本地化智能体”，API Key 和底层提示词物理隔离。
                                  </p>
                                  <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 font-mono text-[10px] text-indigo-300">
                                    <span className="text-slate-500">// 多 Agent 独立鉴权隔离</span><br />
                                    POST /api/tasks/create (assignee: RED_chinese_agent_key)<br />
                                    POST /api/tasks/create (assignee: IG_english_agent_key)
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 2 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                    <Globe className="w-4 h-4" /> 网页指令穿透·防平台异地检测
                                  </div>
                                  <h3 className="text-lg font-black text-white">店面本地活跃 Session 注入执行，100% 防风控</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    抛弃传统高风险的云端代理 IP 翻墙登录。AMC 仅向下游推送操作逻辑指令，发帖直接在纽约、伦敦、新加坡门店现成的活跃浏览器中模拟点击发布，确保绿通道执行。
                                  </p>
                                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-2 rounded-lg text-[10px]">
                                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                                    <span>总部不接触明文密码，店面直接从当地 PC 执行发帖与 Yelp/Google 回复。</span>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 3 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                    <Lock className="w-4 h-4" /> DAG 跨国协作栅栏
                                  </div>
                                  <h3 className="text-lg font-black text-white">中国总部掌握终审权，防止 AI 越权抢跑</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    配置“国内中文大纲审核 Done”作为海外 AI 发帖的前置 Blocker。在前置条件被国内主编解锁前，网关级拦截任何外部发帖 Agent 的 API Key 触发请求，锁死安全边界。
                                  </p>
                                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-[10px]">
                                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>网关拦截报错：`400 Bad Request: Blocker "HQ_content_approval" is not done`。</span>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 4 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                    <MessageSquare className="w-4 h-4" /> 评论自愈与断点 Resume
                                  </div>
                                  <h3 className="text-lg font-black text-white">AI 挂起 pending，人类在评论区一键回复指导</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    英文 Agent 遇到敏感词汇或当地文化梗歧义时，会自动将任务置为 pending。国内团队可在 Markdown 评论区进行文字修正，点击 Resume 即可在原发布处继续，避免从头重跑。
                                  </p>
                                  <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/60 flex items-start gap-3">
                                    <div className="w-7 h-7 rounded bg-indigo-500/15 flex items-center justify-center text-[10px] font-bold text-indigo-400">HQ</div>
                                    <div className="flex-1 space-y-1">
                                      <div className="text-[10px] text-slate-400 font-bold">国内总部主编 14:05</div>
                                      <p className="text-[10px] text-slate-200">修改俚语“awesome spicy”为“absolutely authentic tongue-numbing Sichuan heat”，批准 Resume。</p>
                                    </div>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 5 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                    <Sliders className="w-4 h-4" /> 集中式 API 审计记录
                                  </div>
                                  <h3 className="text-lg font-black text-white">Agent 行为透明记录，方便大客户多店合规审计</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    看板网关拦截并保存所有下发到海外店面插件的参数和接收到的返回值。当发生平台接口改动或偶发延迟时，Admin 可在系统日志中一键过滤，极大地方便了跨境调试。
                                  </p>
                                  <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg flex items-center gap-2 justify-between text-[10px]">
                                    <span className="text-slate-400">店面插件审计：</span>
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[9px]">EXTENSION_CMD_RECV</span>
                                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono text-[9px]">EXTENSION_REGISTER</span>
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
                              { id: 0, label: '🛑 差评内部私下拦截' },
                              { id: 1, label: '🚀 Yelp/Google Maps 本地 SEO 爆破' },
                              { id: 2, label: '👥 熟人聚餐拉新核销' },
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
                                  <h3 className="text-lg font-black text-white">吐槽通道私下平息，保障 Yelp / Google Maps 评分</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    海外食客扫桌贴吐槽直接向系统反馈意见。系统自动拦截，飞书/Lark 警报海外店长现场介入，并派发“致歉无门槛券”，将差评拦截在 Yelp 等公网平台之前。
                                  </p>
                                  <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                                    <li>扫码直通吐槽建议 H5，避免差评暴露给公网当地客群</li>
                                    <li>海外店长 Lark 5分钟报警机制，以便在结账前现场平息负面情绪</li>
                                    <li>自动发放致歉补偿券，大幅度降低一星差评的流出</li>
                                  </ul>
                                </>
                              )}

                              {selectedScenario === 1 && (
                                <>
                                  <h3 className="text-lg font-black text-white">Yelp/Google 回复响应时效 24/7 提升本地排名</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    评价回复时效在 Yelp 和 Google SEO 算法中占有极高权重。5星好评2分钟内秒回以向平台示好；低星差评5分钟内快速安抚并附带补偿发券链接。
                                  </p>
                                  <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                                    <li>秒级回复好评直接拉高 Maps 榜单自然排名（如 Hotpot near me 检索）</li>
                                    <li>差评智能模板匹配本土礼貌用语，展示优良品牌口碑形象</li>
                                    <li>全自动托管，无需店员耗费精力跨时区人工值守</li>
                                  </ul>
                                </>
                              )}

                              {selectedScenario === 2 && (
                                <>
                                  <h3 className="text-lg font-black text-white">熟人社交聚餐解锁，以新带新实现裂变</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    扫码检测本桌同扫人数，达到设定阈值（如3人同扫）自动解锁全桌赠送招牌中餐菜品，用户抽中后派发“必须带好友共同核销”的联合副券。
                                  </p>
                                  <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                                    <li>多人同行大额福利，促使海外主流客群在朋友圈社交裂变</li>
                                    <li>裂变带人副券模式强效锁客，实现二次同行客单价提升</li>
                                    <li>系统大盘自动汇总统计裂变卡券激发的新客转化数据</li>
                                  </ul>
                                </>
                              )}

                              {selectedScenario === 3 && (
                                <>
                                  <h3 className="text-lg font-black text-white">工作日低谷闲时调价，防止周末利润稀释</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                                    周一至周四下午波谷时段（14:00-17:30）动态派发定向闲时消费券，提高非繁忙时段桌效，黄金周末高峰期则自动锁定折扣。
                                  </p>
                                  <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                                    <li>精准消耗闲时餐厅后厨和堂食运力，平滑客流曲线</li>
                                    <li>锁定黄金时段卡券核销，保护主力营业额与毛利率</li>
                                    <li>AI 根据大盘数据自动分析周内波谷段，动态调整投放面额</li>
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
                                      <div className="text-xs font-bold text-slate-200">Yelp Blocker Active</div>
                                      <div className="text-[10px] text-red-400 italic">"The soup base wasn't spicy enough!"</div>
                                      <div className="text-[9px] bg-emerald-500/15 text-emerald-400 py-1.5 px-3 rounded-lg border border-emerald-500/20 inline-block">
                                        Private Voucher Issued: $15 OFF
                                      </div>
                                    </>
                                  )}
                                  {selectedScenario === 1 && (
                                    <>
                                      <div className="text-xs font-bold text-slate-200">Google Local SEO Boost</div>
                                      <div className="text-[9px] text-slate-400">Rating: ⭐⭐⭐⭐⭐ (5 Stars)</div>
                                      <div className="text-[9px] bg-slate-900 border border-slate-800 p-2 rounded text-left text-slate-300 max-h-16 overflow-y-auto">
                                        AI: "Thanks for loving our hotpot! Your response was replied in 2 mins."
                                      </div>
                                    </>
                                  )}
                                  {selectedScenario === 2 && (
                                    <>
                                      <div className="text-xs font-bold text-slate-200">Group Dining Progress</div>
                                      <div className="flex justify-center gap-2 py-1">
                                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[9px]">UserA</div>
                                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[9px]">UserB</div>
                                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[9px]">UserC</div>
                                      </div>
                                      <div className="text-[9px] text-emerald-400">🎉 3 scans detected! Free Appetizer Unlocked.</div>
                                    </>
                                  )}
                                  {selectedScenario === 3 && (
                                    <>
                                      <div className="text-xs font-bold text-slate-200">Off-Peak Yield Management</div>
                                      <div className="text-[9px] text-slate-400">Hours: Mon-Thu 2:00-5:30 PM</div>
                                      <div className="text-[10px] font-bold text-indigo-400 animate-pulse">
                                        ⏳ Active: 15% OFF Off-Peak slots only
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
                                <th className="py-3 px-4 text-indigo-400 bg-indigo-950/20 font-bold border-x border-slate-800/50">AMC Kanban (出海版)</th>
                                <th className="py-3 px-4">传统 RPA (如 UiPath)</th>
                                <th className="py-3 px-4">海外本土代运营 (Agency)</th>
                                <th className="py-3 px-4">通用看板 (Jira/Linear)</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b border-slate-850 hover:bg-slate-900/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-100">运营资金成本</td>
                                <td className="py-3.5 px-4 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-800/50">✅ 极低 (仅SaaS订阅与流量)</td>
                                <td className="py-3.5 px-4 text-yellow-500">⚠️ 中等 (需要脚本维护开销)</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 极高 (单店月均 $3000-$5000)</td>
                                <td className="py-3.5 px-4 text-emerald-400">✅ 极低</td>
                              </tr>
                              <tr className="border-b border-slate-850 hover:bg-slate-900/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-100">跨国风控防护</td>
                                <td className="py-3.5 px-4 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-800/50">✅ 极佳 (海外门店本地 IP 通道)</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 极差 (代理 IP 登录极易封号)</td>
                                <td className="py-3.5 px-4 text-emerald-400">✅ 优秀 (本地人操作)</td>
                                <td className="py-3.5 px-4 text-slate-400">不涉及自动化</td>
                              </tr>
                              <tr className="border-b border-slate-850 hover:bg-slate-900/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-100">双语多平台兼顾</td>
                                <td className="py-3.5 px-4 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-800/50">✅ 完美 (中英文 Agent 联合作战)</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 困难 (中外接口割裂需多次配置)</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 极差 (海外老外不懂小红书/微信)</td>
                                <td className="py-3.5 px-4 text-slate-400">需完全人工处理</td>
                              </tr>
                              <tr className="border-b border-slate-850 hover:bg-slate-900/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-100">总部管控与合规</td>
                                <td className="py-3.5 px-4 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-800/50">✅ DAG 物理拦截 (总部审核解锁)</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 无中途审批，AI 易跑飞</td>
                                <td className="py-3.5 px-4 text-yellow-500">⚠️ 跨时区沟通慢，反馈周期长</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 依靠人类自觉对齐</td>
                              </tr>
                              <tr className="border-b border-slate-850 hover:bg-slate-900/20 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-100">架构灵活性</td>
                                <td className="py-3.5 px-4 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-800/50">✅ Dify-First (热换模型/调优文案)</td>
                                <td className="py-3.5 px-4 text-red-500">❌ 极低 (修改流程需重写代码)</td>
                                <td className="py-3.5 px-4 text-slate-400">无底层技术柔性</td>
                                <td className="py-3.5 px-4 text-slate-400">无 AI 编排</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Slide 5: ROI Calculator & SaaS Pricing */}
                      {currentSlide === 5 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch py-2">
                          {/* Left: SaaS Tier cards in USD */}
                          <div className="space-y-4 flex flex-col justify-center">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">SaaS 订阅与流量套餐 (USD)</h4>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Tier 1 */}
                              <div className="bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 rounded-xl p-4 flex flex-col justify-between transition-all">
                                <div>
                                  <div className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded inline-block">出海先锋版</div>
                                  <div className="text-lg font-black text-white mt-2">$99<span className="text-xs font-normal text-slate-400">/月/店</span></div>
                                  <ul className="text-[10px] text-slate-400 mt-2 space-y-1">
                                    <li>• 基础看板，中英文双 Agent 席位</li>
                                    <li>• 零密码插件桥海外本地授权</li>
                                    <li>• 历史操作审计日志保留 7 天</li>
                                  </ul>
                                </div>
                                <button className="w-full mt-4 py-1.5 bg-slate-800 hover:bg-indigo-600 text-white rounded-lg text-[10px] font-bold transition-all">选择先锋版</button>
                              </div>

                              {/* Tier 2 */}
                              <div className="bg-gradient-to-b from-[#11132f] to-[#0c0e20] border border-indigo-500/30 rounded-xl p-4 flex flex-col justify-between relative shadow-lg">
                                <div className="absolute top-2 right-2 bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider">PRO</div>
                                <div>
                                  <div className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded inline-block">多店旗舰版</div>
                                  <div className="text-lg font-black text-white mt-2">$499<span className="text-xs font-normal text-slate-400">/月/连锁</span></div>
                                  <ul className="text-[10px] text-slate-400 mt-2 space-y-1">
                                    <li>• 无限制门店大盘与双语 Agent 席位</li>
                                    <li>• 总部-海外门店两级 DAG 审批拦截流</li>
                                    <li>• 跨国操作日志高级审计导出</li>
                                  </ul>
                                </div>
                                <button className="w-full mt-4 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-lg text-[10px] font-bold shadow transition-all">选择旗舰版</button>
                              </div>
                            </div>
                          </div>

                          {/* Right: Interactive ROI Calculator in USD */}
                          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                            <div className="space-y-4">
                              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Calculator className="w-4 h-4 text-emerald-500" />
                                出海连锁门店 ROI 动态测算器 (USD)
                              </h4>

                              {/* Slider 1: Store Count */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-slate-400">海外门店数量</span>
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

                              {/* Slider 2: Average Social Media Manager Wage in Local Market */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-slate-400">海外当地社交媒体经理月薪 (美欧水平)</span>
                                  <span className="text-indigo-400">${avgWage} USD</span>
                                </div>
                                <input
                                  type="range"
                                  min="2000"
                                  max="10000"
                                  step="500"
                                  value={avgWage}
                                  onChange={(e) => setAvgWage(Number(e.target.value))}
                                  className="w-full accent-indigo-500"
                                />
                              </div>

                              {/* Calculations Output */}
                              <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                                  <div className="text-[9px] text-slate-400 font-bold">传统海外代运营年费</div>
                                  <div className="text-sm font-black text-red-400 mt-0.5">${manualLaborCost.toLocaleString()}</div>
                                </div>
                                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                                  <div className="text-[9px] text-slate-400 font-bold">AMC 协同运营年成本</div>
                                  <div className="text-sm font-black text-emerald-400 mt-0.5">${amcTotalCost.toLocaleString()}</div>
                                </div>
                              </div>
                            </div>

                            {/* Annual Saved Total */}
                            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                              <div>
                                <span className="text-[9px] text-slate-500 font-bold">每年预计净节省运营开支</span>
                                <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400">
                                  ${savedCost.toLocaleString()} USD/年
                                </h3>
                              </div>
                              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg px-2.5 py-1 text-center shrink-0">
                                <div className="text-[8px] font-bold">本地 Maps 搜索提升</div>
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
                  <h1 className="text-2xl md:text-3xl font-black text-white">常见问题与出海解决方案 (FAQ)</h1>
                  <p className="text-xs md:text-sm text-slate-400">查询关于跨国网络风控防封、本地凭证托管、多语言协作和 Dify 对接的疑问</p>
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
                    { id: 'security', label: '🔒 安全与跨国风控' },
                    { id: 'automation', label: '🤖 自愈与流转' },
                    { id: 'integrations', label: '🔌 接入与 Dify' },
                    { id: 'pricing', label: '💰 订阅与定价' }
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
                          
                          {/* Expanded Answer */}
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
          <div className="flex justify-center gap-4 text-slate-555">
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
