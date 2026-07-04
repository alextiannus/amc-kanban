'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Eye, EyeOff, CheckCircle2, XCircle, Lock, Loader2 } from 'lucide-react'

type State = 'loading' | 'valid' | 'invalid' | 'submitting' | 'success'

export default function ResetPasswordPage() {
  const params = useParams()
  const router = useRouter()
  const token = params?.token as string

  const [state, setState] = useState<State>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showCf, setShowCf] = useState(false)
  const [fieldError, setFieldError] = useState('')

  const validateToken = useCallback(async () => {
    if (!token) { setState('invalid'); setErrorMsg('无效的重置链接'); return }
    try {
      const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      const data = await res.json()
      if (!res.ok) { setState('invalid'); setErrorMsg(data.error || '链接无效或已过期'); return }
      setEmail(data.email)
      setNickname(data.nickname)
      setState('valid')
    } catch {
      setState('invalid')
      setErrorMsg('网络错误，请检查连接后重试')
    }
  }, [token])

  useEffect(() => { validateToken() }, [validateToken])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldError('')

    if (password.length < 6) { setFieldError('密码长度至少 6 位'); return }
    if (password !== confirm) { setFieldError('两次输入的密码不一致'); return }

    setState('submitting')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) { setState('valid'); setFieldError(data.error || '重置失败，请重试'); return }
      setState('success')
      setTimeout(() => router.push('/'), 3000)
    } catch {
      setState('valid')
      setFieldError('网络错误，请重试')
    }
  }

  // ── Shared card wrapper ────────────────────────────────────────────────────
  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950/40 to-slate-900 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        {/* Glow */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-indigo-500/30 via-purple-500/20 to-pink-500/10 blur-xl" />
        <div className="relative bg-slate-900/90 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
          {children}
        </div>
      </div>
    </div>
  )

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 py-8 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm font-medium">正在验证重置链接…</p>
        </div>
      </Card>
    )
  }

  // ── Invalid / expired ──────────────────────────────────────────────────────
  if (state === 'invalid') {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white mb-2">链接无效</h1>
            <p className="text-sm text-slate-400">{errorMsg || '此重置链接已失效或已使用过。'}</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
          >
            返回登录页
          </button>
          <p className="text-xs text-slate-500">
            在登录页点击「忘记密码？」重新申请重置链接
          </p>
        </div>
      </Card>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (state === 'success') {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white mb-2">密码已重置！</h1>
            <p className="text-sm text-slate-400">您的密码已成功更新，即将跳转到登录页…</p>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-[progress_3s_linear_forwards]" style={{ width: '100%' }} />
          </div>
          <button onClick={() => router.push('/')} className="text-indigo-400 text-xs hover:underline">
            立即前往登录
          </button>
        </div>
      </Card>
    )
  }

  // ── Valid — show form ──────────────────────────────────────────────────────
  const isSubmitting = state === 'submitting'
  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3
  const strengthColors = ['', 'bg-red-500', 'bg-yellow-500', 'bg-emerald-500']
  const strengthLabels = ['', '太短', '一般', '强']

  return (
    <Card>
      {/* Brand header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <Lock className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">AI Marketing Crew</p>
          <h1 className="text-lg font-extrabold text-white leading-tight">重置密码</h1>
        </div>
      </div>

      <p className="text-sm text-slate-400 mb-6">
        Hi <span className="text-white font-semibold">{nickname}</span>，请为账号
        <span className="text-indigo-300 font-mono text-xs ml-1">{email}</span> 设置新密码：
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* New password */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">新密码</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldError('') }}
              placeholder="请输入新密码（至少 6 位）"
              required
              className="w-full px-4 py-3 pr-10 bg-slate-800/60 border border-white/10 rounded-xl text-white placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
            />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {/* Strength bar */}
          {password.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex gap-1">
                {[1,2,3].map((i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength ? strengthColors[strength] : 'bg-slate-700'}`} />
                ))}
              </div>
              <span className={`text-[10px] font-bold ${strength === 1 ? 'text-red-400' : strength === 2 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {strengthLabels[strength]}
              </span>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">确认密码</label>
          <div className="relative">
            <input
              type={showCf ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setFieldError('') }}
              placeholder="再次输入新密码"
              required
              className={`w-full px-4 py-3 pr-10 bg-slate-800/60 border rounded-xl text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-1 transition-all ${
                confirm && confirm !== password
                  ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/30'
                  : confirm && confirm === password
                  ? 'border-emerald-500/70 focus:border-emerald-500 focus:ring-emerald-500/30'
                  : 'border-white/10 focus:border-indigo-500 focus:ring-indigo-500/50'
              }`}
            />
            <button type="button" onClick={() => setShowCf(!showCf)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showCf ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Field error */}
        {fieldError && (
          <div className="flex items-center gap-2 text-red-400 text-xs font-medium bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <XCircle size={13} className="shrink-0" />
            <span>{fieldError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !password || !confirm}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <><Loader2 size={15} className="animate-spin" /><span>正在重置…</span></>
          ) : (
            <><Lock size={15} /><span>确认重置密码</span></>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-slate-600 mt-6">
        想起密码了？
        <button onClick={() => router.push('/')} className="text-indigo-400 hover:text-indigo-300 ml-1 underline underline-offset-2">
          返回登录
        </button>
      </p>
    </Card>
  )
}
