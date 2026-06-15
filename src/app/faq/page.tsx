'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot,
  MessageSquare,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Calculator,
  HelpCircle,
  Search,
  Sparkles,
  Lock,
  Sliders,
  Globe,
  ChevronDown,
  ChevronUp,
  Award,
  Zap,
  BookOpen,
  UtensilsCrossed
} from 'lucide-react'

// Slide data types
interface Slide {
  id: number
  title: string
  subtitle: string
  tag: string
}

const slides: Slide[] = [
  { id: 0, title: '门店自媒体 · 智能破局', subtitle: '餐饮与零售本地门店专属的人机协同自媒体大脑', tag: '产品愿景' },
  { id: 1, title: '自媒体运营四大痛点', subtitle: '中小商家自媒体运营与品牌推广的现实阻碍', tag: '痛点剖析' },
  { id: 2, title: '主理人与 AI 协同保障', subtitle: 'AI 24小时工作 + 品牌主理人专业配合，保质降本', tag: '功能柱石' },
  { id: 3, title: '线下门店口碑客流闭环', subtitle: '顾客吐槽私下拦截，美团与大众点评曝光爆破引流', tag: '应用场景' },
  { id: 4, title: '竞品对比与选择', subtitle: 'AMC 对标传统软件与本地代运营的划时代优势', tag: '竞品对比' },
  { id: 5, title: '定价与 ROI 算账', subtitle: '用极低的技术红利，省去昂贵的本地自媒体运营成本', tag: '精准算账' }
]

// FAQ data types
interface FaqItem {
  question: string
  answer: string
  category: 'security' | 'automation' | 'integrations' | 'pricing'
}

type FaqCategory = 'all' | 'security' | 'automation' | 'integrations' | 'pricing'

const faqData: FaqItem[] = [
  {
    category: 'security',
    question: '我是餐饮/零售门店的老板，我们团队精力有限，怎么把控 AI 自动生成的自媒体文案？',
    answer: '您完全不需要担心。AMC 拥有“主理人终审锁”机制。AI 助手根据您的产品和本地热门话题写好发帖草稿后，任务会挂起并以看板卡片的形式呈现。品牌主理人或店长觉得没问题，点一下“审核通过”一键解锁，系统才会安全模拟把帖子发出去。AI 24小时不知疲倦地工作，配合主理人的专业把关审核，完美保障品牌调性，绝对不会擅自做主乱说话。'
  },
  {
    category: 'security',
    question: '把我们的小红书、抖音、美团和大众点评的密码交给系统，安全吗？',
    answer: '零风险，因为 AMC 采用“零密码托管”架构。我们的系统服务器和看板绝对不收集、不存储您的任何平台密码或 Cookie。店员只需要在门店收银电脑或前台浏览器的插件上安全模拟打字和发布。密码始终只留在您店里的那台电脑上，哪怕系统遭遇外部网络攻击，您的账号密码也绝对安全，无凭证丢失风险。'
  },
  {
    category: 'automation',
    question: '自媒体运营频繁登录发布内容容易被判定为风控或代理封号，AMC 怎么解决？',
    answer: '各大社交媒体的风控系统极易检测异地 IP 变动，一旦频繁使用云端服务器异地登录，账号很快就会面临限流或封禁。AMC 采用本地插件桥技术，发帖动作并不是在云端发出，而是在您门店的本地电脑上。由于直接使用门店本地的真实网络 IP 和设备，对平台来说这就是 100% 的真人本地自然操作，彻底免除风控和账号受限隐患。'
  },
  {
    category: 'automation',
    question: '店里每天忙得不可开交，店员根本没时间运营自媒体，我们需要额外招人操作吗？',
    answer: '不需要。AMC 插件桥不需要门店店员花任何精力去维护。店员唯一要做的事就是早上开机时，将前台电脑的浏览器打开并登录好平台账号，然后页面保持后台挂着即可。主理人或 AI 生成的所有指令，都会在不占用店员时间的情况下，由插件在网页后台全自动模拟发布，不占用店员一秒钟。'
  },
  {
    category: 'integrations',
    question: '我们有多家门店连锁，主理人可以统一查看并审批所有分店的自媒体任务吗？',
    answer: '这正是 AMC 的优势。我们提供强大的“主理人-分店两级管理系统”。主理人可以在统一的看板大盘上查看 1 号店、2 号店、3 号店的所有待审核自媒体草稿与差评拦截情况。通过看板的一键审核放行，各门店的电脑便会各自响应发布，真正实现“集中管控，高效配合”。'
  },
  {
    category: 'pricing',
    question: 'AMC 这个系统真的能帮我的门店带来新客人和提升排名吗？',
    answer: '能。主要有两个抓手：第一，评价公平与排名优化，美团与大众点评等本地生活平台的搜索排名规则非常看重“回复评价的时效性”。AI 助手 24 小时工作极速秒回好评，能让您的店铺在本地周边搜索（如“火锅”、“咖啡厅”）时排在搜索结果前列，获取海量曝光；第二，吐槽通道会及时拦截差评送券安抚，避免一星差评上榜大众点评或美团等公开平台影响评分，彻底解决中小商家缺乏品牌和自媒体运营的痛点。'
  }
]

export default function PitchDeckPage() {
  const [activeTab, setActiveTab] = useState<'deck' | 'faq'>('faq')
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
  const [selectedFaqCategory, setSelectedFaqCategory] = useState<FaqCategory>('all')
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
  const manualLaborCost = storeCount * avgWage * 12
  const amcTotalCost = (storeCount === 1 ? 699 : 2999) * 12
  const savedCost = Math.round(manualLaborCost - amcTotalCost)
  const expectedTrafficIncreasePercent = 22

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
              <span className="font-black text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-indigo-300">AI MARKETING CREW</span>
              <span className="ml-2.5 px-2 py-0.5 text-[8px] font-black tracking-widest text-indigo-400 bg-indigo-500/10 rounded-full border border-indigo-500/20 uppercase">LOCAL BUSINESS</span>
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
              产品演示 (PITCH DECK)
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
                  <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-4">演示章节</h4>
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
                  AMC_OS_PITCH_DECK_V2.2 // CONFIDENTIAL
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
                      {/* Slide 0: Product Vision */}
                      {currentSlide === 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                          <div className="lg:col-span-7 space-y-6">
                            <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-3.5 py-1.5 rounded-full text-xs font-black">
                              <Sparkles className="w-4 h-4 text-indigo-400" />
                              本地餐饮与零售店品牌推广与自媒体口碑大脑
                            </div>
                            <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tight text-white">
                              主理人专业审核配合<br />
                              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400">AI 24小时不知疲倦模拟发帖</span>
                            </h1>
                            <p className="text-base text-slate-300 leading-relaxed font-medium">
                              我们不跟主理人讲复杂的 AI 算法，我们致力于解决本地商家最核心的痛点：通过 **AI 24小时自动工作** 与 **品牌主理人的专业把关配合**，提供**成本低、完全自动化、评价公平且功能强大**的自媒体运营与品牌推广，通过 AI 保证服务质量，降低运营成本，彻底解决中小商家缺乏品牌和自媒体运营的痛点。
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 pt-4">
                              <button
                                onClick={() => setCurrentSlide(1)}
                                className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-sm font-black px-8 py-4 rounded-2xl shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/35 transition-all group cursor-pointer"
                              >
                                了解门店品牌自媒体四大痛点
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                              </button>
                              <button
                                onClick={() => setActiveTab('faq')}
                                className="flex items-center justify-center gap-2 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 text-slate-300 text-sm font-black px-8 py-4 rounded-2xl transition-all cursor-pointer"
                              >
                                进入主理人 FAQ
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
                                  <div className="text-[8px] text-slate-500 font-bold">品牌主理人</div>
                                  <div className="text-[10px] font-black text-indigo-400 mt-0.5">一键把关审批</div>
                                </div>
                                <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-center flex-1">
                                  <div className="text-[8px] text-slate-500 font-bold">AI 虚拟员工</div>
                                  <div className="text-[10px] font-black text-emerald-400 mt-0.5">24小时模拟工作</div>
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
                                <span className="text-xs font-mono font-black text-red-500 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md">痛点 01</span>
                                <h3 className="text-base font-black text-white mt-4">自媒体招人贵，外包质量差</h3>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed font-medium mt-2">
                                招专业社交自媒体经理每月人力成本高，而传统外包代运营公司收费昂贵却不了解门店的产品和特色，内容千篇一律，效果极差。
                              </p>
                            </div>

                            {/* Card 2 */}
                            <div className="bg-slate-950/40 border border-slate-900 hover:border-indigo-500/35 rounded-3xl p-6 transition-all group relative overflow-hidden shadow-lg hover:shadow-indigo-950/10 flex flex-col justify-between min-h-[220px]">
                              <div className="absolute -top-12 -right-12 w-28 h-28 bg-yellow-500/5 rounded-full blur-xl group-hover:bg-yellow-500/10 transition-all" />
                              <div>
                                <span className="text-xs font-mono font-black text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-md">痛点 02</span>
                                <h3 className="text-base font-black text-white mt-4">精力极其有限，无法坚持发帖</h3>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed font-medium mt-2">
                                门店日常经营极其忙碌，主理人和店员无法每天拍摄、想文案并在各大平台分发，导致门店自媒体账号荒废，白白流失本地自然曝光客流。
                              </p>
                            </div>

                            {/* Card 3 */}
                            <div className="bg-slate-950/40 border border-slate-900 hover:border-indigo-500/35 rounded-3xl p-6 transition-all group relative overflow-hidden shadow-lg hover:shadow-indigo-950/10 flex flex-col justify-between min-h-[220px]">
                              <div className="absolute -top-12 -right-12 w-28 h-28 bg-orange-500/5 rounded-full blur-xl group-hover:bg-orange-500/10 transition-all" />
                              <div>
                                <span className="text-xs font-mono font-black text-orange-500 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-md">痛点 03</span>
                                <h3 className="text-base font-black text-white mt-4">账号密码托付给第三方不安全</h3>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed font-medium mt-2">
                                传统工具需要主理人把小红书、抖音、美团或大众点评的明文密码交给员工或服务商。一旦发生信息泄露，安全风险极高。
                              </p>
                            </div>

                            {/* Card 4 */}
                            <div className="bg-slate-950/40 border border-slate-900 hover:border-indigo-500/35 rounded-3xl p-6 transition-all group relative overflow-hidden shadow-lg hover:shadow-indigo-950/10 flex flex-col justify-between min-h-[220px]">
                              <div className="absolute -top-12 -right-12 w-28 h-28 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-all" />
                              <div>
                                <span className="text-xs font-mono font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">痛点 04</span>
                                <h3 className="text-base font-black text-white mt-4">AI 幻觉乱写，主理人无法把关</h3>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed font-medium mt-2">
                                担心纯自动化的 AI 工具出现“幻觉”写错价格、优惠或发布不合品牌调性的内容。没有人工终审门禁，主理人绝对不敢直接让 AI 全自动发帖。
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slide 2: Core Technical Pillars (Boss Explanations) */}
                      {currentSlide === 2 && (
                        <div className="flex flex-col lg:flex-row gap-8 py-2 items-stretch">
                          {/* Sidebar selector */}
                          <div className="lg:w-72 flex flex-col gap-2 shrink-0">
                            {[
                              { id: 1, label: '🤖 AI 虚拟员工 (24小时不知疲倦)', icon: Bot },
                              { id: 2, label: '🔌 免密码防风控“本地发帖通道”', icon: Globe },
                              { id: 3, label: '🔒 主理人专业把关“终审锁”', icon: Lock },
                              { id: 4, label: '💬 人机协同与一键快捷微调', icon: MessageSquare },
                              { id: 5, label: '🪵 财务级明明白白的操作审计', icon: Sliders }
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
                                    <Bot className="w-4 h-4" /> AI 虚拟员工卡片
                                  </div>
                                  <h3 className="text-xl font-black text-white">自媒体日常排期，各领任务各干活</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    AI 在系统中有独立的虚拟头像和工号。主理人可以像指派真实店员一样，分派“小红书推广员”撰写图文探店文案，“抖音引流员”撰写短视频发布脚本。AI 不知疲倦地完成起草工作，极大地解放人力。
                                  </p>
                                  <div className="bg-slate-950/90 border border-slate-900 rounded-xl p-4 font-mono text-[10px] text-indigo-300/90 shadow-inner">
                                    <span className="text-slate-500">{'// 在看板上像指派店员一样分配 AI 的工作'}</span><br />
                                    图文平台分配给：<span className="text-emerald-400">小红书写作员Agent</span><br />
                                    视频平台分配给：<span className="text-purple-400">抖音脚本助手Agent</span>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 2 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                                    <Globe className="w-4 h-4" /> 零密码本地模拟通道
                                  </div>
                                  <h3 className="text-xl font-black text-white">使用门店本地网络直接模拟，服务器免存密码</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    彻底摆脱高风险账号被封隐患。AI 编写的发帖指令安全发给门店本地的前台浏览器插件，模拟真人安全发布。因为使用的是门店本地的真实 IP 和设备登录，对社交平台来说是 100% 的自然操作。
                                  </p>
                                  <div className="bg-slate-950/90 border border-slate-900 p-4 rounded-xl flex items-center justify-between text-[10px] font-mono">
                                    <span className="text-slate-500">安全执行状态:</span>
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px]">指令安全下发至门店 PC</span>
                                    <span className="text-slate-500">IP: 门店本地真实 IP</span>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 3 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                                    <Lock className="w-4 h-4" /> 总部终审锁
                                  </div>
                                  <h3 className="text-xl font-black text-white">主理人/店长没有点击确认，AI 绝对无法发帖</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    AI 自动配好图、写好英文大纲草稿后，发布权限会被系统物理锁死。必须等总部人工审核、翻译确认点下“通过”解锁，后台才会向门店下发指令，彻底规避 AI “胡说八道”的业务风险。
                                  </p>
                                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-xl text-[10px] font-bold">
                                    <XCircle className="w-4 h-4 shrink-0" />
                                    <span>安全门禁锁定：主理人未审核通过，AI 自动发布指令已被拦截锁定。</span>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 4 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                                    <MessageSquare className="w-4 h-4" /> 人机协同与一键 Resume
                                  </div>
                                  <h3 className="text-xl font-black text-white">AI 拿不准时自动暂停，主理人评论区里打字微调</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    AI 在遇到特定用语或活动优惠有疑惑时，会自动将任务挂起并通知主理人。主理人可以直接在看板卡片的评论区对文案微调改写，点击一键“Resume”，系统就会顺着刚才的记录继续运行，免去重新发起的麻烦。
                                  </p>
                                  <div className="border border-slate-900 rounded-xl p-3 bg-slate-950/80 flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-[10px] font-mono font-black text-indigo-400 shrink-0">主理人</div>
                                    <div className="flex-1 space-y-1">
                                      <div className="text-[10px] text-slate-500 font-bold">品牌主理人 15:40</div>
                                      <p className="text-[10px] text-slate-200 leading-relaxed font-normal">“这段产品文案描述稍微调整了优惠折扣，已在卡片中直接修改，请一键 Resume 自动同步发布。”</p>
                                    </div>
                                  </div>
                                </>
                              )}

                              {selectedTechHub === 5 && (
                                <>
                                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                                    <Sliders className="w-4 h-4" /> 操作账单流水
                                  </div>
                                  <h3 className="text-xl font-black text-white">谁在什么时间发了什么，每一笔流水都有据可查</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    系统会像餐厅收银的财务流水一样，完整记录 AI 领取的每一个任务、发出的每一条社媒帖子、以及回复的每一条评价的原始数据，确保运营责任清晰，绝无烂账。
                                  </p>
                                  <div className="flex justify-between items-center bg-slate-950/90 border border-slate-900 p-3.5 rounded-xl text-[9px] font-mono">
                                    <span className="text-slate-500">财务级日志审计:</span>
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">发帖成功记录</span>
                                    <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">平台故障记录</span>
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="text-[10px] text-slate-500 text-right mt-6 pt-3 border-t border-slate-900/60">
                              点击左侧功能框，切换查看主理人白话功能拆解
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slide 3: O2O Living Services Closed Loop */}
                      {currentSlide === 3 && (
                        <div className="space-y-6 py-2">
                          <div className="flex bg-slate-950 border border-slate-900 rounded-2xl p-1 w-full overflow-x-auto hide-scrollbar">
                            {[
                              { id: 0, label: '🛑 差评内部私下拦截' },
                              { id: 1, label: '🚀 美团/大众点评 本地排名爆破' },
                              { id: 2, label: '👥 聚餐社交裂变引流' },
                              { id: 3, label: '⏳ 闲时动态卡券引流' }
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
                                  <h3 className="text-xl font-black text-white">吐槽直通主理人微信，把差评消灭在店里</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    食客就餐时如果觉得味道不妥（如牛腩太柴、菜上慢了），引导其直接扫码桌上“意见吐槽直达主理人”通道，系统会极速发消息警告店长，并自动赠送致歉代金券安抚。
                                  </p>
                                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl flex items-start gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping mt-1 shrink-0" />
                                    <span className="text-xs text-slate-400">
                                      <strong>拦截一星公开差评</strong>：在到店体验阶段直接私下平息纠纷，能够有效拦截 85% 以上流向大众点评/美团等平台的公开一星差评，保住评分。
                                    </span>
                                  </div>
                                </>
                              )}

                              {selectedScenario === 1 && (
                                <>
                                  <h3 className="text-xl font-black text-white">好评2分钟极速秒回，本地商家搜索排名抢占前列</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    美团与大众点评等本地生活平台的搜索排名规则非常看重“回复评价的时效性”。AI 助手 24 小时工作极速秒回好评，能让您的店铺在本地周边搜索（如“火锅”、“咖啡厅”）时排在搜索结果前列，获取海量曝光。
                                  </p>
                                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl flex items-start gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse mt-1 shrink-0" />
                                    <span className="text-xs text-slate-400">
                                      <strong>自然搜索红利</strong>：排在周边搜索前列的黄金席位所带来的主动到店流量，平均可让单店客流增长 22% 以上。
                                    </span>
                                  </div>
                                </>
                              )}

                              {selectedScenario === 2 && (
                                <>
                                  <h3 className="text-xl font-black text-white">聚餐社交熟人拉新，必须带好友进店核销</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    本地餐饮和零售的就餐社交属性极强。扫码识别到同桌有多人（如3人以上）共同扫码，自动解锁并赠送招牌菜。新客抽中奖品后，生成必须“双人同行”或“分享第二人激活”的联名券。
                                  </p>
                                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl flex items-start gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse mt-1 shrink-0" />
                                    <span className="text-xs text-slate-400">
                                      <strong>老客带新客</strong>：利用聚餐熟人关系发券裂变，不需要高额的广告投放，让每位来店的顾客都成为您的拉新推销员。
                                    </span>
                                  </div>
                                </>
                              )}

                              {selectedScenario === 3 && (
                                <>
                                  <h3 className="text-xl font-black text-white">周中波谷时段引流发券，保护周末满人利润率</h3>
                                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    周一至周四下午低谷段（14:00-17:30）动态派发定向限时闲时特惠券，吸引价格敏感型客群，提高非繁忙时段桌效。周末黄金客满期卡券自动锁死不予核销。
                                  </p>
                                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl flex items-start gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse mt-1 shrink-0" />
                                    <span className="text-xs text-slate-400">
                                      <strong>保护黄金毛利</strong>：将波谷客流引入闲时，既满足了后厨物料的快速消耗，又绝对保证了周末黄金排队期的满人原价利润率。
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
                                        &quot;店里的牛腩太柴了，吃得不舒服！&quot;
                                      </div>
                                      <div className="text-[9px] bg-emerald-500/15 text-emerald-400 py-1.5 px-3 rounded-xl border border-emerald-500/20 inline-block font-bold">
                                        系统已自动向该桌发放：¥50 致歉消费券
                                      </div>
                                    </>
                                  )}
                                  {selectedScenario === 1 && (
                                    <>
                                      <div className="text-xs font-black text-slate-200">美团/大众点评本地生活 SEO</div>
                                      <div className="text-[9px] text-slate-400">评分：⭐⭐⭐⭐⭐ (5星满分)</div>
                                      <div className="text-[9px] bg-slate-950 border border-slate-850 p-2.5 rounded-lg text-left text-slate-300 max-h-16 overflow-y-auto leading-relaxed">
                                        AI 自动回复：“感谢支持，2分钟内极速秒回评价，同步刷新美团/点评排名！”
                                      </div>
                                    </>
                                  )}
                                  {selectedScenario === 2 && (
                                    <>
                                      <div className="text-xs font-black text-slate-200">三人同行裂变进度</div>
                                      <div className="flex justify-center gap-2.5 py-1">
                                        <div className="w-7 h-7 rounded-full bg-indigo-600 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold">食客1</div>
                                        <div className="w-7 h-7 rounded-full bg-indigo-600 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold">食客2</div>
                                        <div className="w-7 h-7 rounded-full bg-indigo-600 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold">食客3</div>
                                      </div>
                                      <div className="text-[9px] text-emerald-400 font-bold">🎉 已检测到3人同行！联合发卡券已解锁。</div>
                                    </>
                                  )}
                                  {selectedScenario === 3 && (
                                    <>
                                      <div className="text-xs font-black text-slate-200">非繁忙闲时优化</div>
                                      <div className="text-[9px] text-slate-400">限周一至周四 14:00-17:30 可用</div>
                                      <div className="text-[10px] font-bold text-indigo-400 animate-pulse">
                                        ⏳ 限时特惠投放中 · 拒绝在黄金周末稀释利润
                                      </div>
                                    </>
                                  )}
                                </div>

                                <div className="text-[8px] text-slate-500 text-center border-t border-slate-850 pt-2 font-medium">
                                  门店手机终端模拟展示
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
                                <th className="py-4 px-5 text-indigo-400 bg-indigo-950/20 font-black border-x border-slate-900/50 rounded-t-xl">AI Marketing Crew (智能版)</th>
                                <th className="py-4 px-5">传统自动按键软件 (RPA)</th>
                                <th className="py-4 px-5">本地代运营 (Agency)</th>
                                <th className="py-4 px-5">传统任务软件 (Jira/表格)</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                                <td className="py-4.5 px-5 font-black text-slate-100">本地防风控与 IP 安全性</td>
                                <td className="py-4.5 px-5 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-900/50">⭐⭐⭐⭐⭐ (利用门店本地真实 IP 安全发布)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (异地代理登录极易被系统限流或风控)</td>
                                <td className="py-4.5 px-5 text-emerald-400">⭐⭐⭐⭐⭐ (专业代运营本地发布)</td>
                                <td className="py-4.5 px-5 text-slate-500">❌ 不涉及自动化发布</td>
                              </tr>
                              <tr className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                                <td className="py-4.5 px-5 font-black text-slate-100">年省运营成本开支</td>
                                <td className="py-4.5 px-5 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-900/50">⭐⭐⭐⭐⭐ (低成本，单店起步价极低，效率高)</td>
                                <td className="py-4.5 px-5 text-yellow-500">⭐⭐⭐ (维护按键代码成本极高)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (高昂，本地外包代运营月收费几千元起)</td>
                                <td className="py-4.5 px-5 text-emerald-400">⭐⭐⭐⭐⭐ (工具低价但无省人效用)</td>
                              </tr>
                              <tr className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                                <td className="py-4.5 px-5 font-black text-slate-100">多平台自媒体并行兼顾</td>
                                <td className="py-4.5 px-5 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-900/50">⭐⭐⭐⭐⭐ (多平台 Agent 在同看板并轨)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (跨平台接口割裂极难维护)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (代运营团队沟通低效且内容单一)</td>
                                <td className="py-4.5 px-5 text-slate-500">❌ 需全人工拉表配置</td>
                              </tr>
                              <tr className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                                <td className="py-4.5 px-5 font-black text-slate-100">主理人审核把关防AI幻觉</td>
                                <td className="py-4.5 px-5 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-900/50">⭐⭐⭐⭐⭐ (DAG 终审锁物理隔离拦截)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (无审批，代码直接调用发帖)</td>
                                <td className="py-4.5 px-5 text-yellow-500">⭐⭐⭐ (传统校对反馈慢且效率低)</td>
                                <td className="py-4.5 px-5 text-slate-500">❌ 仅能依靠店员自觉对齐</td>
                              </tr>
                              <tr className="border-b border-slate-900 hover:bg-slate-900/10 transition-colors">
                                <td className="py-4.5 px-5 font-black text-slate-100">文案与调性更新敏捷度</td>
                                <td className="py-4.5 px-5 text-emerald-400 bg-indigo-950/10 font-bold border-x border-slate-900/50">⭐⭐⭐⭐⭐ (Dify-First, 拖拽随时调整工作流)</td>
                                <td className="py-4.5 px-5 text-red-500">⭐ (每次换模型都需要重构代码)</td>
                                <td className="py-4.5 px-5 text-slate-500">❌ 无底层技术框架支撑</td>
                                <td className="py-4.5 px-5 text-slate-500">❌ 无 AI 支持</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Slide 5: ROI Calculator & SaaS Pricing (USD) */}
                      {currentSlide === 5 && (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch py-2">
                          {/* Left: SaaS Tier cards in USD */}
                          <div className="xl:col-span-5 space-y-4 flex flex-col justify-center">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">SaaS 订阅与流量套餐</h4>
                            
                            <div className="grid grid-cols-1 gap-4">
                              {/* Tier 1 */}
                              <div className="bg-slate-950/60 border border-slate-900 hover:border-indigo-500/30 rounded-2xl p-5 flex flex-col justify-between transition-all relative overflow-hidden group shadow-lg">
                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                <div>
                                  <div className="flex justify-between items-center">
                                    <div className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">单店轻量版</div>
                                    <span className="text-[9px] text-slate-500 font-mono">SINGLE STORE</span>
                                  </div>
                                  <div className="text-2xl font-black text-white mt-3">¥699<span className="text-xs font-normal text-slate-400"> / 月 / 门店</span></div>
                                  <ul className="text-xs text-slate-400 mt-3 space-y-1.5 leading-relaxed">
                                    <li>• 支持自媒体 AI Agent 协作与看板流转</li>
                                    <li>• 零密码插件桥本地 IP 安全模拟发帖授权</li>
                                    <li>• 基础操作审计日志与主理人审核配合</li>
                                  </ul>
                                </div>
                                <button className="w-full mt-5 py-2 bg-slate-900 border border-slate-800 hover:border-indigo-500/40 text-white hover:text-indigo-300 rounded-xl text-xs font-black transition-all cursor-pointer">选择该方案</button>
                              </div>

                              {/* Tier 2 */}
                              <div className="bg-gradient-to-b from-[#0c0d1e] to-[#04050d] border border-indigo-500/40 rounded-2xl p-5 flex flex-col justify-between relative shadow-xl shadow-indigo-950/20 group">
                                <div className="absolute top-3 right-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider">RECOMMENDED</div>
                                <div>
                                  <div className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 inline-block">连锁旗舰版</div>
                                  <div className="text-2xl font-black text-white mt-3">¥2999<span className="text-xs font-normal text-slate-400"> / 月 / 连锁</span></div>
                                  <ul className="text-xs text-slate-400 mt-3 space-y-1.5 leading-relaxed">
                                    <li>• 不限门店管理数量、不限 AI 虚拟员工数</li>
                                    <li>• 主理人-分店多级 DAG 终审门禁锁</li>
                                    <li>• 集中式网关操作审计与评价公平分析</li>
                                  </ul>
                                </div>
                                <button className="w-full mt-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-500/20 transition-all cursor-pointer">选择该方案</button>
                              </div>
                            </div>
                          </div>

                          {/* Right: Dynamic ROI Calculator Dashboard */}
                          <div className="xl:col-span-7 bg-[#050814]/80 border border-slate-900 rounded-3xl p-8 flex flex-col justify-between shadow-2xl relative">
                            {/* Decorative background grid inside dashboard */}
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/0 rounded-3xl pointer-events-none" />

                            <div className="space-y-6 relative z-10">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  <Calculator className="w-4 h-4 text-indigo-400" />
                                  门店自媒体与口碑运营 ROI 精准算账 (RMB)
                                </h4>
                                <span className="text-[9px] font-bold text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-900">CHINA MARKET DATA</span>
                              </div>

                              {/* Slider 1: Store Count */}
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-slate-400">管理门店数量 (家)</span>
                                  <span className="text-indigo-400 text-sm">{storeCount} 家分店</span>
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
                                  <span className="text-slate-400">本地自媒体运营/代运营月费开支</span>
                                  <span className="text-indigo-400 text-sm">¥${avgWage} / 月</span>
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
                                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">传统自媒体运营/代运营年成本</div>
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
                                  ${savedCost.toLocaleString()} 元/年
                                </h3>
                              </div>
                              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl p-3 text-center shrink-0 flex flex-col justify-center min-w-[130px]">
                                <div className="text-[9px] font-black uppercase tracking-wider">本地自媒体曝光提升</div>
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
                    门店管理常见问题解答
                  </div>
                  <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">常见问题与本地人机协同自媒体解决方案 (FAQ)</h1>
                  <p className="text-sm text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed">
                    查询关于自媒体风控防封、本地凭证托管、主理人配合与 Dify 对接的常见问题
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative max-w-lg mx-auto">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="输入关键词，例如“风控”、“小红书”、“美团”、“点评”或“密码”..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-2xl text-xs text-slate-200 placeholder-slate-500 transition-all shadow-inner"
                  />
                </div>

                {/* Category Buttons */}
                <div className="flex justify-center gap-2 flex-wrap">
                  {[
                    { id: 'all', label: '全部问题' },
                    { id: 'security', label: '🔒 安全与本地风控' },
                    { id: 'automation', label: '🤖 自愈与流转' },
                    { id: 'integrations', label: '🔌 接入与 Dify' },
                    { id: 'pricing', label: '💰 订阅与定价' }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedFaqCategory(cat.id as FaqCategory)}
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
          <p>© 2026 AMC Command Center. All rights reserved. 本地门店自媒体人机协同任务操作系统版权所有.</p>
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
