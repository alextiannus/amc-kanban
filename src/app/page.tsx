'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, User, Globe, Phone, ArrowRight, Loader2, Sparkles, MessageSquare, MapPin, AlertCircle } from 'lucide-react'

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
        router.push('/board')
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
        router.push('/board')
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
                  <h2 className="font-manrope font-semibold text-lg text-slate-800">Autopilot Console</h2>
                  <p className="font-hanken text-xs text-slate-500">Autonomous marketing agent logs</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10B981]"></div>
                <span className="font-jetbrains text-[10px] text-emerald-700 tracking-wider font-semibold">LIVE ACTIVE</span>
              </div>
            </div>

            {/* Live Feed Section */}
            <div className="space-y-4">
              <h3 className="font-jetbrains text-xs text-slate-400 uppercase tracking-wider">Active Agent Response</h3>
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
                          <span className="font-jetbrains text-[9px] text-emerald-700 uppercase font-semibold">Auto-Reply Submitted</span>
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
                Sign In / 登录
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`flex-1 py-3 text-center rounded-full font-hanken font-semibold text-sm transition-all relative z-10 ${
                  isRegister ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Sign Up / 注册
              </button>
            </div>

            {/* Form */}
            <form className="space-y-6" onSubmit={isRegister ? handleRegister : handleLogin}>
              {/* Nickname Field (Register only) */}
              {isRegister && (
                <div>
                  <label className={LABEL_CLASS} htmlFor="nickname">Name / 您的姓名或昵称</label>
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
                <label className={LABEL_CLASS} htmlFor="email">Email Address / 电子邮箱</label>
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
                  <label className={LABEL_CLASS} htmlFor="phone">Phone Number / 联系电话</label>
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
                  <label className={LABEL_CLASS} htmlFor="country">Country / City (所在城市)</label>
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
                  <label className="block font-jetbrains text-xs text-slate-500" htmlFor="password">Password / 密码</label>
                  {!isRegister && (
                    <a className="font-jetbrains text-xs text-purple-600 hover:text-purple-700 transition-colors hover:underline" href="#">Forgot?</a>
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
                    placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
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
                  <label className={LABEL_CLASS} htmlFor="confirm-password">Confirm Password / 确认密码</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-4 pl-12 pr-12 text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600/50 transition-all placeholder:text-slate-400 font-hanken text-base shadow-sm"
                      placeholder="Confirm password"
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
                    Meet Your AI Staff
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="font-jetbrains text-[10px] text-slate-400 uppercase tracking-wider">
                powered by <span className="text-slate-700">Immedi.ai</span>
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

