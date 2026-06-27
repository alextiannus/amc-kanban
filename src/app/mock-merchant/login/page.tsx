'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, Store, AlertCircle } from 'lucide-react'

const LABEL_CLASS = 'block font-mono text-xs text-slate-400 mb-2 ml-1 uppercase tracking-wider'
const INPUT_CLASS = 'w-full bg-slate-950/60 border border-slate-800 rounded-xl py-4 pl-12 pr-12 text-slate-100 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 transition-all placeholder:text-slate-650 text-base shadow-inner'

export default function MockMerchantLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

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
        router.push('/mock-merchant')
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

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-slate-950 overflow-hidden text-slate-100 p-4 md:p-8 font-sans">
      {/* Background Glows and Grid */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-orange-600/10 rounded-full blur-[120px] animate-pulse duration-[8000ms]"></div>
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px] animate-pulse duration-[10000ms]"></div>
        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] bg-center"></div>
      </div>

      {/* Main Glass Container */}
      <main className="relative z-10 w-full max-w-[460px] bg-slate-900/60 border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl p-8 md:p-10 flex flex-col">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-orange-600/10 border border-orange-500/20 flex items-center justify-center shadow-lg shadow-orange-950/20 mb-4">
            <Store className="h-6 w-6 text-orange-500" />
          </div>
          <h1 className="font-extrabold text-3xl mb-2 text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-400 to-indigo-400 tracking-tight">
            AMC-MM
          </h1>
          <p className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
            Merchant Simulator Login
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-950/80 p-1 rounded-full mb-8 relative border border-slate-850">
          <Link
            href="/mock-merchant/login"
            className="flex-1 py-3 text-center rounded-full font-semibold text-sm transition-all bg-slate-900 text-slate-100 shadow-sm border border-slate-800/80"
          >
            Sign In
          </Link>
          <Link
            href="/mock-merchant/register"
            className="flex-1 py-3 text-center rounded-full font-semibold text-sm transition-all text-slate-400 hover:text-slate-200"
          >
            Create Account
          </Link>
        </div>

        {/* Form */}
        <form className="space-y-6" onSubmit={handleLogin}>
          {/* Email Field */}
          <div>
            <label className={LABEL_CLASS} htmlFor="email">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 h-5 w-5" />
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className={INPUT_CLASS}
                placeholder="merchant@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <div className="flex justify-between items-center mb-2 ml-1 mr-1">
              <label className={LABEL_CLASS} htmlFor="password">Password</label>
              <span className="font-mono text-[10px] text-slate-550 select-none">Forgot? Contact Admin</span>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 h-5 w-5" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                className={INPUT_CLASS}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="text-rose-400 bg-rose-950/20 border border-rose-900/50 rounded-xl py-3.5 px-4 text-xs font-semibold text-center shadow-sm flex items-center justify-center gap-2 animate-pulse">
              <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-4 rounded-xl bg-gradient-to-r from-orange-600 to-indigo-600 text-white font-bold text-base shadow-lg shadow-indigo-950/50 hover:shadow-indigo-900/60 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Enter Merchant Dashboard
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">
            SIMULATOR ENVIRONMENT • SECURED WITH SSO
          </p>
        </div>
      </main>
    </div>
  )
}
