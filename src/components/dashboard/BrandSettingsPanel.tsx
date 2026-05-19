'use client'
import React, { useState, useEffect } from 'react'
import { X, Save, Loader2, CheckCircle2 } from 'lucide-react'

// ── Integration field types ──────────────────────────────────────────────────
interface IntegrationField {
  key: string
  label: string
  placeholder: string
  type?: 'password' | 'text' | 'url'
  helpText?: string
}

const POSTFAST_FIELDS: IntegrationField[] = [
  { key: 'postfastApiKey', label: 'PostFast API Key', placeholder: 'pf_live_...', type: 'text', helpText: '用于自动发布内容到各社交平台（内部使用，明文显示）' },
]

const GOOGLE_FIELDS: IntegrationField[] = [
  { key: 'googlePlaceId', label: 'Google Place ID', placeholder: 'ChIJ...', type: 'text', helpText: '在 Google Maps 中找到您的 Place ID' },
  { key: 'googleApiKey', label: 'Google API Key', placeholder: '••••••••', type: 'password', helpText: '启用 Places API + My Business API' },
]

const LARK_FIELDS: IntegrationField[] = [
  { key: 'larkAppId', label: 'Lark App ID', placeholder: 'cli_...', type: 'text' },
  { key: 'larkAppSecret', label: 'Lark App Secret', placeholder: '••••••••', type: 'password' },
  { key: 'larkParentFolderToken', label: '根目录文件夹 Token', placeholder: 'PbugfutjllCDM0dqMiIlN0orgZd', type: 'text', helpText: '品牌 Workspace 将自动创建于此文件夹下' },
  { key: 'larkBotWebhook', label: 'Bot Webhook URL', placeholder: 'https://open.larksuite.com/...', type: 'url', helpText: '老板通知 Webhook（自定义机器人）' },
  { key: 'larkOwnerId', label: '老板 Lark open_id', placeholder: 'ou_...', type: 'text', helpText: '接收私信通知的飞书账号 ID' },
]

interface Props {
  brandId: string
  open: boolean
  onClose: () => void
  initialSettings?: Record<string, any>
}

function isMaskedValue(value: unknown) {
  return typeof value === 'string' && value.startsWith('••••••')
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function buildInitialForm(initialSettings?: Record<string, any>): Record<string, string> {
  if (!initialSettings) {
    return {
      postfastApiKey: '',
      googlePlaceId: '',
      googleApiKey: '',
      larkAppId: '',
      larkAppSecret: '',
      larkParentFolderToken: '',
      larkBotWebhook: '',
      larkOwnerId: '',
    }
  }

  return {
    postfastApiKey: asText(initialSettings.postfastApiKey),
    googlePlaceId: asText(initialSettings.googlePlaceId),
    googleApiKey: asText(initialSettings.googleApiKey),
    larkAppId: asText(initialSettings.larkAppId),
    larkAppSecret: asText(initialSettings.larkAppSecret),
    larkParentFolderToken: asText(initialSettings.larkParentFolderToken),
    larkBotWebhook: asText(initialSettings.larkBotWebhook),
    larkOwnerId: asText(initialSettings.larkOwnerId),
  }
}

export function BrandSettingsPanel({ brandId, open, onClose, initialSettings }: Props) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [postfastSync, setPostfastSync] = useState<{ synced: number; accounts: string[] } | null>(null)

  useEffect(() => {
    if (!open) return

    if (initialSettings) {
      setForm(buildInitialForm(initialSettings))
      setStatus({
        postfast: !!initialSettings.postfastConfigured,
        google: !!initialSettings.googleConfigured,
        lark: !!initialSettings.larkConfigured,
      })
    } else {
      setForm({})
    }
  }, [initialSettings, open])

  useEffect(() => {
    if (open) fetchStatus()
  }, [open, brandId])

  const fetchStatus = async () => {
    const res = await fetch(`/api/integrations/status?brandId=${brandId}`)
    if (res.ok) {
      const data = await res.json()
      const s: Record<string, boolean> = {}
      data.statuses?.forEach((st: any) => { s[st.name] = st.ok })
      setStatus(s)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setPostfastSync(null)
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, value]) => value !== '' && !isMaskedValue(value))
      )
      const res = await fetch(`/api/brands/${brandId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        setStatus({ postfast: data.postfastConfigured, google: data.googleConfigured, lark: data.larkConfigured })
        if (data.postfastSync) setPostfastSync(data.postfastSync)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
        setForm({})
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

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

  const Section = ({ label, badge, children }: { label: string; badge: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">{label}</p>
        {badge}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 w-full max-w-lg mx-4 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100">🔗 集成配置</h3>
            <p className="text-xs text-slate-400 mt-0.5">配置发布渠道、评论监控与通知</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* PostFast */}
          <Section label="PostFast（内容发布）" badge={<StatusBadge ok={status.postfast} />}>
            {POSTFAST_FIELDS.map(f => <Field key={f.key} f={f} />)}
          </Section>
          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* Google Business */}
          <Section label="Google Business（评论监控）" badge={<StatusBadge ok={status.google} />}>
            {GOOGLE_FIELDS.map(f => <Field key={f.key} f={f} />)}
          </Section>
          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* Lark */}
          <Section label="飞书（素材存储 + 通知）" badge={<StatusBadge ok={status.lark} />}>
            {initialSettings?.larkDriveFolderId && (
              <a
                href={`https://12eat-ai.sg.larksuite.com/drive/folder/${initialSettings.larkDriveFolderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 transition-colors"
              >
                <span>📁</span>
                <span className="flex-1 truncate">品牌 Workspace 文件夹（自动创建）</span>
                <span className="text-[10px] font-mono opacity-60 flex-shrink-0">{initialSettings.larkDriveFolderId.slice(0, 8)}…</span>
              </a>
            )}
            {LARK_FIELDS.filter(f => f.key !== 'larkDriveFolderId').map(f => <Field key={f.key} f={f} />)}
          </Section>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex-shrink-0 space-y-3">
          {/* PostFast sync success banner */}
          {postfastSync && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 animate-in fade-in duration-300">
              <span className="text-base leading-none">🔗</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                  PostFast 已自动同步 {postfastSync.synced} 个账号
                </p>
                <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/60 mt-0.5 truncate">
                  {postfastSync.accounts.join(' · ')}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all disabled:opacity-60 shadow-sm shadow-blue-500/20"
            id="brand-settings-save"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> 保存并同步中…</>
            ) : saved ? (
              <><CheckCircle2 size={14} /> 已保存</>
            ) : (
              <><Save size={14} /> 保存配置</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
