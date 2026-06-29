'use client'

/**
 * EmailConfigPanel.tsx — SMTP 邮件配置管理面板（Admin System 标签页）
 * ──────────────────────────────────────────────────────────────────────────────
 * 功能：
 *   1. 显示当前 SMTP 配置状态（是否已配置）
 *   2. 配置 SMTP Host/Port/User/Password/From/FromName/TLS
 *   3. 保存配置
 *   4. 发送测试邮件
 */

import { useState } from 'react'
import { Mail, Send, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SmtpFields {
  smtpHost: string
  smtpPort: number | null
  smtpUser: string
  smtpPassword: string
  smtpFrom: string
  smtpFromName: string
  smtpSecure: boolean
  smtpConfigured: boolean
}

interface EmailConfigPanelProps {
  config: SmtpFields | null
  onSaved: (updated: SmtpFields) => void
}

// ─── Sub-component: Input field ───────────────────────────────────────────────

function ConfigInput({
  label, value, onChange, type = 'text', placeholder, hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
}) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">
        {label}
      </label>
      <div className="relative">
        <input
          type={isPassword && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 pr-8 transition"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EmailConfigPanel({ config, onSaved }: EmailConfigPanelProps) {
  const [host, setHost] = useState(config?.smtpHost ?? '')
  const [port, setPort] = useState(String(config?.smtpPort ?? '465'))
  const [user, setUser] = useState(config?.smtpUser ?? '')
  const [password, setPassword] = useState(config?.smtpPassword ?? '')
  const [from, setFrom] = useState(config?.smtpFrom ?? '')
  const [fromName, setFromName] = useState(config?.smtpFromName ?? '')
  const [secure, setSecure] = useState<boolean>(config?.smtpSecure ?? true)

  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const isConfigured = !!(config?.smtpConfigured)

  const handleSave = async () => {
    setSaving(true)
    setSaveResult(null)
    try {
      const res = await fetch('/api/admin/system-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: host,
          smtpPort: parseInt(port, 10) || null,
          smtpUser: user,
          smtpPassword: password,
          smtpFrom: from,
          smtpFromName: fromName,
          smtpSecure: secure,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSaveResult({ ok: true, message: '邮件配置已保存' })
        onSaved({
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          smtpUser: data.smtpUser,
          smtpPassword: data.smtpPassword,
          smtpFrom: data.smtpFrom,
          smtpFromName: data.smtpFromName,
          smtpSecure: data.smtpSecure,
          smtpConfigured: data.smtpConfigured,
        })
      } else {
        setSaveResult({ ok: false, message: data.error ?? '保存失败' })
      }
    } catch {
      setSaveResult({ ok: false, message: '网络请求失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    if (!testEmail.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult({ ok: true, message: `测试邮件已发送至 ${testEmail}` })
      } else {
        setTestResult({ ok: false, message: data.error ?? '发送失败' })
      }
    } catch {
      setTestResult({ ok: false, message: '请求失败，请检查网络' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Mail size={16} className="text-blue-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            邮件发送配置
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            配置 SMTP 后，密码重置等通知将自动发送至用户邮箱。
            {isConfigured
              ? <span className="ml-1 text-emerald-500 font-semibold">● 已配置</span>
              : <span className="ml-1 text-amber-500 font-semibold">● 未配置</span>}
          </p>
        </div>
      </div>

      {/* SMTP Fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <ConfigInput
            label="SMTP 服务器"
            value={host}
            onChange={setHost}
            placeholder="smtp.gmail.com"
            hint="常用：smtp.gmail.com / smtp.office365.com / smtp.qq.com"
          />
        </div>
        <ConfigInput
          label="端口"
          value={port}
          onChange={setPort}
          placeholder="465"
          hint="SSL: 465 / STARTTLS: 587"
        />
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">
            加密方式
          </label>
          <div className="flex gap-2 mt-1">
            {([true, false] as const).map(s => (
              <label
                key={String(s)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer transition ${
                  secure === s
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="smtpSecure"
                  checked={secure === s}
                  onChange={() => setSecure(s)}
                  className="sr-only"
                />
                {s ? 'SSL/TLS' : 'STARTTLS'}
              </label>
            ))}
          </div>
        </div>
        <ConfigInput
          label="SMTP 用户名"
          value={user}
          onChange={setUser}
          placeholder="your@gmail.com"
        />
        <ConfigInput
          label="SMTP 密码"
          value={password}
          onChange={setPassword}
          type="password"
          placeholder="应用专用密码"
          hint="Gmail 需使用应用专用密码"
        />
        <ConfigInput
          label="发件人邮箱"
          value={from}
          onChange={setFrom}
          placeholder="noreply@yourapp.com"
        />
        <ConfigInput
          label="发件人名称"
          value={fromName}
          onChange={setFromName}
          placeholder="AMC Staff"
        />
      </div>

      {/* Save result */}
      {saveResult && (
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs ${
          saveResult.ok
            ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400'
        }`}>
          {saveResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {saveResult.message}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center gap-2"
      >
        {saving ? <span className="animate-spin">⟳</span> : null}
        {saving ? '保存中...' : '保存配置'}
      </button>

      {/* Test email */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
          发送测试邮件
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="收件人邮箱"
            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
          />
          <button
            onClick={handleTestEmail}
            disabled={testing || !testEmail.trim() || !isConfigured}
            title={!isConfigured ? '请先保存 SMTP 配置' : undefined}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition"
          >
            {testing ? <span className="animate-spin">⟳</span> : <Send size={14} />}
            {testing ? '发送中...' : '发送'}
          </button>
        </div>
        {testResult && (
          <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
            testResult.ok
              ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400'
          }`}>
            {testResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  )
}
