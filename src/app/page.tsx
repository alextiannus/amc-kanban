'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, User, Globe, Phone, ArrowRight, Loader2, Sparkles, MessageSquare, MapPin, AlertCircle, Sun, Moon, Languages } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useI18n } from '@/lib/i18n'

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
)

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
)

const LABEL_CLASS = 'block font-jetbrains text-xs text-slate-500 mb-2 ml-1'
const INPUT_CLASS = 'w-full bg-slate-50 border border-slate-200 rounded-lg py-4 pl-12 pr-4 text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600/50 transition-all placeholder:text-slate-400 font-hanken text-base shadow-sm'

export default function Login() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { language, setLanguage, t } = useI18n()
  const currentTheme = resolvedTheme || theme || 'light'

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [country, setCountry] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)

  // Forgot-password modal state
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState('')

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError('')
    setForgotLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setForgotError(data.error || `请求失败 (${res.status})，请稍后重试`)
        return
      }
      setForgotSent(true)
    } catch {
      setForgotError('网络错误，请检查连接后重试')
    } finally {
      setForgotLoading(false)
    }
  }

  const router = useRouter()

  const [terminalLines, setTerminalLines] = useState<string[]>([
    '[08:00] REFRESH: Syncing Feishu vault guidelines',
    '[09:00] SEARCH: Crawling Google place details for Yu Shan Fang',
    '[10:00] PUBLISH: Seeding Instagram post (draft_1294)',
    '[11:30] REVIEW: Replying to 4 reviews on Google Business',
  ])

  const [commentsList, setCommentsList] = useState([
    {
      platform: 'Instagram',
      user: 'foodie_nyc',
      comment: 'The braised beef looks amazing!',
      reply: '@foodie_nyc Thank you! It is slow-braised for 8 hours daily. Hope you try it soon!',
      time: 'Just now',
      color: 'from-pink-500 to-yellow-500',
    },
    {
      platform: 'Google Business',
      user: 'Sarah Jenkins',
      comment: 'Amazing neighborhood gem! Will come back.',
      reply: 'Thanks for the support! Glad you enjoyed the flavors.',
      time: '2m ago',
      color: 'from-blue-500 to-cyan-500',
    },
  ])

  const terminalContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTo({
        top: terminalContainerRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [terminalLines])

  useEffect(() => {
    let index = 0
    const taskPool = [
      'REFRESH: Syncing Feishu vault guidelines',
      'AUDIT: Onboarding context completeness checked: 72%',
      'SEARCH: Crawling Google place details for Yu Shan Fang',
      'RESEARCH: Analyzing competitor Instagram posts in NYC area',
      'PUBLISH: Seeding Instagram post (draft_1294)',
      'PUBLISH: Seeding RedNote post (draft_1295)',
      'MONITOR: Scraping Google Business Profile ratings: 4.8 avg',
      'REVIEW: Replying to 4 reviews on Google Business',
      'ANALYZE: Generating weekly performance report (weekly_2026-W24.md)',
      'INSIGHTS: High engagement (4.2%) detected on TikTok video',
      'REPURPOSE: Repurposing IG post (draft_1294) to Facebook',
      'KOL: Updating KOL coordinates in amc-kanban board',
    ]

    const interval = setInterval(() => {
      const now = new Date()
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      const line = `[${timeStr}] ${taskPool[index % taskPool.length]}`
      setTerminalLines(prev => [...prev.slice(-12), line])
      index++
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const mockComments = [
      {
        platform: 'Instagram',
        user: 'foodie_nyc',
        comment: 'The braised beef looks amazing!',
        reply: '@foodie_nyc Thank you! It is slow-braised for 8 hours daily. Hope you try it soon!',
        time: 'Just now',
        color: 'from-pink-500 to-yellow-500',
      },
      {
        platform: 'Google Business',
        user: 'Sarah Jenkins',
        comment: 'Amazing neighborhood gem! Will come back.',
        reply: 'Thanks for the support! Glad you enjoyed the flavors.',
        time: '2m ago',
        color: 'from-blue-500 to-cyan-500',
      },
      {
        platform: 'Xiaohongshu',
        user: '纽约吃货君',
        comment: '这碗红烧牛肉面也太绝了吧，汤底很浓郁！',
        reply: '感谢支持！我们的面条都是每天手工制作的，欢迎常来！',
        time: 'Just now',
        color: 'from-red-500 to-orange-500',
      },
      {
        platform: 'Facebook',
        user: 'Mark R.',
        comment: 'Is the NYC location open for dine-in today?',
        reply: 'Hi Mark! Yes, we are open until 10:00 PM for dine-in. Welcome!',
        time: 'Just now',
        color: 'from-blue-600 to-indigo-600',
      },
    ]

    let index = 2
    const interval = setInterval(() => {
      const nextComment = mockComments[index % mockComments.length]
      const updatedComment = { ...nextComment, time: 'Just now' }
      setCommentsList(prev => {
        const shifted = prev.map((c, i) => ({
          ...c,
          time: i === 0 ? '1m ago' : `${(i + 1) * 3}m ago`,
        }))
        return [updatedComment, ...shifted.slice(0, 1)]
      })
      index++
    }, 7000)
    return () => clearInterval(interval)
  }, [])

  const switchMode = (next: 'login' | 'register') => {
    setMode(next)
    setError('')
    setPassword('')
    setConfirmPassword('')
    setNickname('')
    setCountry('')
    setPhone('')
    setShowPassword(false)
    setShowConfirmPassword(false)
    setAgreed(false)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nickname, country, phone }),
      })
      const data = await res.json()
      if (res.ok) {
        const requestedReturn = new URLSearchParams(window.location.search).get('returnTo')
        const safeReturn = requestedReturn?.startsWith('/') && !requestedReturn.startsWith('/api/')
          ? requestedReturn
          : '/board'
        router.push(safeReturn)
        router.refresh()
      } else {
        setError(data.error || 'Login failed')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!agreed) {
      setError('You must agree to the Terms of Service and Privacy Policy.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          nickname: nickname.trim(),
          country: country.trim(),
          phone: phone.trim(),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        const requestedReturn = new URLSearchParams(window.location.search).get('returnTo')
        const safeReturn = requestedReturn?.startsWith('/') && !requestedReturn.startsWith('/api/')
          ? requestedReturn
          : '/board'
        router.push(safeReturn)
        router.refresh()
      } else {
        setError(data.error || 'Registration failed')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const renderPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'Instagram':
        return <InstagramIcon className="h-4 w-4 text-pink-600" />
      case 'Google Business':
        return <MapPin className="h-4 w-4 text-blue-600" />
      case 'Facebook':
        return <FacebookIcon className="h-4 w-4 text-blue-600" />
      default:
        return <MessageSquare className="h-4 w-4 text-rose-600" />
    }
  }

  const isRegister = mode === 'register'

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-[#F8FAFC] overflow-hidden text-slate-800 p-4 md:p-8">
      {/* Top Right Controls (Language & Theme Switchers) */}
      <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
          className="h-9 px-3 rounded-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-indigo-650 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-all font-bold text-xs bg-white/70 dark:bg-slate-900/70 border border-slate-200/50 dark:border-slate-800/50 shadow-sm backdrop-blur-sm"
          aria-label={t('切换语言', 'Switch language')}
          title={t('切换语言', 'Switch language')}
        >
          <Languages size={15} />
          <span>{language === 'en' ? '中文' : 'EN'}</span>
        </button>

        <button
          type="button"
          onClick={() => setTheme(currentTheme === 'dark' ? 'light' : 'dark')}
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-all bg-white/70 dark:bg-slate-900/70 border border-slate-200/50 dark:border-slate-800/50 shadow-sm backdrop-blur-sm"
          aria-label={t('切换主题', 'Toggle theme')}
          title={t('切换主题', 'Toggle theme')}
        >
          {currentTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* Background aurora glows and grid */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="aurora-glow-1"></div>
        <div className="aurora-glow-2"></div>
        <div className="absolute inset-0 opacity-[0.4] bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:40px_40px] bg-center z-1"></div>
        <div className="absolute inset-0 bg-white/10 mix-blend-multiply z-2"></div>
      </div>

      {/* Main Container */}
      <main className="relative z-10 w-full max-w-[1280px] bg-white/70 border border-slate-200/80 rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-2xl backdrop-blur-md min-h-[750px]">
        {/* Left Side: Autopilot Console */}
        <section className="hidden md:flex flex-1 flex-col bg-slate-50/50 p-8 lg:p-10 border-r border-slate-200/60 justify-between">
          <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-sm">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                </div>
                <div>
                  <h2 className="font-manrope font-semibold text-lg text-slate-800">{t('自动驾驶控制台', 'Autopilot Console')}</h2>
                  <p className="font-hanken text-xs text-slate-500">{t('智能内容营销智能体日志', 'Autonomous marketing agent logs')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10B981]"></div>
                <span className="font-jetbrains text-[10px] text-emerald-700 tracking-wider font-semibold">{t('运行中', 'LIVE ACTIVE')}</span>
              </div>
            </div>

            {/* Live Feed Section */}
            <div className="space-y-4">
              <h3 className="font-jetbrains text-xs text-slate-400 uppercase tracking-wider">{t('智能体执行结果', 'Active Agent Response')}</h3>
              {commentsList.length > 0 && (() => {
                const c = commentsList[0];
                return (
                  <div 
                    key={c.platform + c.user} 
                    className="bg-white border border-slate-200/80 p-6 rounded-2xl relative overflow-hidden transition-all duration-500 animate-card-slide-in shadow-sm"
                  >
                    {/* Platform stripe indicator */}
                    <div className={`absolute left-0 top-0 w-1.5 h-full bg-gradient-to-b ${c.color}`}></div>
                    
                    <div className="flex items-center gap-2 mb-4">
                      {renderPlatformIcon(c.platform)}
                      <span className="font-jetbrains text-xs text-slate-700 font-medium">{c.platform}</span>
                      <span className="font-jetbrains text-[10px] text-slate-400 ml-auto">{c.time}</span>
                    </div>
                    
                    <div className="mb-4">
                      <p className="font-hanken text-sm text-slate-800 leading-relaxed">
                        <span className="font-semibold text-slate-900 mr-1.5">@{c.user}</span> 
                        {c.comment}
                      </p>
                    </div>
                    
                    <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-4 flex gap-3 items-start shadow-sm">
                      <div className="w-6 h-6 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-jetbrains text-[9px] text-emerald-700 uppercase font-semibold">{t('回复已自动提交', 'Auto-Reply Submitted')}</span>
                        </div>
                        <p className="font-hanken text-xs text-slate-700 leading-relaxed">{c.reply}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Terminal Console */}
          <div className="flex flex-col bg-slate-100/60 border border-slate-200/80 rounded-2xl overflow-hidden mt-8 shadow-sm">
            {/* Terminal Window Header Bar */}
            <div className="flex items-center justify-between bg-slate-200/40 border-b border-slate-200 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/60"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/60"></div>
              </div>
              <span className="font-jetbrains text-[10px] text-slate-500 tracking-wider">AGENT_LOG@AMC-CONSOLE</span>
              <div className="w-12"></div>
            </div>
            
            {/* Terminal Log Output */}
            <div 
              ref={terminalContainerRef}
              className="h-44 p-4 font-jetbrains text-xs text-slate-600 overflow-y-auto terminal-scrollbar relative space-y-2 bg-slate-50/80"
            >
              {terminalLines.map((line, idx) => {
                const time = line.substring(0, 9)
                const rest = line.substring(9)
                const spaceIdx = rest.indexOf(':')
                const type = rest.substring(0, spaceIdx)
                const msg = rest.substring(spaceIdx)
                
                const getTypeColor = (t: string) => {
                  switch (t.trim()) {
                    case 'REFRESH': return 'text-sky-600 font-semibold'
                    case 'PUBLISH': return 'text-purple-600 font-semibold'
                    case 'REVIEW': return 'text-amber-600 font-semibold'
                    case 'INSIGHTS': return 'text-emerald-600 font-bold'
                    case 'SEARCH': return 'text-orange-600 font-semibold'
                    case 'AUDIT': return 'text-teal-600 font-semibold'
                    case 'ANALYZE': return 'text-indigo-600 font-semibold'
                    default: return 'text-pink-600 font-semibold'
                  }
                }
                
                return (
                  <div key={idx} className="flex gap-2 items-start font-mono animate-terminal-line leading-relaxed">
                    <span className="text-slate-400 select-none">{time}</span>
                    <span className={getTypeColor(type)}>{type}</span>
                    <span className="text-slate-700">{msg}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Right Side: Form (Our Obsidian Glassmorphic Login Card) */}
        <section className="flex-1 flex flex-col p-6 lg:p-12 justify-center items-center relative">
          <div className="w-full max-w-[440px]">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="font-manrope font-bold text-5xl mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 tracking-tight">AMC</h1>
              <p className="font-jetbrains text-xs text-slate-500 uppercase tracking-[0.15em]">AI Marketing Crew</p>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-slate-100/80 p-1 rounded-full mb-8 relative border border-slate-200/50">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-3 text-center rounded-full font-hanken font-semibold text-sm transition-all relative z-10 ${
                  !isRegister ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t('登录', 'Sign In')}
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`flex-1 py-3 text-center rounded-full font-hanken font-semibold text-sm transition-all relative z-10 ${
                  isRegister ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t('注册', 'Sign Up')}
              </button>
            </div>

            {/* Form */}
            <form className="space-y-6" onSubmit={isRegister ? handleRegister : handleLogin}>
              {/* Nickname Field (Register only) */}
              {isRegister && (
                <div>
                  <label className={LABEL_CLASS} htmlFor="nickname">{t('您的姓名或昵称', 'Name')}</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                    <input
                      id="nickname"
                      type="text"
                      required
                      className={INPUT_CLASS}
                      placeholder="e.g. Alex Tian"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Email Field */}
              <div>
                <label className={LABEL_CLASS} htmlFor="email">{t('电子邮箱', 'Email Address')}</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    className={INPUT_CLASS}
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Phone Field (Register only) */}
              {isRegister && (
                <div>
                  <label className={LABEL_CLASS} htmlFor="phone">{t('联系电话', 'Phone Number')}</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                    <input
                      id="phone"
                      type="tel"
                      required
                      className={INPUT_CLASS}
                      placeholder="e.g. +65 9xxx xxxx"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Country Field (Register only) */}
              {isRegister && (
                <div>
                  <label className={LABEL_CLASS} htmlFor="country">{t('所在城市/国家', 'Country / City')}</label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                    <input
                      id="country"
                      type="text"
                      required
                      className={INPUT_CLASS}
                      placeholder="e.g. Singapore"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Password Field */}
              <div>
                <div className="flex justify-between items-center mb-2 ml-1 mr-1">
                  <label className="block font-jetbrains text-xs text-slate-500" htmlFor="password">{t('密码', 'Password')}</label>
                  {!isRegister && (
                    <button
                      type="button"
                      onClick={() => { setShowForgotModal(true); setForgotSent(false); setForgotEmail(email); setForgotError('') }}
                      className="font-jetbrains text-xs text-purple-600 hover:text-purple-700 transition-colors hover:underline"
                    >
                      {t('忘记密码？', 'Forgot Password?')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-4 pl-12 pr-12 text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600/50 transition-all placeholder:text-slate-400 font-hanken text-base shadow-sm"
                    placeholder={isRegister ? t('最少 8 位字符', 'At least 8 characters') : '••••••••'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field (Register only) */}
              {isRegister && (
                <div>
                  <label className={LABEL_CLASS} htmlFor="confirm-password">{t('确认密码', 'Confirm Password')}</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-4 pl-12 pr-12 text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600/50 transition-all placeholder:text-slate-400 font-hanken text-base shadow-sm"
                      placeholder={t('再次输入密码', 'Confirm password')}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Privacy Policy & Terms Consent (Register only) */}
              {isRegister && (
                <div className="flex items-start gap-3 mt-4 ml-1">
                  <input
                    id="agree-terms"
                    type="checkbox"
                    required
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-purple-600 focus:ring-purple-500 border-slate-300 focus:outline-none cursor-pointer"
                  />
                  <label htmlFor="agree-terms" className="text-[11px] text-slate-500 leading-normal font-hanken select-none">
                    {language === 'en' ? (
                      <>
                        I agree to the <a href="/terms" target="_blank" className="text-purple-600 hover:underline font-semibold">Terms of Service</a> and <a href="/privacy" target="_blank" className="text-purple-600 hover:underline font-semibold">Privacy Policy</a> (compliant with Singapore PDPA).
                      </>
                    ) : (
                      <>
                        我同意并接受<a href="/terms" target="_blank" className="text-purple-600 hover:underline font-semibold">服务条款</a>与<a href="/privacy" target="_blank" className="text-purple-600 hover:underline font-semibold">隐私政策</a>（符合新加坡 PDPA 规范）。
                      </>
                    )}
                  </label>
                </div>
              )}

              {/* Error Banner */}
              {error && (
                <div className="text-rose-600 bg-rose-50 border border-rose-100/80 rounded-xl py-3 px-4 text-xs font-semibold font-hanken text-center shadow-sm flex items-center justify-center gap-1.5 animate-pulse">
                  <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-8 py-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-manrope font-bold text-lg shadow-lg shadow-indigo-100 hover:shadow-indigo-200/80 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 group"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    {t('开启您的 AI 员工', 'Meet Your AI Staff')}
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center space-y-4">
              <p className="font-jetbrains text-[10px] text-slate-400 uppercase tracking-wider">
                powered by <span className="text-slate-700">Immedi.ai</span>
              </p>
              <div className="flex justify-center gap-4 font-jetbrains text-[10px] text-slate-400">
                <a href="/terms" target="_blank" className="hover:text-slate-600 hover:underline">{t('服务条款', 'Terms of Service')}</a>
                <span>•</span>
                <a href="/privacy" target="_blank" className="hover:text-slate-600 hover:underline">{t('隐私政策', 'Privacy Policy')}</a>
              </div>
            </div>
          </div>
        </section>
      </main>
      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForgotModal(false) }}
        >
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5">
              <h2 className="text-lg font-bold text-white">{t('重置密码', 'Reset Password')}</h2>
              <p className="text-indigo-100 text-xs mt-1">{t('输入账号邮箱，我们会发送重置链接', 'Enter your email to receive a password reset link')}</p>
            </div>
            <div className="p-6">
              {forgotSent ? (
                <div className="text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
                    <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{t('邮件已发送！', 'Email Sent!')}</p>
                    <p className="text-xs text-slate-500 mt-1">{t('若该邮箱已注册，您将收到一封含重置链接的邮件。链接有效期 15 分钟。', 'If this email is registered, you will receive a reset link valid for 15 minutes.')}</p>
                  </div>
                  <button
                    onClick={() => setShowForgotModal(false)}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
                  >
                    {t('关闭', 'Close')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">{t('账号邮箱', 'Account Email')}</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        autoFocus
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                      />
                    </div>
                  </div>
                  {forgotError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{forgotError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-sm transition-colors"
                    >
                      {t('取消', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading || !forgotEmail}
                      className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                      {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('发送重置邮件', 'Send Reset Email')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
