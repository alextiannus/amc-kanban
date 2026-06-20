'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, User, Globe, Phone, ArrowRight, Loader2, Sparkles, MessageSquare, Instagram, MapPin, Facebook } from 'lucide-react'

const LABEL_CLASS = 'block font-jetbrains text-xs text-slate-400 mb-2 ml-1'
const INPUT_CLASS = 'w-full bg-white/5 border border-white/10 rounded-lg py-4 pl-12 pr-4 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-slate-500 font-hanken text-base'

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
    '[11:30] REVIEW: Replying to 4 reviews on Google Maps',
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
      platform: 'Google Maps',
      user: 'Sarah Jenkins',
      comment: 'Amazing neighborhood gem! Will come back.',
      reply: 'Thanks for the support! Glad you enjoyed the flavors.',
      time: '2m ago',
      color: 'from-blue-500 to-cyan-500',
    },
  ])

  const terminalEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
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
      'REVIEW: Replying to 4 reviews on Google Maps',
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
        platform: 'Google Maps',
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
        router.push('/board/subscription')
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
        return <Instagram className="h-4 w-4 text-pink-400" />
      case 'Google Maps':
        return <MapPin className="h-4 w-4 text-blue-400" />
      case 'Facebook':
        return <Facebook className="h-4 w-4 text-blue-600" />
      default:
        return <MessageSquare className="h-4 w-4 text-red-500" />
    }
  }

  const isRegister = mode === 'register'

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-[#030712] overflow-hidden text-slate-200 p-4 md:p-8">
      {/* Background aurora glows and grid */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="aurora-glow-1"></div>
        <div className="aurora-glow-2"></div>
        <div className="absolute inset-0 opacity-[0.25] bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] bg-center z-1"></div>
        <div className="absolute inset-0 bg-black/40 mix-blend-multiply z-2"></div>
      </div>

      {/* Main Container */}
      <main className="relative z-10 w-full max-w-[1280px] bg-slate-900/40 border border-white/5 rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-2xl backdrop-blur-md min-h-[750px]">
        {/* Left Side: Autopilot Console */}
        <section className="hidden md:flex flex-1 flex-col bg-slate-950/60 p-8 lg:p-10 border-r border-white/5 justify-between">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shadow-lg">
                  <Sparkles className="h-5 w-5 text-indigo-400" />
                </div>
                <h2 className="font-manrope font-semibold text-lg text-white">Autopilot Console</h2>
              </div>
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10B981]"></div>
                <span className="font-jetbrains text-[10px] text-emerald-400 tracking-wider font-semibold">LIVE ACTIVE</span>
              </div>
            </div>

            {/* Live Feed Section */}
            <div className="space-y-6">
              <h3 className="font-jetbrains text-xs text-slate-400 uppercase tracking-wider">Live Interaction Feed</h3>
              <div className="space-y-4">
                {commentsList.map((c, i) => (
                  <div key={i} className="bg-white/[0.02] border border-white/[0.06] p-5 rounded-xl relative overflow-hidden transition-all duration-500 animate-card-slide-in">
                    {/* Platform stripe indicator */}
                    <div className={`absolute left-0 top-0 w-1 h-full bg-gradient-to-b ${c.color}`}></div>
                    <div className="flex items-center gap-2 mb-3">
                      {renderPlatformIcon(c.platform)}
                      <span className="font-jetbrains text-[11px] text-slate-300 font-medium">{c.platform}</span>
                      <span className="font-jetbrains text-[10px] text-slate-500 ml-auto">{c.time}</span>
                    </div>
                    <div className="mb-3">
                      <p className="font-hanken text-sm text-slate-200"><span className="font-semibold text-white">{c.user}</span>: {c.comment}</p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5 flex gap-3 items-start">
                      <div className="w-5 h-5 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="h-3 w-3 text-indigo-400" />
                      </div>
                      <p className="font-hanken text-xs text-emerald-400 leading-relaxed">{c.reply}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Terminal Log */}
          <div className="h-44 bg-black/40 border border-white/5 rounded-xl p-4 font-jetbrains text-xs text-slate-400 overflow-y-auto terminal-scrollbar mt-6 relative">
            <div className="space-y-2">
              {terminalLines.map((line, idx) => {
                const time = line.substring(0, 9)
                const rest = line.substring(9)
                const spaceIdx = rest.indexOf(':')
                const type = rest.substring(0, spaceIdx)
                const msg = rest.substring(spaceIdx)
                
                const getTypeColor = (t: string) => {
                  switch (t.trim()) {
                    case 'REFRESH': return 'text-sky-400'
                    case 'PUBLISH': return 'text-purple-400'
                    case 'REVIEW': return 'text-yellow-400'
                    case 'INSIGHTS': return 'text-emerald-400 font-semibold'
                    case 'SEARCH': return 'text-amber-500'
                    case 'AUDIT': return 'text-teal-400'
                    case 'ANALYZE': return 'text-indigo-400'
                    default: return 'text-pink-400'
                  }
                }
                
                return (
                  <div key={idx} className="flex gap-2 items-start font-mono animate-terminal-line">
                    <span className="text-slate-600 select-none">{time}</span>
                    <span className={getTypeColor(type)}>{type}</span>
                    <span className="text-slate-300">{msg}</span>
                  </div>
                )
              })}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </section>

        {/* Right Side: Form (Our Obsidian Glassmorphic Login Card) */}
        <section className="flex-1 flex flex-col p-6 lg:p-12 justify-center items-center relative">
          <div className="w-full max-w-[440px]">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="font-manrope font-bold text-5xl mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-500 tracking-tight">AMC</h1>
              <p className="font-jetbrains text-xs text-slate-400 uppercase tracking-[0.15em]">AI Marketing Crew</p>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-white/5 p-1 rounded-full mb-8 relative">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-3 text-center rounded-full font-hanken font-semibold text-sm transition-all relative z-10 ${
                  !isRegister ? 'bg-white/10 text-white shadow-sm border border-white/5' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`flex-1 py-3 text-center rounded-full font-hanken font-semibold text-sm transition-all relative z-10 ${
                  isRegister ? 'bg-white/10 text-white shadow-sm border border-white/5' : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Form */}
            <form className="space-y-6" onSubmit={isRegister ? handleRegister : handleLogin}>
              {/* Email Field */}
              <div>
                <label className={LABEL_CLASS} htmlFor="email">Email Address</label>
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

              {/* Password Field */}
              <div>
                <div className="flex justify-between items-center mb-2 ml-1 mr-1">
                  <label className="block font-jetbrains text-xs text-slate-400" htmlFor="password">Password</label>
                  {!isRegister && (
                    <a className="font-jetbrains text-xs text-purple-400 hover:text-purple-300 transition-colors hover:underline" href="#">Forgot?</a>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-4 pl-12 pr-12 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-slate-500 font-hanken text-base"
                    placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Registration Fields */}
              {isRegister && (
                <>
                  {/* Confirm Password Field */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="confirm-password">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                      <input
                        id="confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        className="w-full bg-white/5 border border-white/10 rounded-lg py-4 pl-12 pr-12 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-slate-500 font-hanken text-base"
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Nickname Field */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="nickname">Nickname</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                      <input
                        id="nickname"
                        type="text"
                        required
                        className={INPUT_CLASS}
                        placeholder="Your nickname"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Country Field */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="country">Country</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                      <input
                        id="country"
                        type="text"
                        required
                        className={INPUT_CLASS}
                        placeholder="Your country"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Contact Phone Field */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="phone">Contact Phone</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                      <input
                        id="phone"
                        type="tel"
                        required
                        className={INPUT_CLASS}
                        placeholder="Contact phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Error Banner */}
              {error && (
                <div className="text-red-500 text-sm text-center font-medium font-hanken">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-8 py-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-manrope font-bold text-lg shadow-lg shadow-purple-900/30 hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 group"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    {isRegister ? 'Create Account' : 'Launch Dashboard'}
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="font-jetbrains text-[10px] text-slate-400 uppercase tracking-wider">
                Secure access via <span className="text-white">SSO</span> is enabled.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

