'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { X, Save, Loader2, CheckCircle2, Copy, ExternalLink, RefreshCw } from 'lucide-react'

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
  { key: 'googleClientId', label: 'Google OAuth Client ID', placeholder: 'xxxxxxxx.apps.googleusercontent.com', type: 'text', helpText: '每个商家可独立配置自己的 Google OAuth 客户端 ID' },
  { key: 'googleClientSecret', label: 'Google OAuth Client Secret', placeholder: '••••••••', type: 'password', helpText: '每个商家可独立配置自己的 Google OAuth 客户端密钥' },
  { key: 'googleRedirectUri', label: 'Google OAuth Redirect URI', placeholder: 'https://your-domain.com/api/integrations/google/oauth/callback', type: 'url', helpText: '需与 Google Cloud Console 中的授权回调地址完全一致' },
  { key: 'googlePlaceId', label: 'Google Place ID', placeholder: 'ChIJ...', type: 'text', helpText: '在 Google Maps 中找到您的 Place ID' },
  { key: 'googleApiKey', label: 'Google API Key', placeholder: '••••••••', type: 'password', helpText: '启用 Places API + My Business API' },
  { key: 'googleBusinessUrl', label: 'Google 商家主页 URL', placeholder: 'https://maps.google.com/...', type: 'url', helpText: '扫码失败时回退到商家主页（建议配置）' },
  { key: 'googleReviewUrl', label: 'Google 写评 URL（Web 兜底）', placeholder: 'https://search.google.com/local/writereview?placeid=...', type: 'url', helpText: 'Google Maps App 无法打开时使用；未配置时会按 Place ID 自动生成' },
  { key: 'googleReviewAppUrl', label: 'Google Maps App 写评 URL', placeholder: 'https://www.google.com/maps/...', type: 'url', helpText: '优先使用 Growth 同步的 Google Places 原始 writeAReviewUri，也可从 Growth 手工复制' },
]



interface Props {
  brandId: string
  open: boolean
  onClose: () => void
  initialSettings?: Record<string, unknown>
}

function isMaskedValue(value: unknown) {
  return typeof value === 'string' && value.startsWith('••••••')
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asBool(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function buildInitialForm(initialSettings?: Record<string, unknown>): Record<string, string> {
  if (!initialSettings) {
    return {
      postfastApiKey: '',
      googlePlaceId: '',
      googleApiKey: '',
      googleClientId: '',
      googleClientSecret: '',
      googleRedirectUri: '',
      googleBusinessUrl: '',
      googleReviewUrl: '',
      googleReviewAppUrl: '',
    }
  }

  return {
    postfastApiKey: asText(initialSettings.postfastApiKey),
    googlePlaceId: asText(initialSettings.googlePlaceId),
    googleApiKey: asText(initialSettings.googleApiKey),
    googleClientId: asText(initialSettings.googleClientId),
    googleClientSecret: asText(initialSettings.googleClientSecret),
    googleRedirectUri: asText(initialSettings.googleRedirectUri),
    googleBusinessUrl: asText(initialSettings.googleBusinessUrl),
    googleReviewUrl: asText(initialSettings.googleReviewUrl),
    googleReviewAppUrl: asText(initialSettings.googleReviewAppUrl),
  }
}
function StatusBadge({ ok }: { ok?: boolean }) {
  return ok ? (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">已连接</span>
  ) : (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">未配置</span>
  )
}

function Section({ label, badge, children }: { label: string; badge: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">{label}</p>
        {badge}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function BrandSettingsPanel({ brandId, open, onClose, initialSettings }: Props) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [statusMessages, setStatusMessages] = useState<Record<string, string>>({})
  const [postfastSync, setPostfastSync] = useState<{ synced: number; accounts: string[] } | null>(null)
  const [postfastConnectLink, setPostfastConnectLink] = useState('')
  const [regeneratingPostfastLink, setRegeneratingPostfastLink] = useState(false)
  const [postfastLinkFeedback, setPostfastLinkFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [preferOAuth, setPreferOAuth] = useState(true)

  const initialPostfastConnectLink = asText(initialSettings?.postfastConnectLink)
  const googleLocationName = asText(initialSettings?.googleLocationName)
  const googlePreferOAuth = asBool(initialSettings?.googlePreferOAuth, true)
  const googleLinksMeta = initialSettings?.googleLinksMeta && typeof initialSettings.googleLinksMeta === 'object' && !Array.isArray(initialSettings.googleLinksMeta)
    ? initialSettings.googleLinksMeta as Record<string, unknown>
    : {}
  const growthGoogleLinks = [
    ['商家主页', asText(initialSettings?.googleBusinessUrl)],
    ['写评价（Web）', asText(initialSettings?.googleReviewUrl)],
    ['写评价（Google Maps App）', asText(initialSettings?.googleReviewAppUrl)],
    ['查看评论', asText(googleLinksMeta.reviewsUrl)],
    ['路线', asText(googleLinksMeta.directionsUrl)],
    ['照片', asText(googleLinksMeta.photosUrl)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))

  useEffect(() => {
    if (!open) return

    queueMicrotask(() => {
      if (initialSettings) {
        setForm(buildInitialForm(initialSettings))
        setPreferOAuth(googlePreferOAuth)
        setStatus({
          postfast: asBool(initialSettings.postfastConfigured),
          google: asBool(initialSettings.googleConfigured),
          extension: false,
          meta: asBool(initialSettings.metaConfigured),
        })
      } else {
        setForm({})
      }
    })
  }, [googlePreferOAuth, initialSettings, open])

  useEffect(() => {
    queueMicrotask(() => {
      setPostfastConnectLink(initialPostfastConnectLink)
      setPostfastLinkFeedback(null)
    })
  }, [brandId, initialPostfastConnectLink])

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/integrations/status?brandId=${brandId}`)
    if (res.ok) {
      const data = await res.json()
      const s: Record<string, boolean> = {}
      const msgs: Record<string, string> = {}
      const statuses = Array.isArray(data?.statuses) ? data.statuses : []
      statuses.forEach((st: { name?: string; ok?: boolean; message?: string }) => {
        if (typeof st.name === 'string') {
          s[st.name] = !!st.ok
          if (st.message) {
            msgs[st.name] = st.message
          }
        }
      })
      setStatus(s)
      setStatusMessages(msgs)
    }
  }, [brandId])

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      void fetchStatus()
    })
  }, [open, fetchStatus])

  const [disconnecting, setDisconnecting] = useState(false)
  const handleGoogleDisconnect = async () => {
    if (!confirm('确定要断开 Google 商家账号的连接吗？这会停止直接拉取评论和回复。')) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/integrations/google/oauth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      })
      if (res.ok) {
        alert('已成功断开 Google 商家账号连接')
        onClose()
        window.location.reload()
      } else {
        alert('断开连接失败，请重试')
      }
    } catch (e) {
      console.error(e)
      alert('网络连接错误')
    } finally {
      setDisconnecting(false)
    }
  }

  const [disconnectingMeta, setDisconnectingMeta] = useState(false)
  const handleMetaDisconnect = async () => {
    if (!confirm('确定要断开 Meta (Facebook / Instagram) 账号的连接吗？这会清除已保存的授权令牌。')) return
    setDisconnectingMeta(true)
    try {
      const res = await fetch('/api/integrations/meta/oauth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      })
      if (res.ok) {
        alert('已成功断开 Meta 账号连接')
        onClose()
        window.location.reload()
      } else {
        alert('断开连接失败，请重试')
      }
    } catch (e) {
      console.error(e)
      alert('网络连接错误')
    } finally {
      setDisconnectingMeta(false)
    }
  }

  const handleRegeneratePostfastLink = async () => {
    setRegeneratingPostfastLink(true)
    setPostfastLinkFeedback(null)
    try {
      const res = await fetch('/api/integrations/postfast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, action: 'generate_connect_link' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success || typeof data?.connectUrl !== 'string') {
        throw new Error(typeof data?.error === 'string' ? data.error : '重新生成链接失败')
      }

      setPostfastConnectLink(data.connectUrl)
      setPostfastLinkFeedback({ type: 'success', message: '新链接已生成并保存' })
    } catch (error) {
      console.error('[BrandSettings] Failed to regenerate PostFast connect link:', error)
      setPostfastLinkFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : '重新生成链接失败，请稍后重试',
      })
    } finally {
      setRegeneratingPostfastLink(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setPostfastSync(null)
    try {
      const payload = {
        ...Object.fromEntries(
          Object.entries(form).filter(([, value]) => value !== '' && !isMaskedValue(value))
        ),
        googlePreferOAuth: preferOAuth,
      }
      const res = await fetch(`/api/brands/${brandId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        alert('保存失败，请重试')
        return
      }

      const data = await res.json()
      setStatus({
        postfast: !!data.postfastConfigured,
        google: !!data.googleConfigured,
        extension: false,
      })
      if (data.googlePreferOAuth !== undefined) {
        setPreferOAuth(!!data.googlePreferOAuth)
      }
      if (data.postfastSync) setPostfastSync(data.postfastSync)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setForm({})

    } catch (e) {
      console.error(e)
      alert('保存失败，请检查网络')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const postfastConfigured = status.postfast || asBool(initialSettings?.postfastConfigured)

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
          <Section label="PostFast（内容发布）" badge={<StatusBadge ok={postfastConfigured} />}>
            {POSTFAST_FIELDS.map(f => <Field key={f.key} f={f} />)}
            {(postfastConfigured || postfastConnectLink) && (
              <div className="mt-2.5 p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">社媒连接分享链接</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={postfastConnectLink}
                    placeholder="尚未生成分享链接"
                    className="min-w-0 flex-1 text-xs bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl px-3 py-1.5 font-medium text-slate-700 dark:text-slate-300 select-all"
                  />
                  <button
                    type="button"
                    disabled={!postfastConnectLink}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(postfastConnectLink)
                        setPostfastLinkFeedback({ type: 'success', message: '已复制到剪贴板' })
                      } catch (error) {
                        console.error('[BrandSettings] Failed to copy PostFast connect link:', error)
                        setPostfastLinkFeedback({ type: 'error', message: '复制失败，请手动选择链接复制' })
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-primary bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={handleRegeneratePostfastLink}
                    disabled={!postfastConfigured || regeneratingPostfastLink}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={regeneratingPostfastLink ? 'animate-spin' : ''} />
                    {regeneratingPostfastLink ? '生成中' : postfastConnectLink ? '重新生成' : '生成链接'}
                  </button>
                </div>
                {postfastLinkFeedback && (
                  <p className={`text-[10px] font-medium ${postfastLinkFeedback.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {postfastLinkFeedback.message}
                  </p>
                )}
                <p className="text-[9px] text-slate-400 font-medium leading-normal">
                  此链接可分享给品牌管理员，用于直接在 PostFast 绑定/更新该品牌的 Facebook, Instagram, TikTok 账号连接。
                </p>
              </div>
            )}
          </Section>
          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* Google Business */}
          <Section label="Google Business（评论监控）" badge={<StatusBadge ok={status.google} />}>
            <div className="space-y-3">
              {GOOGLE_FIELDS.filter(f => ['googleClientId', 'googleClientSecret', 'googleRedirectUri'].includes(f.key)).map(f => <Field key={f.key} f={f} />)}
            </div>

            {initialSettings?.googleRefreshTokenConfigured ? (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/30 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-black text-emerald-800 dark:text-emerald-400">已授权直连 Google 商家</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-500 font-medium">
                      关联店铺：<span className="font-bold">{googleLocationName || '未命名位置'}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleDisconnect}
                    disabled={disconnecting}
                    className="px-2.5 py-1 text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 rounded-lg hover:bg-rose-100 transition active:scale-95 disabled:opacity-60"
                  >
                    {disconnecting ? '断开中...' : '断开连接'}
                  </button>
                </div>
                <div className="flex items-center gap-2.5 px-1 py-0.5">
                  <input
                    type="checkbox"
                    id="googlePreferOAuth"
                    checked={preferOAuth}
                    onChange={(e) => setPreferOAuth(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500/40 border-slate-350 dark:border-slate-600 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="googlePreferOAuth" className="text-xs font-bold text-slate-650 dark:text-slate-400 cursor-pointer select-none">
                    优先使用直连 Google 商家账号功能 (推荐)
                  </label>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  window.location.href = `/api/integrations/google/oauth?brandId=${brandId}`
                }}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm shadow-blue-500/20 hover:scale-[1.01] active:scale-[0.99]"
              >
                <span>⚡</span>
                连接 Google 商家账号 (直接授权)
              </button>
            )}

            {/* Manual fallback fields for developers / place ID custom debugging */}
            {googleLinksMeta.source === 'amc-growth:google-places' && growthGoogleLinks.length > 0 && (
              <div className="mt-4 border border-blue-100 dark:border-blue-900/40 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 p-3.5 space-y-3">
                <div>
                  <p className="text-xs font-extrabold text-blue-800 dark:text-blue-300">Growth 已确认的 Google Maps 链接</p>
                  <p className="mt-1 text-[10px] text-blue-600/80 dark:text-blue-400/80">
                    观测于 {asText(googleLinksMeta.observedAt) || '未知'} · 到期于 {asText(googleLinksMeta.expiresAt) || '未知'}
                  </p>
                </div>
                <div className="space-y-2">
                  {growthGoogleLinks.map(([label, url]) => (
                    <div key={label} className="flex items-center gap-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/30 p-2.5">
                      <div className="min-w-0 flex-1"><p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">{label}</p><p className="truncate text-[9px] text-slate-400">{url}</p></div>
                      <a href={url} target="_blank" rel="noreferrer" aria-label={`打开${label}`} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"><ExternalLink size={13} /></a>
                      <button type="button" aria-label={`复制${label}`} onClick={() => void navigator.clipboard.writeText(url)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"><Copy size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual fallback fields for developers / place ID custom debugging */}
            <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
              <details className="group">
                <summary className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-650 flex items-center justify-between select-none list-none">
                  <span>🛠️ 高级手动配置 (可选，调试用)</span>
                  <span className="transition-transform group-open:rotate-180 text-[7px] text-slate-350">▼</span>
                </summary>
                <div className="mt-3 space-y-3">
                  {GOOGLE_FIELDS.filter(f => !['googleClientId', 'googleClientSecret', 'googleRedirectUri'].includes(f.key)).map(f => <Field key={f.key} f={f} />)}
                </div>
              </details>
            </div>
          </Section>


          <Section label="Meta (Facebook / Instagram)" badge={<StatusBadge ok={status.meta} />}>
            {status.meta ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3">
                  <div className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-normal flex-1 pr-2">
                    {statusMessages.meta || '已连接 Meta 账号'}
                  </div>
                  <button
                    type="button"
                    onClick={handleMetaDisconnect}
                    disabled={disconnectingMeta}
                    className="px-2.5 py-1 text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 rounded-lg hover:bg-rose-100 transition active:scale-95 disabled:opacity-60 flex-shrink-0"
                  >
                    {disconnectingMeta ? '断开中...' : '断开连接'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  window.location.href = `/api/integrations/meta/oauth?brandId=${brandId}`
                }}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm shadow-indigo-500/20 hover:scale-[1.01] active:scale-[0.99]"
              >
                <span>⚡</span>
                连接 Meta 账号 (Facebook / Instagram)
              </button>
            )}
          </Section>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          <Section label="Chrome 浏览器插件 (社媒与本地生活自动化)" badge={<StatusBadge ok={status.extension} />}>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-4">
              <p className="text-xs text-slate-650 dark:text-slate-350 leading-relaxed font-medium">
                由于小红书、美团、大众点评、Instagram、TikTok 等平台接口限制极严，系统支持通过 <strong>AMC 浏览器助理插件</strong> 在前端安全执行自动回复与数据采集。
              </p>

              <div className="flex gap-2">
                <a
                  href="/api/integrations/extension/download"
                  download="amc-assistant-extension.zip"
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm shadow-blue-500/20 hover:scale-[1.01] active:scale-[0.99]"
                >
                  📥 下载浏览器助手插件 (ZIP)
                </a>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-2 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-150 dark:border-slate-800">
                <p className="font-extrabold text-slate-650 dark:text-slate-300">安装及使用说明：</p>
                <div className="space-y-1.5 leading-normal">
                  <p>1. 点击上方按钮下载并解压得到 <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">chrome-extension</code> 文件夹。</p>
                  <p>2. 在 Chrome 浏览器地址栏中输入并打开：<code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">chrome://extensions/</code></p>
                  <p>3. 开启右上角的 <strong>“开发者模式” (Developer mode)</strong>。</p>
                  <p>4. 点击左上角的 <strong>“加载已解压的扩展程序” (Load unpacked)</strong>，选择该文件夹完成安装。</p>
                  <p>5. 只要此看板页面处于打开状态，您在同一浏览器窗口中保持对应商户后台登录，AI 即可为您自动操作回复。</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-indigo-650 dark:text-indigo-400">本地联调与测试：</span>
                  <a
                    href="/mock-merchant"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-450 hover:underline font-extrabold"
                  >
                    模拟商户中心 ➜
                  </a>
                </div>
              </div>
            </div>
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
