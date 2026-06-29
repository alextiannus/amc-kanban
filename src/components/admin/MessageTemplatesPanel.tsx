'use client'

import React, { useState, useEffect } from 'react'
import { Mail, Edit, CheckCircle, AlertCircle, Play, Save, Info, RefreshCw, FileText } from 'lucide-react'

interface MessageTemplate {
  id: string
  name: string
  description: string | null
  subject: string
  html: string
  text: string | null
  placeholders: string
  updatedAt: string
  updatedBy: string | null
}

export default function MessageTemplatesPanel() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // Form State
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [text, setText] = useState('')

  // Toast / Status Alerts
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testStatus, setTestStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Fetch templates on load
  const loadTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/message-templates')
      if (!res.ok) throw new Error('Failed to load templates')
      const data = await res.json()
      setTemplates(data)
      if (data.length > 0) {
        const first = data[0]
        setSelectedId(first.id)
        setSubject(first.subject)
        setHtml(first.html)
        setText(first.text || '')
      }
    } catch (err) {
      console.error('Error fetching templates:', err)
      setStatus({ type: 'error', message: '获取消息模板失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  // Update form fields when selected template changes
  const handleSelectTemplate = (id: string) => {
    const found = templates.find(t => t.id === id)
    if (found) {
      setSelectedId(id)
      setSubject(found.subject)
      setHtml(found.html)
      setText(found.text || '')
      setStatus(null)
      setTestStatus(null)
    }
  }

  // Save modified template
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/admin/message-templates/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html, text })
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Failed to update')
      }

      const updated = await res.json()
      // Update local state
      setTemplates(prev => prev.map(t => t.id === selectedId ? updated : t))
      setStatus({ type: 'success', message: '通知模板保存成功！' })
    } catch (err: any) {
      console.error('Save template failed:', err)
      setStatus({ type: 'error', message: err?.message || '保存模板失败，请重试' })
    } finally {
      setSaving(false)
    }
  }

  // Trigger test send
  const handleSendTest = async () => {
    if (!testEmail) {
      setTestStatus({ type: 'error', message: '请输入测试接收邮箱' })
      return
    }
    setTesting(true)
    setTestStatus(null)
    try {
      const res = await fetch(`/api/admin/message-templates/${selectedId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: testEmail })
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Send test failed')
      }

      setTestStatus({ type: 'success', message: `测试邮件成功发送至 ${testEmail}！` })
    } catch (err: any) {
      console.error('Send test failed:', err)
      setTestStatus({ type: 'error', message: err?.message || '发送测试邮件失败，请确认SMTP配置' })
    } finally {
      setTesting(false)
    }
  }

  const selectedTemplate = templates.find(t => t.id === selectedId)

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-xs text-slate-400 font-bold dark:text-slate-500">正在载入通知模板...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[500px]">
      {/* Sidebar - Template selection */}
      <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2.5">
        <h3 className="text-xs font-black text-slate-450 dark:text-slate-550 uppercase tracking-widest px-1">
          通知模版清单
        </h3>
        <div className="space-y-1">
          {templates.map((t) => {
            const isSelected = t.id === selectedId
            return (
              <button
                key={t.id}
                onClick={() => handleSelectTemplate(t.id)}
                className={`w-full flex items-start gap-3 p-3.5 rounded-2xl text-left border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-black shadow-md shadow-indigo-500/5'
                    : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-900/20 text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs truncate">{t.name}</p>
                  <span className="text-[9px] font-mono opacity-60 uppercase">{t.id}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Content Area - Editor */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
        {selectedTemplate ? (
          <>
            {/* Header info */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-slate-150 dark:border-slate-800">
              <div>
                <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <span>{selectedTemplate.name}</span>
                  <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-bold text-slate-500 uppercase">
                    {selectedTemplate.id}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">{selectedTemplate.description}</p>
              </div>
              <div className="text-left sm:text-right shrink-0">
                <span className="text-[9px] font-bold text-slate-400">
                  上次更新: {selectedTemplate.updatedBy || '无记录'}
                </span>
                <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                  {new Date(selectedTemplate.updatedAt).toLocaleString('zh-CN')}
                </p>
              </div>
            </div>

            {/* Placeholders helper */}
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-150 dark:border-slate-800 flex items-start gap-3">
              <Info className="w-4.5 h-4.5 text-indigo-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  支持占位符变量
                </h4>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedTemplate.placeholders.split(',').map((p) => (
                    <code
                      key={p}
                      className="text-[9px] font-black bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 px-2 py-0.5 rounded-lg border border-indigo-100/40"
                    >
                      {"{{"}{p}{"}}"}
                    </code>
                  ))}
                </div>
              </div>
            </div>

            {/* Editor Form */}
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500">邮件主题 (Subject)</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-sm focus:border-indigo-500 focus:outline-none dark:text-white transition-all font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 flex flex-col h-[340px]">
                  <label className="text-xs font-black text-slate-500 shrink-0">HTML 内容 (HTML Body)</label>
                  <textarea
                    required
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    className="flex-1 w-full p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-xs font-mono focus:border-indigo-500 focus:outline-none dark:text-white transition-all resize-none"
                    placeholder="请输入 HTML 内容..."
                  />
                </div>

                <div className="space-y-1.5 flex flex-col h-[340px]">
                  <label className="text-xs font-black text-slate-500 shrink-0">纯文本内容备用 (Plain Text)</label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="flex-1 w-full p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-xs font-mono focus:border-indigo-500 focus:outline-none dark:text-white transition-all resize-none"
                    placeholder="请输入纯文本内容（用于邮件客户端不支持HTML时显示）..."
                  />
                </div>
              </div>

              {/* Status Alert */}
              {status && (
                <div
                  className={`p-3 rounded-2xl flex items-start gap-2.5 text-xs font-bold ${
                    status.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-100 dark:border-emerald-900/30'
                      : 'bg-rose-50 dark:bg-rose-950/20 text-rose-650 border border-rose-100 dark:border-rose-900/30'
                  }`}
                >
                  {status.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{status.message}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-500/10 transition-all cursor-pointer"
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{saving ? '正在保存...' : '保存模板修改'}</span>
                </button>
              </div>
            </form>

            {/* Test Send Section */}
            <div className="border-t border-slate-150 dark:border-slate-800 pt-6 mt-2 space-y-4">
              <div>
                <h3 className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <Play size={13} className="text-emerald-500" />
                  <span>发送测试通知邮件</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">
                  使用模拟参数填充上述占位符并发送至您的邮箱，可实时测试邮件网关配置与模板呈现样式。
                </p>
              </div>

              <div className="flex gap-3 max-w-md">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="请输入您的测试邮箱地址"
                  className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-xs focus:border-indigo-500 focus:outline-none dark:text-white transition-all font-semibold"
                />
                <button
                  onClick={handleSendTest}
                  disabled={testing}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-650 hover:bg-emerald-600 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-500/10 transition-all cursor-pointer"
                >
                  {testing ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Mail className="w-3 h-3" />
                  )}
                  <span>{testing ? '发送中...' : '发送测试'}</span>
                </button>
              </div>

              {testStatus && (
                <div
                  className={`p-3 rounded-2xl flex items-start gap-2.5 text-[10px] font-bold max-w-md ${
                    testStatus.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-100 dark:border-emerald-900/30'
                      : 'bg-rose-50 dark:bg-rose-950/20 text-rose-650 border border-rose-100 dark:border-rose-900/30'
                  }`}
                >
                  {testStatus.type === 'success' ? (
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  )}
                  <span>{testStatus.message}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="py-20 text-center text-slate-400 font-bold text-xs">
            暂无模板，请先刷新或检查配置。
          </div>
        )}
      </div>
    </div>
  )
}
