'use client'

import React, { useEffect, useState } from 'react'
import { X, Save, Loader2, CheckCircle2, Plus, Trash2, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Props = {
  brandId: string
  open: boolean
  onClose: () => void
  initialSettings?: Record<string, any>
}

type StoreDraft = {
  storeId: string
  name: string
  timezone: string
  address: string
  location: string
  isPrimary: boolean
  phone: string
  website: string
  googlePlaceId: string
  googleLocationId: string
  googleLocationName: string
}

const STORES_CONFIG_START = '<!-- AMC:BRAND_PROFILE:STORES_CONFIG:START -->'
const STORES_CONFIG_END = '<!-- AMC:BRAND_PROFILE:STORES_CONFIG:END -->'

function makePrimaryStoreFromSettings(initialSettings: Record<string, any> | undefined): StoreDraft {
  return {
    storeId: 'main',
    name: (initialSettings?.googleLocationName as string) || '主门店',
    timezone: (initialSettings?.timezone as string) || 'Asia/Singapore',
    address: (initialSettings?.address as string) || '',
    location: (initialSettings?.location as string) || '',
    isPrimary: true,
    phone: (initialSettings?.phone as string) || '',
    website: (initialSettings?.website as string) || '',
    googlePlaceId: (initialSettings?.googlePlaceId as string) || '',
    googleLocationId: (initialSettings?.googleLocationId as string) || '',
    googleLocationName: (initialSettings?.googleLocationName as string) || '',
  }
}

function ensureAtLeastOnePrimary(stores: StoreDraft[]) {
  if (!stores.length) return stores
  if (stores.some((s) => s.isPrimary)) return stores
  return stores.map((s, idx) => ({ ...s, isPrimary: idx === 0 }))
}

function extractStoresFromMarkdown(markdown: string, fallbackStore: StoreDraft): StoreDraft[] {
  const startIdx = markdown.indexOf(STORES_CONFIG_START)
  const endIdx = markdown.indexOf(STORES_CONFIG_END)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return [fallbackStore]

  const section = markdown.slice(startIdx + STORES_CONFIG_START.length, endIdx)
  const match = section.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) return [fallbackStore]

  try {
    const parsed = JSON.parse(match[1])
    const stores = Array.isArray(parsed?.stores) ? parsed.stores : []
    if (!stores.length) return [fallbackStore]

    return ensureAtLeastOnePrimary(stores.map((item: any, idx: number) => ({
      storeId: typeof item?.storeId === 'string' && item.storeId.trim() ? item.storeId : `store_${idx + 1}`,
      name: typeof item?.name === 'string' ? item.name : '',
      timezone: typeof item?.timezone === 'string' && item.timezone ? item.timezone : fallbackStore.timezone,
      address: typeof item?.address === 'string' ? item.address : '',
      location: typeof item?.location === 'string' ? item.location : '',
      isPrimary: !!item?.isPrimary,
      phone: typeof item?.contact?.phone === 'string' ? item.contact.phone : (typeof item?.phone === 'string' ? item.phone : ''),
      website: typeof item?.contact?.website === 'string' ? item.contact.website : (typeof item?.website === 'string' ? item.website : ''),
      googlePlaceId: typeof item?.googleBusiness?.placeId === 'string' ? item.googleBusiness.placeId : '',
      googleLocationId: typeof item?.googleBusiness?.locationId === 'string' ? item.googleBusiness.locationId : '',
      googleLocationName: typeof item?.googleBusiness?.locationName === 'string' ? item.googleBusiness.locationName : '',
    })))
  } catch {
    return [fallbackStore]
  }
}

function buildStoresConfigBlock(stores: StoreDraft[]) {
  const payload = {
    stores: stores.map((s) => ({
      storeId: s.storeId,
      name: s.name,
      isPrimary: s.isPrimary,
      timezone: s.timezone,
      address: s.address || null,
      location: s.location || null,
      contact: {
        phone: s.phone || null,
        website: s.website || null,
      },
      googleBusiness: {
        placeId: s.googlePlaceId || null,
        locationId: s.googleLocationId || null,
        locationName: s.googleLocationName || null,
      },
      ext: {},
    })),
  }

  return `${STORES_CONFIG_START}\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n${STORES_CONFIG_END}`
}

function upsertStoresConfigBlock(markdown: string, stores: StoreDraft[]) {
  const block = buildStoresConfigBlock(ensureAtLeastOnePrimary(stores))
  const startIdx = markdown.indexOf(STORES_CONFIG_START)
  const endIdx = markdown.indexOf(STORES_CONFIG_END)

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return `${markdown.slice(0, startIdx)}${block}${markdown.slice(endIdx + STORES_CONFIG_END.length)}`
  }

  return `${markdown.trim()}\n\n## 多门店配置\n\n${block}\n`
}

export function BrandKnowledgePanel({ brandId, open, onClose, initialSettings }: Props) {
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileMarkdown, setProfileMarkdown] = useState('')
  const [profileViewMode, setProfileViewMode] = useState<'edit' | 'preview'>('edit')
  const [stores, setStores] = useState<StoreDraft[]>([])
  const [storesSaving, setStoresSaving] = useState(false)

  useEffect(() => {
    if (!open) return

    const fallbackStore = makePrimaryStoreFromSettings(initialSettings)
    setStores([fallbackStore])

    const loadProfile = async () => {
      setProfileLoading(true)
      try {
        const res = await fetch(`/api/brands/${brandId}/profile`)
        if (!res.ok) return
        const data = await res.json()
        const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
        setProfileMarkdown(markdown)
        if (markdown) {
          setStores(extractStoresFromMarkdown(markdown, fallbackStore))
        }
      } catch (e) {
        console.error('Failed to load brand profile markdown:', e)
      } finally {
        setProfileLoading(false)
      }
    }

    void loadProfile()
  }, [open, brandId, initialSettings])

  const handleSaveProfile = async (nextMarkdown?: string) => {
    const markdown = (nextMarkdown ?? profileMarkdown).trim()
    if (!markdown) return

    setProfileSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      })
      if (!res.ok) {
        alert('保存品牌 Profile 失败，请重试')
        return
      }
      const data = await res.json()
      const serverMarkdown = typeof data?.markdown === 'string' ? data.markdown : markdown
      setProfileMarkdown(serverMarkdown)
      setStores(extractStoresFromMarkdown(serverMarkdown, makePrimaryStoreFromSettings(initialSettings)))
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2500)
    } catch (e) {
      console.error(e)
      alert('保存品牌 Profile 失败，请检查网络')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleRefreshProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/profile?refresh=1`)
      if (!res.ok) {
        alert('刷新 Profile 失败，请稍后再试')
        return
      }
      const data = await res.json()
      const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
      setProfileMarkdown(markdown)
      setStores(extractStoresFromMarkdown(markdown, makePrimaryStoreFromSettings(initialSettings)))
    } catch (e) {
      console.error(e)
      alert('刷新 Profile 失败，请检查网络')
    } finally {
      setProfileLoading(false)
    }
  }

  const handleAddStore = () => {
    setStores((prev) => {
      const next = [...prev, {
        storeId: `store_${prev.length + 1}`,
        name: '',
        timezone: (initialSettings?.timezone as string) || 'Asia/Singapore',
        address: '',
        location: '',
        isPrimary: prev.length === 0,
        phone: '',
        website: '',
        googlePlaceId: '',
        googleLocationId: '',
        googleLocationName: '',
      }]
      return ensureAtLeastOnePrimary(next)
    })
  }

  const updateStore = (index: number, key: keyof StoreDraft, value: string | boolean) => {
    setStores((prev) => {
      const next = prev.map((s, i) => i === index ? { ...s, [key]: value } : s)
      if (key === 'isPrimary' && value === true) {
        return next.map((s, i) => ({ ...s, isPrimary: i === index }))
      }
      return ensureAtLeastOnePrimary(next)
    })
  }

  const removeStore = (index: number) => {
    setStores((prev) => ensureAtLeastOnePrimary(prev.filter((_, i) => i !== index)))
  }

  const handleSaveStores = async () => {
    if (!profileMarkdown.trim()) {
      alert('请先刷新或加载品牌 Profile 内容')
      return
    }
    setStoresSaving(true)
    try {
      const nextMarkdown = upsertStoresConfigBlock(profileMarkdown, stores)
      setProfileMarkdown(nextMarkdown)
      await handleSaveProfile(nextMarkdown)
    } finally {
      setStoresSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100">📚 品牌知识库</h3>
            <p className="text-xs text-slate-400 mt-0.5">管理 AI 预读的品牌 Profile 与多门店结构</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200">多门店配置（写入品牌 Profile）</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300">{stores.length} 门店</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">用于 AI 预读上下文，支持不同门店独立定位与账号信息。</p>
              <button
                type="button"
                onClick={handleAddStore}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
              >
                <Plus size={12} /> 新增门店
              </button>
            </div>
            <div className="space-y-3">
              {stores.map((store, idx) => (
                <div key={`${store.storeId}-${idx}`} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">门店 #{idx + 1}</p>
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] text-slate-500 flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={store.isPrimary}
                          onChange={(e) => updateStore(idx, 'isPrimary', e.target.checked)}
                        /> 主门店
                      </label>
                      {stores.length > 1 && (
                        <button type="button" onClick={() => removeStore(idx)} className="text-rose-500 hover:text-rose-600">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" placeholder="storeId (如 main / branch_shanghai)" value={store.storeId} onChange={(e) => updateStore(idx, 'storeId', e.target.value)} />
                    <input className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" placeholder="门店名称" value={store.name} onChange={(e) => updateStore(idx, 'name', e.target.value)} />
                    <input className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" placeholder="时区 (Asia/Singapore)" value={store.timezone} onChange={(e) => updateStore(idx, 'timezone', e.target.value)} />
                    <input className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" placeholder="城市/区域" value={store.location} onChange={(e) => updateStore(idx, 'location', e.target.value)} />
                    <input className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs md:col-span-2" placeholder="详细地址" value={store.address} onChange={(e) => updateStore(idx, 'address', e.target.value)} />
                    <input className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" placeholder="联系电话" value={store.phone} onChange={(e) => updateStore(idx, 'phone', e.target.value)} />
                    <input className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" placeholder="官网" value={store.website} onChange={(e) => updateStore(idx, 'website', e.target.value)} />
                    <input className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" placeholder="Google Place ID" value={store.googlePlaceId} onChange={(e) => updateStore(idx, 'googlePlaceId', e.target.value)} />
                    <input className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs" placeholder="Google Location ID" value={store.googleLocationId} onChange={(e) => updateStore(idx, 'googleLocationId', e.target.value)} />
                    <input className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs md:col-span-2" placeholder="Google Location Name" value={store.googleLocationName} onChange={(e) => updateStore(idx, 'googleLocationName', e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSaveStores}
              disabled={storesSaving || profileSaving || profileLoading}
              className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60"
            >
              {(storesSaving || profileSaving)
                ? <><Loader2 size={14} className="animate-spin" /> 保存门店中…</>
                : <><Save size={14} /> 保存门店到 Profile</>}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2"><FileText className="w-4 h-4" /> 品牌 Profile Markdown（AI 预读）</p>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setProfileViewMode('edit')}
                    className={`text-[11px] px-2 py-1 ${profileViewMode === 'edit' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileViewMode('preview')}
                    className={`text-[11px] px-2 py-1 border-l border-slate-200 dark:border-slate-700 ${profileViewMode === 'preview' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    预览
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleRefreshProfile}
                  disabled={profileLoading || profileSaving}
                  className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {profileLoading ? '刷新中...' : '刷新自动区'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">可直接编辑品牌定义、设计策略、推广语境。系统自动区会在刷新时同步。</p>
            {profileViewMode === 'edit' ? (
              <textarea
                value={profileMarkdown}
                onChange={(e) => setProfileMarkdown(e.target.value)}
                placeholder="加载后可编辑品牌 Profile Markdown..."
                className="w-full min-h-[340px] px-3 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            ) : (
              <div className="w-full min-h-[340px] px-4 py-3 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 overflow-auto prose prose-slate dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {profileMarkdown || '（暂无内容）'}
                </ReactMarkdown>
              </div>
            )}
            <button
              type="button"
              onClick={() => handleSaveProfile()}
              disabled={profileSaving || profileLoading || !profileMarkdown.trim()}
              className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {profileSaving
                ? <><Loader2 size={14} className="animate-spin" /> 保存 Profile 中…</>
                : profileSaved
                  ? <><CheckCircle2 size={14} /> Profile 已保存</>
                  : <><Save size={14} /> 保存 Profile Markdown</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
