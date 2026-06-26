'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  TrendingUp,
  Trash2,
  Share2
} from 'lucide-react'

export default function LearnPage() {
  const [activeTab, setActiveTab] = useState<'qa' | 'manual' | 'skills' | 'school'>('qa')
  
  // Q&A Category States
  const [qaSearch, setQaSearch] = useState('')
  const [qaCategory, setQaCategory] = useState<'all' | 'accounts' | 'posts' | 'influencers' | 'billing' | 'reports'>('all')
  const [openFaq, setOpenFaq] = useState<string | null>(null)

  // Manual Chapter States
  const [manualSearch, setManualSearch] = useState('')
  const [openManualSection, setOpenManualSection] = useState<string | null>('p0')
  
  // Skill Hub Toggles
  const [skillCategory, setSkillCategory] = useState<'all' | 'marketing' | 'content' | 'self-improvement' | 'other'>('all')
  const [installedSkills, setInstalledSkills] = useState<string[]>(['social-writer', 'review-defender', 'analytics-logger'])

  // School Curriculum Category States
  const [schoolCategory, setSchoolCategory] = useState<'courses' | 'cases' | 'calendar' | 'articles'>('courses')
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null)

  const [faqs, setFaqs] = useState<any[]>([])
  const [schoolItems, setSchoolItems] = useState<any[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<any | null>(null)

  const handleDeleteFaq = async (id: string) => {
    if (!confirm('确定要删除这条 Q&A 吗？')) return
    try {
      const res = await fetch(`/api/learn/faq?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setFaqs(prev => prev.filter(f => f.id !== id))
        if (openFaq === id) setOpenFaq(null)
      } else {
        alert('删除失败，请稍后重试')
      }
    } catch (err) {
      console.error(err)
      alert('发生错误，请稍后重试')
    }
  }

  const handleDeleteArticle = async (id: string) => {
    if (!confirm('确定要删除这篇学习资料吗？')) return
    try {
      const res = await fetch(`/api/learn/school?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setSchoolItems(prev => prev.filter(item => item.id !== id))
        if (selectedArticle?.id === id) setSelectedArticle(null)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '删除失败，请稍后重试')
      }
    } catch (err) {
      console.error(err)
      alert('发生错误，请稍后重试')
    }
  }

  const handleShareArticle = (articleId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (typeof window !== 'undefined') {
      const shareUrl = `${window.location.origin}${window.location.pathname}?tab=school&articleId=${articleId}`
      navigator.clipboard.writeText(shareUrl).then(() => {
        setCopiedId(articleId)
        setTimeout(() => setCopiedId(null), 2000)
      }).catch(err => {
        console.error('Failed to copy share link: ', err)
      })
    }
  }

  const canDeleteArticle = (article: any) => {
    if (!currentUser) return false
    if (currentUser.role === 'ADMIN') return true
    return article.authorId === currentUser.id
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && schoolItems.length > 0) {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab')
      const articleIdParam = params.get('articleId')
      if (tabParam === 'school') {
        setActiveTab('school')
        setSchoolCategory('articles')
      }
      if (articleIdParam) {
        const found = schoolItems.find(item => item.id === articleIdParam)
        if (found) {
          setSelectedArticle(found)
        }
      }
    }
  }, [schoolItems])

  useEffect(() => {
    fetch('/api/learn/faq')
      .then(res => res.json())
      .then(data => setFaqs(data))
      .catch(err => console.error('Failed to load faqs:', err))

    fetch('/api/learn/school')
      .then(res => res.json())
      .then(data => setSchoolItems(data))
      .catch(err => console.error('Failed to load school items:', err))

    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) return res.json()
        return null
      })
      .then(data => setCurrentUser(data))
      .catch(err => console.error('Failed to load user:', err))
  }, [])

  // Filtered FAQs based on category + search
  const filteredFaqs = useMemo(() => {
    return faqs.filter(faq => {
      const matchCat = qaCategory === 'all' || faq.category === qaCategory
      const matchSearch =
        faq.q.toLowerCase().includes(qaSearch.toLowerCase()) ||
        faq.a.toLowerCase().includes(qaSearch.toLowerCase())
      return matchCat && matchSearch
    })
  }, [faqs, qaCategory, qaSearch])

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
      desc: '24小时监控 Google Business / 美团商家评价。5星好评由 AI 极速秒回以提升搜索引擎权重；低分差评私下拦截并生成看板预警，自动分发关怀优惠券。',
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

  // School Data parsed from schoolItems state
  const entryCourses = useMemo(() => {
    return schoolItems.filter(item => item.type === 'COURSE' && item.level === 'entry')
  }, [schoolItems])

  const advancedCourses = useMemo(() => {
    return schoolItems.filter(item => item.type === 'COURSE' && item.level === 'advanced')
  }, [schoolItems])

  const casesList = useMemo(() => {
    return schoolItems.filter(item => item.type === 'CASE')
  }, [schoolItems])

  const calendarEvents = useMemo(() => {
    return schoolItems.filter(item => item.type === 'CALENDAR')
  }, [schoolItems])

  const articlesList = useMemo(() => {
    return schoolItems.filter(item => item.type === 'ARTICLE')
  }, [schoolItems])

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
            { id: 'school', label: '📱 自媒体运营', desc: '分享与阅读自媒体运营资料' }
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
                          <div className="border-t border-slate-800/80 p-5 bg-slate-950/50 rounded-b-xl space-y-4">
                            <div className="text-slate-350 text-sm leading-relaxed whitespace-pre-wrap">
                              {faq.a}
                            </div>
                            <div className="flex justify-end border-t border-slate-800/30 pt-3">
                              <button
                                onClick={() => handleDeleteFaq(faq.id)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                              >
                                <Trash2 size={13} /> 删除此问题
                              </button>
                            </div>
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
                  { id: 'p0', label: 'Phase 0：签约与分配' },
                  { id: 'p1', label: 'Phase 1：品牌上线 (Onboarding)' },
                  { id: 'p2', label: 'Phase 2：日常内容生产 (SOP)' },
                  { id: 'p3', label: 'Phase 3：口碑与评价管理' },
                  { id: 'p4', label: 'Phase 4：达人探店协作 (SOP)' },
                  { id: 'p5', label: 'Phase 5：月度复盘与自查' }
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
                
                {/* Phase 0 */}
                {openManualSection === 'p0' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Phase 0：签约与分配</h2>
                    <p className="text-slate-350 text-sm leading-relaxed">
                      本阶段负责商家的前期入驻、自助付款、系统分配 AI 虚拟员工与品牌主理人的联动机制。
                    </p>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex justify-center items-center overflow-hidden">
                      <img src="/phase0.webp" alt="Phase 0: 签约与分配" fetchPriority="high" className="max-w-full h-auto rounded-lg" />
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 mt-4">
                      <table className="w-full text-xs text-slate-300 text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="p-3 font-bold text-slate-200 w-16">步骤</th>
                            <th className="p-3 font-bold text-slate-200 w-32">执行者</th>
                            <th className="p-3 font-bold text-slate-200">说明</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          <tr>
                            <td className="p-3 font-bold">1</td>
                            <td className="p-3 text-indigo-400 font-semibold">商家</td>
                            <td className="p-3 text-slate-300">自助注册账号，选定 Essential / Growth / Scale 套餐，完成付款。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">2</td>
                            <td className="p-3 text-indigo-400 font-semibold">系统</td>
                            <td className="p-3 text-slate-300">按 Agent+主理人 配对池，自动指派一个 AMC Agent 负责该品牌。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">3</td>
                            <td className="p-3 text-indigo-400 font-semibold">系统</td>
                            <td className="p-3 text-slate-300">每个 AMC Agent 都固定搭档一位专属品牌主理人，Agent 一旦分配，对应主理人自动同步接入该品牌。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">4</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC 品牌主理人</td>
                            <td className="p-3 text-slate-300">在收到新品牌分配通知后，主动联系商家，启动 onboarding 流程。</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-2">
                      <h4 className="font-bold text-sm text-indigo-400">💡 Agent-主理人配对机制</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        AMC 内部以「一个 Agent + 一位专属主理人」为协作单元长期搭档运作，而非一位主理人零散对接多个独立 Agent。这可以保证主理人对所负责 Agent 的工作风格、品牌组合有持续、深入的掌控。
                      </p>
                    </div>
                  </div>
                )}

                {/* Phase 1 */}
                {openManualSection === 'p1' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Phase 1：新品牌上线 (Onboarding)</h2>
                    <p className="text-slate-350 text-sm leading-relaxed">
                      在新商家入驻的 1-2 周内，品牌主理人将配合商家进行全面的账号绑定与资料初始化，AI Agent 负责制定策略基准与长篇品牌档案描述。
                    </p>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex justify-center items-center overflow-hidden">
                      <img src="/phase1.webp" alt="Phase 1: 新品牌上线" loading="lazy" className="max-w-full h-auto rounded-lg" />
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 mt-4">
                      <table className="w-full text-xs text-slate-300 text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="p-3 font-bold text-slate-200 w-16">步骤</th>
                            <th className="p-3 font-bold text-slate-200 w-32">执行者</th>
                            <th className="p-3 font-bold text-slate-200">说明</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          <tr>
                            <td className="p-3 font-bold">1</td>
                            <td className="p-3 text-indigo-400 font-semibold">品牌主理人 ↔ 商家</td>
                            <td className="p-3 text-slate-300">品牌访谈：了解品牌故事、定位、目标客群、主打产品、视觉调性偏好。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">2</td>
                            <td className="p-3 text-indigo-400 font-semibold">品牌主理人 + 商家</td>
                            <td className="p-3 text-slate-300">社媒账号接入：通过 PostFast OAuth Connect Link 完成 Instagram/Facebook/TikTok/小红书等官方授权。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">3</td>
                            <td className="p-3 text-indigo-400 font-semibold">品牌主理人</td>
                            <td className="p-3 text-slate-300">Google Business 信息完善：认领商家地址，完善营业信息。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">4</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC Agent</td>
                            <td className="p-3 text-slate-300">品牌档案初始化：调用接口查询绑定品牌列表 ➜ 撰写深度介绍（≥200字，融合访谈信息）➜ 写入官网/电话/地址/时区 ➜ 自动创建 Lark Drive 共享目录。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">5</td>
                            <td className="p-3 text-indigo-400 font-semibold">商家</td>
                            <td className="p-3 text-slate-300">初始素材提交：提供菜单照片、Logo、品牌故事文档等基础素材。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">6</td>
                            <td className="p-3 text-indigo-400 font-semibold">主理人 / Agent</td>
                            <td className="p-3 text-slate-300">素材入库：上传素材至素材库，打标签（包含 AI 自动生成的描述/标签）。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">7</td>
                            <td className="p-3 text-indigo-400 font-semibold">Agent + 主理人</td>
                            <td className="p-3 text-slate-300">首月策略制定（Tier2+）：竞品分析（前3名竞争对手）、目标客群画像、双语平台策略、品牌话术与视觉指南 ➜ 与商家确认后定稿。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">8</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC Agent</td>
                            <td className="p-3 text-slate-300">首月内容日历草拟：生成首月内容排期草案 ➜ 提交主理人/商家确认。</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="h-px bg-slate-800/50 my-2" />

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

                    {/* SOP-003 */}
                    <div className="rounded-xl border border-slate-850 bg-slate-900/30 p-5 space-y-3 relative">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase">SOP-003</div>
                      <h3 className="font-bold text-base text-slate-100">月度 Brief 提交流程与初始化</h3>
                      <p className="text-xs text-slate-450">执行频率：每月第一个工作日提交本月大方向（如有特定新品）。</p>
                      <div className="h-px bg-slate-800/30 my-2" />
                      <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-350 leading-relaxed">
                        <li>向 AI 员工发送你的本月营销需求（如“本月推出新季主推款产品，需要小红书主推”）。</li>
                        <li>AI 自动创建 Brief 行动卡片，并提取相关产品、价格以及要强调的方向。</li>
                        <li>AMC 在 24 小时内确认并根据此 Brief 自动生成发布日历计划。</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Phase 2 */}
                {openManualSection === 'p2' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Phase 2：日常内容生产循环</h2>
                    <p className="text-slate-350 text-sm leading-relaxed">
                      日常运营循环，主要通过自动化算法触发与人工终审机制双轨推进，保证内容生产的效率与调性合规。
                    </p>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex justify-center items-center overflow-hidden">
                      <img src="/phase2.webp" alt="Phase 2: 日常内容生产循环" loading="lazy" className="max-w-full h-auto rounded-lg" />
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 mt-4">
                      <table className="w-full text-xs text-slate-300 text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="p-3 font-bold text-slate-200 w-16">步骤</th>
                            <th className="p-3 font-bold text-slate-200 w-32">执行者</th>
                            <th className="p-3 font-bold text-slate-200">业务操作与协同说明</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          <tr>
                            <td className="p-3 font-bold">1. 方案与主题设定</td>
                            <td className="p-3 text-indigo-400 font-semibold">品牌主理人 ↔ AMC Agent</td>
                            <td className="p-3 text-slate-300">主理人建立品牌深度理解并设计推广大纲，设定当月主题通过 Agent 记录进 brand 上下文与记忆库。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">2. 素材丰富与汇聚</td>
                            <td className="p-3 text-indigo-400 font-semibold">品牌主理人</td>
                            <td className="p-3 text-slate-300">线下对接丰富素材库。包含：1. 商家日常提供 2. 安排达人探店 3. 安排专业拍摄。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">3. 生产计划任务化</td>
                            <td className="p-3 text-indigo-400 font-semibold">品牌主理人 或 AMC Agent</td>
                            <td className="p-3 text-slate-300">主理人进行主题选择、素材组织与视觉审核，可直接在看板上创建带 post draft 的 to-do 任务；或由 AMC Agent 自动扫描素材并基于当月主题生成带主题、建议图片及视频素材的生产计划（在看板生成 To-do task）。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">4. 自动创作与排期</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC Copywriter (AI)</td>
                            <td className="p-3 text-slate-300">自动对接看板中的生产计划任务，完成内容创作（正文、Hashtags），保存草稿并安排排期发布，在此过程中持续提升 AI 内容创作质量。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">5. 发布内容终审</td>
                            <td className="p-3 text-indigo-400 font-semibold">品牌主理人 (人工 QA)</td>
                            <td className="p-3 text-slate-300">主理人 review 已生成的发布内容草稿，执行人工 QA 终审，确保符合品牌调性。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">6. 数据采集与看板截图</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC Researcher (AI)</td>
                            <td className="p-3 text-slate-300">AI 自动执行数据采集、效果回填；Researcher 机器人保持登录状态，定期截图每个品牌的社媒账号首页，集中呈现在账号整体展现看板中。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">7. 线下复盘 Review</td>
                            <td className="p-3 text-indigo-400 font-semibold">品牌主理人 ↔ 品牌主</td>
                            <td className="p-3 text-slate-300">品牌主理人与品牌主进行线下人工对接，复盘上月社媒效果，并讨论设定下期活动与营销主题。</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-2">
                      <h4 className="font-bold text-sm text-indigo-400">🤖 自动驾驶与人机协同参数</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        当系统开启 <strong>自动驾驶模式 (autoPilot = true)</strong> 时，AI 在检测到文案质量符合基准后可直接进行接口排期发布；而当 <strong>autoPilot = false</strong> 时，所有内容发布任务都将在 pending_review 状态死锁挂起，必须由人类点击通过。
                      </p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        <strong>手动写草稿</strong>：品牌主理人也可直接通过看板调用 <code>board_save_draft</code> 手动撰写/上传自定义草稿（如临时特定优惠通知、重大新闻等），并通过 <code>board_submit_draft</code> 提交，状态机和审批流程与 AI 生成草稿完全一致。
                      </p>
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

                    {/* SOP-006 */}
                    <div className="rounded-xl border border-slate-850 bg-slate-900/30 p-5 space-y-3 relative">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase">SOP-006</div>
                      <h3 className="font-bold text-base text-slate-100">数据指标监控</h3>
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

                {/* Phase 3 */}
                {openManualSection === 'p3' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Phase 3：口碑与评价管理</h2>
                    <p className="text-slate-350 text-sm leading-relaxed">
                      AI Agent 与品牌主理人对用户反馈进行 24h 监控与自动回复，维护商家的线上口碑与搜索引擎权重。
                    </p>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex justify-center items-center overflow-hidden">
                      <img src="/phase3.webp" alt="Phase 3: 口碑与评价管理" loading="lazy" className="max-w-full h-auto rounded-lg" />
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 mt-4">
                      <table className="w-full text-xs text-slate-300 text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="p-3 font-bold text-slate-200 w-16">步骤</th>
                            <th className="p-3 font-bold text-slate-200 w-32">执行者</th>
                            <th className="p-3 font-bold text-slate-200">说明</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          <tr>
                            <td className="p-3 font-bold">1. 拉取评论</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC Agent</td>
                            <td className="p-3 text-slate-300">每日 20:00 自动抓取各个平台（如 Google Business 等）最新的消费者评论与评分。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">2. 分类处理</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC Agent</td>
                            <td className="p-3 text-slate-300">根据星级评分分类：好评（≥4星）自动礼貌感谢；中评/差评（≤3星）则拟定道歉信并给出解决方案。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">3. 自动回复</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC Agent</td>
                            <td className="p-3 text-slate-300">在托管渠道（如 Google Business）于 24 小时内全自动调用接口回写回复，拉升口碑响应速度。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">4. 异常升级</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC Agent ➜ 主理人</td>
                            <td className="p-3 text-slate-300">遇到账号凭证断连或突发恶性差评舆情危机时，自动在看板创建标红卡片通知主理人人工介入。</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Phase 4 */}
                {openManualSection === 'p4' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Phase 4：达人探店协作 (SOP)</h2>
                    <p className="text-slate-350 text-sm leading-relaxed">
                      达人探店是由主理人在线下自主组织和执行，AI 负责辅助素材收集与发布追踪，二者有机联动。
                    </p>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex justify-center items-center overflow-hidden">
                      <img src="/phase4.webp" alt="Phase 4: 达人探店" loading="lazy" className="max-w-full h-auto rounded-lg" />
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 mt-4">
                      <table className="w-full text-xs text-slate-300 text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="p-3 font-bold text-slate-200 w-16">角色</th>
                            <th className="p-3 font-bold text-slate-200 w-32">执行方</th>
                            <th className="p-3 font-bold text-slate-200">具体协作职责</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          <tr>
                            <td className="p-3 font-bold">发起任务</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC Agent</td>
                            <td className="p-3 text-slate-300">自动在推广节点发起 Require Input 状态的探店素材收集任务卡片。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">外联接待</td>
                            <td className="p-3 text-indigo-400 font-semibold">品牌主理人 & 商家</td>
                            <td className="p-3 text-slate-300">主理人进行达人筛选、沟通邀约和确认时间；商家在到店当天做好周到接待（优先出品并介绍品牌故事）。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">素材追踪</td>
                            <td className="p-3 text-indigo-400 font-semibold">主理人 ➜ Agent</td>
                            <td className="p-3 text-slate-300">主理人收集高清图片/视频上传至卡片；AI Agent 编写推文发布，并将发布数据追踪归档入月度报告。</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* SOP-007 */}
                    <div className="rounded-xl border border-slate-850 bg-slate-900/30 p-5 space-y-3 relative">
                      <div className="absolute top-0 right-0 rounded-bl-lg bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase">SOP-007</div>
                      <h3 className="font-bold text-base text-slate-100">达人探店与素材收集细节</h3>
                      <p className="text-xs text-slate-455">说明：配合线下探店，主理人将达人优质图片/短视频归档入素材库，由 AI 推进下一步。</p>
                      <div className="h-px bg-slate-800/30 my-2" />
                      <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-350 leading-relaxed">
                        <li><strong>探店准备</strong>：主理人在商家确认到店计划后，从探店群筛选达人，确认探店时间，并向商家提供接待 Brief。</li>
                        <li><strong>收集高清素材</strong>：拍摄完成后，主理人向达人收集原图 and 视频，上传至看板卡片。</li>
                        <li><strong>点击一键 Resume</strong>：在看板卡片内确认素材就位，点击 <strong>“Resume”</strong>，AI 将立即启动内容排版发布循环，并在发布后邀请商家查看。</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Phase 5 */}
                {openManualSection === 'p5' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-3">Phase 5：月度复盘与自查</h2>
                    <p className="text-slate-350 text-sm leading-relaxed">
                      月度工作效果汇总并对 AI 进行持续记忆调优。同时，主理人可参考下方自查排除表解决日常运行中的异常。
                    </p>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex justify-center items-center overflow-hidden">
                      <img src="/phase5.webp" alt="Phase 5: 月度复盘与优化" loading="lazy" className="max-w-full h-auto rounded-lg" />
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 mt-4">
                      <table className="w-full text-xs text-slate-300 text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="p-3 font-bold text-slate-200 w-16">步骤</th>
                            <th className="p-3 font-bold text-slate-200 w-32">执行者</th>
                            <th className="p-3 font-bold text-slate-200">说明</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          <tr>
                            <td className="p-3 font-bold">1. 数据回填与截图</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC Researcher (AI)</td>
                            <td className="p-3 text-slate-300">完成数据采集和回填，保持登录状态，截图每个品牌的社媒首页，展示在账号整体展现看板中。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">2. 线下人工对接 Review</td>
                            <td className="p-3 text-indigo-400 font-semibold">AMC 主理人 ↔ 品牌主</td>
                            <td className="p-3 text-slate-350">主理人与餐厅品牌老板进行线下人工对接，解读上月运营成效与数据报告。</td>
                          </tr>
                          <tr>
                            <td className="p-3 font-bold">3. 品牌认知更新</td>
                            <td className="p-3 text-indigo-400 font-semibold">品牌主理人 ↔ AMC Agent</td>
                            <td className="p-3 text-slate-300">主理人将复盘反馈、推广方案与下期营销主题更新同步，通过 AMC Agent 存入品牌长期上下文与记忆库。</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <h3 className="text-base font-bold text-slate-200 mt-6 pt-4 border-t border-slate-800/50">🛠️ 常见故障自查排除</h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 mt-2">
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

                    <h3 className="text-base font-bold text-slate-200 mt-6 pt-4 border-t border-slate-800/50">🔗 跨阶段支撑与协作共识</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-2">
                        <h4 className="font-bold text-xs text-indigo-400">📢 跨阶段支撑机制</h4>
                        <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300">
                          <li>看板任务遵循 `todo → in_progress → pending(require_input) → done` 周期。</li>
                          <li>所有工作均以 `brandId` 隔离，严禁多品牌交叉。</li>
                          <li>接口错误重试不超过 2 次，超限自动挂起转人工跟进。</li>
                        </ul>
                      </div>
                      <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-2">
                        <h4 className="font-bold text-xs text-indigo-400">🤝 已确认协作共识</h4>
                        <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300">
                          <li>行业访谈模板固定在 AMC 学院，持续迭代。</li>
                          <li>评论自动回复语气在 Phase 1 品牌访谈确立并载入 AI 档案。</li>
                          <li>月度复盘会议纪要由主理人同步录入 AI 记忆库。</li>
                        </ul>
                      </div>
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

          {/* 4. Self-Media Operations Tab */}
          {activeTab === 'school' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-6">
                <div className="rounded-xl border border-slate-850 bg-slate-900/40 p-4 text-xs sm:text-sm text-slate-400 leading-relaxed">
                  💡 **自媒体运营资料中心**：支持 Agent 以 Markdown 格式上传运营指南与案例，供 AMC 主理人和 Agent 共享学习。
                </div>

                {selectedArticle ? (
                  /* Detailed Article View */
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 sm:p-8 space-y-6 shadow-xl relative backdrop-blur-md">
                    <button
                      onClick={() => setSelectedArticle(null)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-350 transition-colors cursor-pointer"
                    >
                      ← 返回资料列表
                    </button>
                    
                    <div className="space-y-3 border-b border-slate-800/60 pb-6">
                      <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100 leading-tight">
                        {selectedArticle.title}
                      </h2>
                      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[11px] text-slate-400">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1.5 font-bold text-indigo-405">
                            🤖 上传 Agent: {selectedArticle.author?.nickname || selectedArticle.author?.email || 'AMC Agent'}
                          </span>
                          <span>发布时间: {new Date(selectedArticle.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={(e) => handleShareArticle(selectedArticle.id, e)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-400 hover:text-indigo-350 transition-colors cursor-pointer"
                          >
                            <Share2 size={12} /> {copiedId === selectedArticle.id ? '链接已复制！' : '转发分享'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedArticle.markdown || '*此文章暂无 Markdown 内容*'}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  /* Articles List View */
                  <div className="grid grid-cols-1 gap-4">
                    {articlesList.length > 0 ? (
                      articlesList.map((article, idx) => (
                        <div
                          key={article.id || idx}
                          className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 flex flex-col justify-between hover:border-indigo-500/30 hover:bg-slate-900/45 transition-all duration-300 shadow-sm"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-4">
                              <h4 className="font-extrabold text-slate-100 text-sm sm:text-base leading-snug">
                                {article.title}
                              </h4>
                              <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-400 border border-indigo-500/20 uppercase shrink-0">
                                Markdown
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                              {article.desc || '暂无文章简介'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-4 text-[10px] text-slate-500 border-t border-slate-805/60 pt-3.5 mt-4">
                            <div className="flex items-center gap-1.5 font-bold text-indigo-405">
                              <span>🤖 Agent: {article.author?.nickname || article.author?.email || 'AMC Agent'}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span>{new Date(article.createdAt).toLocaleDateString()}</span>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setSelectedArticle(article)}
                                  className="text-xs font-extrabold text-indigo-400 hover:text-indigo-350 underline cursor-pointer"
                                >
                                  阅读全文 →
                                </button>
                                <button
                                  onClick={(e) => handleShareArticle(article.id, e)}
                                  className="text-xs font-extrabold text-indigo-400 hover:text-indigo-350 underline cursor-pointer"
                                >
                                  {copiedId === article.id ? '已复制' : '分享'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-20 text-center text-slate-550 text-xs border border-slate-805/60 bg-slate-900/20 rounded-xl">
                        暂无 Agent 学习资料，可通过 MCP/API 接口以 Markdown 格式上传。
                      </div>
                    )}
                  </div>
                )}
              </div>
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
