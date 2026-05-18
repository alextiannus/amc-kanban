'use client'
import React, { useState, useEffect } from 'react'
import {
  Settings, ChevronDown, ChevronUp, Save, Loader2, CheckCircle2,
  Bot, FileText
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── Integration field types ──────────────────────────────────────────────────
interface IntegrationField {
  key: string
  label: string
  placeholder: string
  type?: 'password' | 'text' | 'url'
  helpText?: string
}

const POSTFAST_FIELDS: IntegrationField[] = [
  { key: 'postfastApiKey', label: 'PostFast API Key', placeholder: '••••••••', type: 'password', helpText: '用于自动发布内容到各社交平台' },
]

const GOOGLE_FIELDS: IntegrationField[] = [
  { key: 'googlePlaceId', label: 'Google Place ID', placeholder: 'ChIJ...', type: 'text', helpText: '在 Google Maps 中找到您的 Place ID' },
  { key: 'googleApiKey', label: 'Google API Key', placeholder: '••••••••', type: 'password', helpText: '启用 Places API + My Business API' },
]

const LARK_FIELDS: IntegrationField[] = [
  { key: 'larkAppId', label: 'Lark App ID', placeholder: 'cli_...', type: 'text' },
  { key: 'larkAppSecret', label: 'Lark App Secret', placeholder: '••••••••', type: 'password' },
  { key: 'larkParentFolderToken', label: '根目录文件夹 Token', placeholder: 'PbugfutjllCDM0dqMiIlN0orgZd', type: 'text', helpText: '品牌 Workspace 将自动创建于此文件夹下（默认：Immedi.ai / AI Workspaces）' },
  { key: 'larkBotWebhook', label: 'Bot Webhook URL', placeholder: 'https://open.larksuite.com/...', type: 'url', helpText: '老板通知 Webhook（自定义机器人）' },
  { key: 'larkOwnerId', label: '老板 Lark open_id', placeholder: 'ou_...', type: 'text', helpText: '接收私信通知的飞书账号 ID' },
]

interface BrandAgent {
  id: string
  role: string
  active: boolean
  agent: {
    id: string
    nickname?: string | null
    email: string
    avatar?: string | null
    themeColor?: string | null
    introduction?: string | null
  }
}

interface Props {
  brandId: string
  initialSettings?: Record<string, any>
}

export function BrandSettingsPanel({ brandId, initialSettings }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'profile' | 'integrations' | 'agents'>('profile')

  // Integration form state
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Record<string, boolean>>({})

  // Agent list
  const [agents, setAgents] = useState<BrandAgent[]>([])

  // Seed form from initialSettings
  useEffect(() => {
    if (initialSettings) {
      setStatus({
        postfast: !!initialSettings.postfastConfigured,
        google: !!initialSettings.googleConfigured,
        lark: !!initialSettings.larkConfigured,
      })
    }
  }, [initialSettings])

  useEffect(() => {
    if (!open) return
    if (tab === 'integrations') fetchStatus()
    if (tab === 'agents') fetchAgents()
  }, [open, tab])

  const fetchStatus = async () => {
    const res = await fetch(`/api/integrations/status?brandId=${brandId}`)
    if (res.ok) {
      const data = await res.json()
      const s: Record<string, boolean> = {}
      data.statuses?.forEach((st: any) => { s[st.name] = st.ok })
      setStatus(s)
    }
  }

  const fetchAgents = async () => {
    const res = await fetch(`/api/brands/${brandId}/agents`)
    if (res.ok) setAgents(await res.json())
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const data = await res.json()
        setStatus({ postfast: data.postfastConfigured, google: data.googleConfigured, lark: data.larkConfigured })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  const Field = ({ f }: { f: IntegrationField }) => (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{f.label}</label>
      <input
        type={f.type === 'password' ? 'password' : f.type === 'url' ? 'url' : 'text'}
        value={form[f.key] ?? ''}
        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
        placeholder={f.placeholder}
        className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
      />
      {f.helpText && <p className="text-[10px] text-slate-400">{f.helpText}</p>}
    </div>
  )

  const StatusBadge = ({ ok }: { ok?: boolean }) =>
    ok ? (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">已连接</span>
    ) : (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">未配置</span>
    )

  const profileMarkdown = initialSettings?.description

  const TABS = [
    { key: 'profile' as const,      label: '📄 品牌概况' },
    { key: 'integrations' as const, label: '🔗 集成配置' },
    { key: 'agents' as const,       label: '🤖 AI Agent' },
  ]

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        id="brand-settings-toggle"
      >
        <Settings size={13} />
        品牌配置
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div className="mt-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2.5 text-[11px] font-bold transition-colors ${tab === t.key
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4">

            {/* ── Profile Tab: markdown display ─────────────────────────────── */}
            {tab === 'profile' && (
              profileMarkdown ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {profileMarkdown}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center gap-3 text-center">
                  <FileText size={28} className="text-slate-300 dark:text-slate-600" />
                  <div>
                    <p className="text-sm font-bold text-slate-400 dark:text-slate-500">品牌档案尚未生成</p>
                    <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">
                      AI Agent 将通过访谈品牌主后自动填入品牌基本信息
                    </p>
                  </div>
                </div>
              )
            )}

            {/* ── Integrations Tab ──────────────────────────────────────────── */}
            {tab === 'integrations' && (
              <div className="space-y-6">
                {/* PostFast */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">PostFast（内容发布）</p>
                    <StatusBadge ok={status.postfast} />
                  </div>
                  <div className="space-y-3">{POSTFAST_FIELDS.map(f => <Field key={f.key} f={f} />)}</div>
                </div>
                <div className="h-px bg-slate-200 dark:bg-slate-700" />

                {/* Google Business */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Google Business（评论监控）</p>
                    <StatusBadge ok={status.google} />
                  </div>
                  <div className="space-y-3">{GOOGLE_FIELDS.map(f => <Field key={f.key} f={f} />)}</div>
                </div>
                <div className="h-px bg-slate-200 dark:bg-slate-700" />

                {/* Lark */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">飞书（素材存储 + 通知）</p>
                    <StatusBadge ok={status.lark} />
                  </div>

                  {/* Auto-created workspace folder link */}
                  {initialSettings?.larkDriveFolderId && (
                    <a
                      href={`https://12eat-ai.sg.larksuite.com/drive/folder/${initialSettings.larkDriveFolderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                    >
                      <span>📁</span>
                      <span className="flex-1 truncate">品牌 Workspace 文件夹（自动创建）</span>
                      <span className="text-[10px] font-mono opacity-60 flex-shrink-0">{initialSettings.larkDriveFolderId.slice(0, 8)}…</span>
                    </a>
                  )}

                  <div className="space-y-3">{LARK_FIELDS.filter(f => f.key !== 'larkDriveFolderId').map(f => <Field key={f.key} f={f} />)}</div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all disabled:opacity-60 shadow-sm shadow-blue-500/20"
                  id="brand-settings-save"
                >
                  {saving ? (
                    <><Loader2 size={14} className="animate-spin" /> 保存中…</>
                  ) : saved ? (
                    <><CheckCircle2 size={14} /> 已保存</>
                  ) : (
                    <><Save size={14} /> 保存配置</>
                  )}
                </button>
              </div>
            )}

            {/* ── Agents Tab: read-only roster ─────────────────────────────── */}
            {tab === 'agents' && (
              <div className="space-y-3">
                {agents.length === 0 ? (
                  <div className="py-8 flex flex-col items-center gap-2 text-center">
                    <Bot size={28} className="text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-bold text-slate-400 dark:text-slate-500">暂无 Agent 连接</p>
                    <p className="text-xs text-slate-300 dark:text-slate-600">Agent 初始化后将自动出现在这里</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {agents.map(ba => (
                      <div key={ba.id} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0 overflow-hidden"
                          style={{ background: ba.agent.themeColor || '#6366f1' }}
                        >
                          {ba.agent.avatar
                            ? <img src={ba.agent.avatar} alt="" className="w-full h-full object-cover" />
                            : (ba.agent.nickname || ba.agent.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                            {ba.agent.nickname || ba.agent.email}
                          </p>
                          {ba.agent.introduction && (
                            <p className="text-[10px] text-slate-400 truncate">{ba.agent.introduction}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                              {ba.role}
                            </span>
                            <span className={`w-1.5 h-1.5 rounded-full ${ba.active ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                            <span className="text-[10px] text-slate-400">{ba.active ? '已连接' : '离线'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
