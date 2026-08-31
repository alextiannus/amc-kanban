'use client'

/**
 * EditUserModal.tsx — 用户编辑弹窗（仅 Admin 可见）
 * ──────────────────────────────────────────────────────────────────────────────
 * 可编辑字段：昵称（nickname）、邮箱（email）、系统角色（role）
 */

import { useState, useEffect } from 'react'
import { X, Save, AlertCircle, CheckCircle2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditableUser {
  id: string
  email: string
  nickname: string | null
  role: string
  type: string
  businessRoles?: Array<{ role: string }>
}

interface EditUserModalProps {
  user: EditableUser | null
  onClose: () => void
  onSaved: (updated: EditableUser) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditUserModal({ user, onClose, onSaved }: EditUserModalProps) {
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'USER'>('USER')
  const [businessRoles, setBusinessRoles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (user) {
      setEmail(user.email)
      setNickname(user.nickname ?? '')
      setRole((user.role === 'ADMIN' ? 'ADMIN' : 'USER') as 'ADMIN' | 'USER')
      setBusinessRoles((user.businessRoles || []).map((item) => item.role))
      setError(null)
      setSuccess(false)
    }
  }, [user])

  if (!user) return null

  const handleSave = async () => {
    setError(null)
    setSuccess(false)

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('请输入有效的邮箱地址')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          nickname: nickname.trim() || null,
          role,
          businessRoles,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '保存失败')
        return
      }

      setSuccess(true)
      onSaved({
        ...user,
        email: email.trim().toLowerCase(),
        nickname: nickname.trim() || null,
        role,
        businessRoles: businessRoles.map((item) => ({ role: item })),
      })
      setTimeout(onClose, 1000)
    } catch {
      setError('网络请求失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md mx-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">编辑用户</h2>
            <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              邮箱地址
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
              placeholder="user@example.com"
            />
          </div>

          {/* Nickname */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              昵称（可选）
            </label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
              placeholder="用户昵称"
            />
          </div>

          {/* Role — only editable for HUMAN type */}
          {user.type === 'HUMAN' && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                系统角色
              </label>
              <div className="flex gap-3">
                {(['USER', 'ADMIN'] as const).map(r => (
                  <label
                    key={r}
                    className={`flex-1 flex items-center gap-2.5 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                      role === r
                        ? r === 'ADMIN'
                          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-400 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r}
                      checked={role === r}
                      onChange={() => setRole(r)}
                      className="sr-only"
                    />
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                      role === r ? (r === 'ADMIN' ? 'border-indigo-500' : 'border-slate-500') : 'border-slate-300'
                    }`}>
                      {role === r && <div className={`w-1.5 h-1.5 rounded-full ${r === 'ADMIN' ? 'bg-indigo-500' : 'bg-slate-500'}`} />}
                    </div>
                    <div>
                      <div className="text-xs font-semibold">{r === 'ADMIN' ? 'Admin' : 'User'}</div>
                      <div className="text-[10px] opacity-60">{r === 'ADMIN' ? '系统管理员' : '普通用户'}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {user.type === 'HUMAN' && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                业务角色
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['BRAND_OWNER', '品牌主'],
                  ['AMC_PRINCIPAL', '主理人'],
                  ['BD', 'BD'],
                  ['RESEARCHER', 'Researcher'],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-650 dark:border-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={businessRoles.includes(value)}
                      onChange={() => setBusinessRoles((prev) => (
                        prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
                      ))}
                      className="accent-blue-600"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800/50">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800/50">
              <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
              <p className="text-xs text-green-600 dark:text-green-400">保存成功！</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition"
          >
            {saving ? (
              <span className="animate-spin">⟳</span>
            ) : (
              <Save size={14} />
            )}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
