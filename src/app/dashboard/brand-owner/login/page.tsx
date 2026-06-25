'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, User, Globe, Phone, ArrowRight, Loader2, Store } from 'lucide-react'

const LABEL_CLASS = 'block font-jetbrains text-xs text-slate-500 mb-2 ml-1'
const INPUT_CLASS = 'w-full bg-slate-50 border border-slate-200 rounded-lg py-4 pl-12 pr-4 text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 font-hanken text-base shadow-sm'

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
        setError(data.error || '登录失败')
      }
    } catch {
      setError('发生未知错误')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('密码不匹配')
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
        setError(data.error || '注册失败')
      }
    } catch {
      setError('发生未知错误')
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-650" />
          <p className="text-sm font-medium">正在检查会话...</p>
        </div>
      </div>
    )
  }

  const isRegister = mode === 'register'

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-[#F8FAFC] overflow-hidden text-slate-800 p-4">
      {/* Background aurora glows and grid */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-200/40 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-purple-200/40 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.4] bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:40px_40px] bg-center z-1"></div>
      </div>

      {/* Center Card */}
      <main className="relative z-10 w-full max-w-[480px] bg-white/80 border border-slate-200/80 rounded-3xl shadow-2xl backdrop-blur-md p-8 md:p-10">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-sm mb-4">
            <Store className="h-6 w-6 text-indigo-600" />
          </div>
          <h2 className="font-manrope font-bold text-2xl text-slate-800 text-center">AMC 品牌主控制台</h2>
          <p className="font-hanken text-xs text-slate-500 tracking-wide mt-1">品牌主自主化运营工作台</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-100/80 p-1 rounded-full mb-8 relative border border-slate-200/50">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2.5 text-center rounded-full font-hanken font-semibold text-sm transition-all relative z-10 cursor-pointer ${
              !isRegister ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2.5 text-center rounded-full font-hanken font-semibold text-sm transition-all relative z-10 cursor-pointer ${
              isRegister ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            创建账户
          </button>
        </div>

        {/* Form */}
        <form className="space-y-5" onSubmit={isRegister ? handleRegister : handleLogin}>
          {/* Nickname for Registration */}
          {isRegister && (
            <div>
              <label className={LABEL_CLASS} htmlFor="nickname">名称 / 别名</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                <input
                  id="nickname"
                  type="text"
                  required
                  className={INPUT_CLASS}
                  placeholder="您的名称"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Email Field */}
          <div>
            <label className={LABEL_CLASS} htmlFor="email">邮箱地址</label>
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
            <label className={LABEL_CLASS} htmlFor="password">密码</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-4 pl-12 pr-12 text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 font-hanken text-base shadow-sm"
                placeholder={isRegister ? '至少 8 位字符' : '••••••••'}
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
                <label className={LABEL_CLASS} htmlFor="confirm-password">确认密码</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-4 pl-12 pr-12 text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 font-hanken text-base shadow-sm"
                    placeholder="请再次输入密码"
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
                <label className={LABEL_CLASS} htmlFor="country">国家 / 地区</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                  <input
                    id="country"
                    type="text"
                    required
                    className={INPUT_CLASS}
                    placeholder="例如 新加坡"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
              </div>

              {/* Phone Field */}
              <div>
                <label className={LABEL_CLASS} htmlFor="phone">电话号码</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                  <input
                    id="phone"
                    type="tel"
                    required
                    className={INPUT_CLASS}
                    placeholder="例如 +6588888888"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Error Banner */}
          {error && (
            <div className="text-red-500 text-xs text-center font-medium font-hanken">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-4 rounded-lg bg-indigo-600 text-white font-manrope font-bold text-base shadow-lg shadow-indigo-100 hover:shadow-indigo-200/80 active:scale-[0.98] disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 group cursor-pointer hover:bg-indigo-700"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                {isRegister ? '注册并登录控制台' : '进入控制台'}
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </main>
    </div>
  )
}
