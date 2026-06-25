'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, User, Globe, Phone, ArrowRight, Loader2, Sparkles, Store } from 'lucide-react'

const LABEL_CLASS = 'block font-jetbrains text-xs text-slate-500 mb-2 ml-1'
const INPUT_CLASS = 'w-full bg-slate-50 border border-slate-200 rounded-lg py-4 pl-12 pr-4 text-slate-800 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600/50 transition-all placeholder:text-slate-400 font-hanken text-base shadow-sm'

export default function BrandOwnerLogin() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [country, setCountry] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const router = useRouter()

  const [terminalLines, setTerminalLines] = useState<string[]>([
    '[08:00] REFRESH: Syncing merchant profile settings',
    '[09:30] ASSETS: Auto-categorizing new catalog photos',
    '[11:00] PUBLISH: Scheduling weekly menu promotion to RedNote',
    '[13:15] ANALYSIS: Auto-reply submitted to Google Maps reviews',
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

  // Check if session already exists on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const user = await res.json()
          if (user && user.id) {
            router.push('/dashboard/brand-owner')
            return
          }
        }
      } catch (e) {
        console.error('Session check failed', e)
      } finally {
        setCheckingSession(false)
      }
    }
    void checkSession()
  }, [router])

  useEffect(() => {
    let index = 0
    const taskPool = [
      'REFRESH: Syncing merchant profile settings',
      'AUDIT: Checking brand context completeness: 95%',
      'RESEARCH: Scanning competitive local eatery profiles',
      'ASSETS: Extracting text from uploaded menus (OCR)',
      'PUBLISH: Scheduling weekly menu promotion to RedNote',
      'PUBLISH: Formatting Instagram reel tags (draft_882)',
      'MONITOR: Fetching Google Maps Business feedback metrics',
      'REVIEW: Drafting reply to recent 5-star customer feedback',
      'ANALYZE: Generating weekly engagement summary',
      'KOL: Matching local influencers for food tasting event',
    ]

    const interval = setInterval(() => {
      const now = new Date()
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      const line = `[${timeStr}] ${taskPool[index % taskPool.length]}`
      setTerminalLines(prev => [...prev.slice(-12), line])
      index++
    }, 4500)
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
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push('/dashboard/brand-owner')
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
        router.push('/dashboard/brand-owner')
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

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          <p className="text-sm font-medium">Checking session...</p>
        </div>
      </div>
    )
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
        {/* Left Side: Brand Owner Console */}
        <section className="hidden md:flex flex-1 flex-col bg-slate-50/50 p-8 lg:p-10 border-r border-slate-200/60 justify-between">
          <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-sm">
                  <Store className="h-5 w-5 text-indigo-500" />
                </div>
                <div>
                  <h2 className="font-manrope font-semibold text-lg text-slate-800">Merchant Portal</h2>
                  <p className="font-hanken text-xs text-slate-500">Brand Owner autonomous workspace</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10B981]"></div>
                <span className="font-jetbrains text-[10px] text-emerald-700 tracking-wider font-semibold">PORTAL ONLINE</span>
              </div>
            </div>

            {/* Merchant Dashboard Preview Card */}
            <div className="space-y-4">
              <h3 className="font-jetbrains text-xs text-slate-400 uppercase tracking-wider">AI Marketing Employee</h3>
              <div className="bg-white border border-slate-200/80 p-6 rounded-2xl relative overflow-hidden shadow-sm">
                <div className="absolute left-0 top-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-purple-500"></div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <span className="font-jetbrains text-xs text-slate-700 font-semibold">AI Assistant</span>
                </div>
                <p className="font-hanken text-sm text-slate-800 leading-relaxed mb-4">
                  Hello, Chef! I am ready to publish your lunch special menu promotion. Click to approve.
                </p>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex justify-between items-center text-xs">
                  <span className="text-slate-500">Autopilot Status</span>
                  <span className="font-bold text-indigo-600">L4 Auto</span>
                </div>
              </div>
            </div>
          </div>

          {/* Terminal Console */}
          <div className="flex flex-col bg-slate-100/60 border border-slate-200/80 rounded-2xl overflow-hidden mt-8 shadow-sm">
            <div className="flex items-center justify-between bg-slate-200/40 border-b border-slate-200 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/60"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/60"></div>
              </div>
              <span className="font-jetbrains text-[10px] text-slate-500 tracking-wider">MERCHANT_LOG@AMC-PORTAL</span>
              <div className="w-12"></div>
            </div>
            
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
                    case 'ASSETS': return 'text-emerald-600 font-bold'
                    case 'RESEARCH': return 'text-orange-600 font-semibold'
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

        {/* Right Side: Glassmorphic Auth Form */}
        <section className="flex-1 flex flex-col p-6 lg:p-12 justify-center items-center relative">
          <div className="w-full max-w-[440px]">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="font-manrope font-bold text-4xl mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 tracking-tight">AMC Portal</h1>
              <p className="font-jetbrains text-xs text-slate-500 uppercase tracking-[0.15em]">Brand Owner Dashboard</p>
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
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`flex-1 py-3 text-center rounded-full font-hanken font-semibold text-sm transition-all relative z-10 ${
                  isRegister ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Form */}
            <form className="space-y-6" onSubmit={isRegister ? handleRegister : handleLogin}>
              {/* Nickname for Registration */}
              {isRegister && (
                <div>
                  <label className={LABEL_CLASS} htmlFor="nickname">Name / Alias</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                    <input
                      id="nickname"
                      type="text"
                      required
                      className={INPUT_CLASS}
                      placeholder="Your name"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                    />
                  </div>
                </div>
              )}

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
                  <label className="block font-jetbrains text-xs text-slate-500" htmlFor="password">Password</label>
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

              {/* Registration Extra Fields */}
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
                        placeholder="e.g. Singapore"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Phone Field */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="phone">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                      <input
                        id="phone"
                        type="tel"
                        required
                        className={INPUT_CLASS}
                        placeholder="e.g. +6588888888"
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
                className="w-full mt-8 py-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-manrope font-bold text-lg shadow-lg shadow-indigo-100 hover:shadow-indigo-200/80 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 group"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    {isRegister ? 'Register & Enter Portal' : 'Launch Portal'}
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="font-jetbrains text-[10px] text-slate-400 uppercase tracking-wider">
                Direct Merchant Sign-in.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
