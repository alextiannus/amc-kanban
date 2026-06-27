'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, Sparkles, AlertCircle } from 'lucide-react'

const LABEL_CLASS =
  'block font-mono text-xs text-slate-500 mb-2 ml-1 uppercase tracking-wider'
const INPUT_CLASS =
  'w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-12 text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 text-sm shadow-sm'

export default function MockMerchantRegister() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const router = useRouter()

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
          nickname: '',
          country: '',
          phone: '',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push('/mock-merchant')
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

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-[#F8FAFC] overflow-hidden text-slate-800 p-4 md:p-8">
      {/* Background aurora glows */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-400/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] bg-purple-400/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.3] bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] bg-[size:40px_40px] bg-center" />
      </div>

      {/* Main Glass Container */}
      <main className="relative z-10 w-full max-w-[460px] bg-white/80 border border-slate-200/80 rounded-3xl overflow-hidden shadow-2xl shadow-slate-200/60 backdrop-blur-md p-8 md:p-10 flex flex-col">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-sm mb-4">
            <Sparkles className="h-5 w-5 text-indigo-500" />
          </div>
          <h1 className="font-bold text-3xl mb-1.5 text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 tracking-tight">
            AMC-MM
          </h1>
          <p className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
            Merchant Simulator
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-100/80 p-1 rounded-full mb-8 relative border border-slate-200/50">
          <Link
            href="/mock-merchant/login"
            className="flex-1 py-2.5 text-center rounded-full font-semibold text-sm transition-all text-slate-500 hover:text-slate-800"
          >
            Meet Your AI Staff
          </Link>
          <Link
            href="/mock-merchant/register"
            className="flex-1 py-2.5 text-center rounded-full font-semibold text-sm transition-all bg-white text-slate-800 shadow-sm border border-slate-200/60"
          >
            Meet Your AI Staff
          </Link>
        </div>

        {/* Form */}
        <form className="space-y-5" onSubmit={handleRegister}>
          {/* Email Field */}
          <div>
            <label className={LABEL_CLASS} htmlFor="email">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
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
            <label className={LABEL_CLASS} htmlFor="password">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                className={INPUT_CLASS}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password Field */}
          <div>
            <label className={LABEL_CLASS} htmlFor="confirm-password">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                className={INPUT_CLASS}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3.5 py-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm shadow-lg shadow-indigo-100 hover:shadow-indigo-200/80 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Meet Your AI Staff
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="font-mono text-[9px] text-slate-400 uppercase tracking-widest">
            powered by Immedi.ai
          </p>
        </div>
      </main>
    </div>
  )
}
