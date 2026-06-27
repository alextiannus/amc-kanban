'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, Sparkles, AlertCircle, User, Phone } from 'lucide-react'

const LABEL_CLASS = 'block font-mono text-xs text-slate-400 mb-2 ml-1 uppercase tracking-wider'
const INPUT_CLASS =
  'w-full bg-slate-950/60 border border-slate-800 rounded-xl py-4 pl-12 pr-12 text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600 text-base shadow-inner'

export default function BrandOwnerRegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const router = useRouter()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (password.length < 8) {
      setError('密码至少需要8位字符')
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
          nickname: nickname || '',
          country: '',
          phone: phone || '',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setError(data.error || '注册失败，请稍后重试')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-slate-950 overflow-hidden text-slate-100 p-4 md:p-8 font-sans">
      {/* Background Glows */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[140px] animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] bg-center" />
      </div>

      {/* Main Glass Container */}
      <main className="relative z-10 w-full max-w-[460px] bg-slate-900/60 border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl p-8 md:p-10 flex flex-col">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center shadow-lg shadow-indigo-950/20 mb-4">
            <Sparkles className="h-6 w-6 text-indigo-400" />
          </div>
          <h1 className="font-extrabold text-3xl mb-2 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 tracking-tight">
            品牌主控制台
          </h1>
          <p className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
            AI Marketing Crew · Brand Owner Portal
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-950/80 p-1 rounded-full mb-8 border border-slate-800">
          <Link
            href="/login"
            className="flex-1 py-3 text-center rounded-full font-semibold text-sm transition-all text-slate-400 hover:text-slate-200"
          >
            登录
          </Link>
          <Link
            href="/register"
            className="flex-1 py-3 text-center rounded-full font-semibold text-sm transition-all bg-slate-900 text-slate-100 shadow-sm border border-slate-800/80"
          >
            注册账号
          </Link>
        </div>

        {/* Form */}
        <form className="space-y-5" onSubmit={handleRegister}>
          {/* Email */}
          <div>
            <label className={LABEL_CLASS} htmlFor="email">邮箱地址 *</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 h-5 w-5" />
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className={INPUT_CLASS}
                placeholder="brand@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Nickname */}
          <div>
            <label className={LABEL_CLASS} htmlFor="nickname">品牌/昵称（可选）</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 h-5 w-5" />
              <input
                id="nickname"
                type="text"
                autoComplete="nickname"
                className={INPUT_CLASS}
                placeholder="您的品牌名称或昵称"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className={LABEL_CLASS} htmlFor="phone">联系电话（可选）</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 h-5 w-5" />
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                className={INPUT_CLASS}
                placeholder="+86 138 0000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className={LABEL_CLASS} htmlFor="password">密码 *</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 h-5 w-5" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                className={INPUT_CLASS}
                placeholder="至少8位字符"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className={LABEL_CLASS} htmlFor="confirm-password">确认密码 *</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 h-5 w-5" />
              <input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                className={INPUT_CLASS}
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="text-rose-400 bg-rose-950/20 border border-rose-900/50 rounded-xl py-3.5 px-4 text-xs font-semibold text-center shadow-sm flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            id="register-submit-btn"
            disabled={loading}
            className="w-full mt-2 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-base shadow-lg shadow-indigo-950/50 hover:shadow-indigo-900/60 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                创建品牌账号
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">
            AI MARKETING CREW · SECURED WITH SSO
          </p>
        </div>
      </main>
    </div>
  )
}
