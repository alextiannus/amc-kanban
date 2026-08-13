'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  X, ChevronLeft, Sparkles, MapPin, Zap, Save,
  Settings, BookOpen, ExternalLink, Package, Loader2,
  RefreshCw, FileText, CheckCircle2, Store, Utensils,
  Camera, Edit3, Check, Plus, Trash2, ArrowRight,
  Star, Users, ChevronRight, Goal, Target, HelpCircle, Trophy,
  Bookmark, Compass
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  BrandIdentityFieldKey,
  BrandIdentitySnapshot,
  BrandIdentityStatus,
  BrandIdentityValue,
  PublishingFrequencyValue,
} from '@/lib/brandIdentity'

// ─── Types ────────────────────────────────────────────────────────────────────

import { BrandSettingsPanel } from './BrandSettingsPanel'

interface Brand {
  id: string
  name: string
  description?: string | null
  location?: string | null
  autoPilot?: boolean
  logoUrl?: string | null
  phone?: string | null
  website?: string | null
}

interface Props {
  brand?: Brand
  onUpdate?: (updated: any) => void
  onClose?: () => void
  brandTone?: string
  setBrandTone?: React.Dispatch<React.SetStateAction<string>>
  slangDict?: Record<string, string>
  setSlangDict?: React.Dispatch<React.SetStateAction<Record<string, string>>>
  subscriptionPlan?: string
  addons?: { veo3: boolean; dubco: boolean }
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void
  onOpenSettings?: () => void
  onOpenKnowledge?: () => void
  subscriptionHref?: string
}

type StoreInfo = {
  storeId: string
  name: string
  address: string
  timezone?: string
  latitude?: number | null
  longitude?: number | null
  googlePlaceId?: string
  isPrimary?: boolean
  status?: string
  phone?: string
  businessHours?: string
  reservationUrl?: string
  orderingUrl?: string
}

type GrowthSyncStatus = {
  status: 'NOT_QUEUED' | 'PENDING' | 'PROCESSING' | 'CONFLICT' | 'SYNCED'
  pendingPaths: string[]
  attempts: number
  nextRetryAt: string | null
  errorCode: string | null
  errorMessage: string | null
  conflicts: Array<{ path: string; code: string; kanban_value: unknown; growth_value: unknown }>
  lastSyncedAt: string | null
}

const GROWTH_CONFLICT_MESSAGES: Record<string, string> = {
  missing_baseline: 'Growth 已有值，但尚未建立 Kanban 同步基线',
  both_changed: 'Kanban 与 Growth 都修改过这个字段',
  google_place_id_bound_elsewhere: '该 Google Place ID 已绑定到其他 Growth 商家或门店',
  location_mapping_brand_conflict: '该门店的 Growth 归属与当前品牌不一致',
  ambiguous_normalized_address: 'Growth 中有多个相同地址的门店，无法自动确认',
  store_id_required: '门店缺少稳定 ID，暂时无法同步',
}

function growthConflictMessage(conflict?: GrowthSyncStatus['conflicts'][number]) {
  return conflict
    ? GROWTH_CONFLICT_MESSAGES[conflict.code] || 'Growth 拒绝了本次字段覆盖，请检查两侧数据'
    : '版本冲突，等待人工处理'
}

type IdentityRowProps = {
  label: string
  englishLabel: string
  icon: React.ReactNode
  iconClassName: string
  value: React.ReactNode
  editable: boolean
  warning?: string
  status?: BrandIdentityStatus
  syncing?: boolean
  onSyncAction?: (action: 'retry' | 'overwrite' | 'use_growth') => void
  onEdit: () => void
}

function IdentityRow({ label, englishLabel, icon, iconClassName, value, editable, warning, status, syncing, onSyncAction, onEdit }: IdentityRowProps) {
  return (
    <div className="group relative px-4 md:px-6 py-4 grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-2 md:gap-4">
      <div className="flex items-start gap-2 pt-0.5">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClassName}`}>
          {icon}
        </div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">
          {label}<br />
          <span className="text-[9px] font-semibold text-slate-300 dark:text-slate-600 normal-case tracking-normal">{englishLabel}</span>
        </span>
      </div>
      <div className="min-w-0 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
        {value}
        {warning && <p className="mt-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">{warning}</p>}
        {status === 'pending_sync' && onSyncAction && (
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 text-[9px] font-black text-amber-700 dark:text-amber-300">已保存 · 待同步</span>
            <button type="button" disabled={syncing} onClick={() => onSyncAction('retry')} className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 hover:text-amber-800 disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />立即重试
            </button>
          </div>
        )}
        {status === 'sync_conflict' && onSyncAction && (
          <div className="mt-2 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 p-2.5">
            <p className="text-[10px] font-black text-rose-700 dark:text-rose-300">同步冲突：Growth 中已有更新</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={syncing} onClick={() => onSyncAction('overwrite')} className="rounded-lg bg-rose-600 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50">覆盖到 Growth</button>
              <button type="button" disabled={syncing} onClick={() => onSyncAction('use_growth')} className="rounded-lg border border-rose-200 dark:border-rose-800 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:text-rose-300 disabled:opacity-50">采用 Growth 最新值</button>
            </div>
          </div>
        )}
      </div>
      {editable && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`编辑${label}`}
          title={`编辑${label}`}
          className="absolute right-4 top-4 md:static md:self-start p-2 rounded-lg text-slate-400 bg-white/90 dark:bg-slate-900/90 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-all"
        >
          <Edit3 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

const IDENTITY_LABELS: Record<BrandIdentityFieldKey, string> = {
  brandTone: 'AI 品牌声调',
  targetAudience: '目标客群',
  sellingPoints: '核心卖点',
  operatingRegion: '运营区域',
  brandVoice: '品牌 Voice',
  brandImage: '品牌形象',
  promotionFocus: '推广重点',
  publishingFrequency: '发布频次',
}

const PUBLISHING_PLATFORMS = ['instagram', 'xiaohongshu', 'tiktok', 'facebook'] as const


// ─── Plan badge helper ────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const isActive = plan !== '未激活订阅'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
      isActive
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-slate-100 text-slate-400'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
      {plan}
    </span>
  )
}

export default function BrandProfileView(props: Props) {
  if (!props.brand?.id) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950 text-center">
        <div className="max-w-sm">
          <Store className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-4" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-400">暂无选定品牌</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">请先在左上角切换或选择一个品牌进行代运营配置。</p>
        </div>
      </div>
    )
  }

  return <BrandProfileContent {...props} brand={props.brand} />
}

function BrandProfileContent({
  brand,
  onUpdate,
  onClose,
  brandTone,
  setBrandTone,
  slangDict,
  setSlangDict,
  subscriptionPlan,
  addons,
  showToast,
  onOpenSettings,
  onOpenKnowledge,
  subscriptionHref,
}: Props & { brand: Brand }) {
  const brandId = brand.id

  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncingAccounts, setSyncingAccounts] = useState(false)
  const [syncAccountsStatus, setSyncAccountsStatus] = useState<string | null>(null)

  // Layout presentation states
  const [showStoryEditor, setShowStoryEditor] = useState(false)
  const [showDetailedReport, setShowDetailedReport] = useState(false)

  // Local Brand States (fetched on mount/change, used if props are not passed)
  const [localBrandTone, setLocalBrandTone] = useState('')
  const [localSlangDict, setLocalSlangDict] = useState<Record<string, string>>({})
  const [localSubscriptionPlan, setLocalSubscriptionPlan] = useState('未激活订阅')
  const [localAddons, setLocalAddons] = useState({ veo3: false, dubco: false })
  const [showSettings, setShowSettings] = useState(false)
  const [brandSettings, setBrandSettings] = useState<Record<string, unknown> | null>(null)

  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showContextModal, setShowContextModal] = useState(false)
  const [identitySnapshot, setIdentitySnapshot] = useState<BrandIdentitySnapshot | null>(null)
  const [identityLoading, setIdentityLoading] = useState(true)
  const [editingIdentityField, setEditingIdentityField] = useState<BrandIdentityFieldKey | null>(null)
  const [identityDraft, setIdentityDraft] = useState<BrandIdentityValue>('')
  const [identitySaving, setIdentitySaving] = useState(false)
  const [identitySyncingField, setIdentitySyncingField] = useState<BrandIdentityFieldKey | null>(null)
  const [identityError, setIdentityError] = useState('')
  const [growthSyncStatus, setGrowthSyncStatus] = useState<GrowthSyncStatus | null>(null)
  const [growthSyncAction, setGrowthSyncAction] = useState(false)

  // Controlled vs Uncontrolled logic
  const activeBrandTone = brandTone !== undefined ? brandTone : localBrandTone
  const activeSlangDict = slangDict !== undefined ? slangDict : localSlangDict
  const activeSubscriptionPlan = subscriptionPlan !== undefined ? subscriptionPlan : localSubscriptionPlan
  const activeAddons = addons !== undefined ? addons : localAddons

  const setBrandToneVal = setBrandTone || setLocalBrandTone
  const setSlangDictVal = setSlangDict || setLocalSlangDict

  // Section 1: Brand Story extras
  const [draftAudience, setDraftAudience] = useState('')
  const [draftProduct, setDraftProduct] = useState('')
  const [draftNegPrompts, setDraftNegPrompts] = useState<string[]>([])
  const [newNegPrompt, setNewNegPrompt] = useState('')

  // Section 2: Business Info
  const [draftBusinessHours, setDraftBusinessHours] = useState('')
  const [draftReservationUrl, setDraftReservationUrl] = useState('')
  const [draftOrderingUrl, setDraftOrderingUrl] = useState('')
  const [draftDeliveryUrls, setDraftDeliveryUrls] = useState<Array<{platform: string; url: string}>>([])
  const [draftStores, setDraftStores] = useState<StoreInfo[]>([])

  // Section 3: Knowledge Base
  const [draftMarket, setDraftMarket] = useState('')
  const [draftDistrict, setDraftDistrict] = useState('')
  const [draftCompetitors, setDraftCompetitors] = useState<string[]>([])
  const [newCompetitor, setNewCompetitor] = useState('')

  // Brand Identity extension: promotion focus and publishing frequency
  const [promoPlan, setPromoPlan] = useState<{
    period: string; startDate: string; endDate: string
    direction: string; copywritingRequirements: string
    brandVoice: string; brandImage: string
    keyMessages: string[]; campaigns: Array<{name: string; dates: string; desc: string}>
  }>({
    period: 'monthly', startDate: '', endDate: '',
    direction: '', copywritingRequirements: '',
    brandVoice: '', brandImage: '',
    keyMessages: [], campaigns: [],
  })
  // Per-brand publishing frequency
  const [publishingFreq, setPublishingFreq] = useState<{
    postsPerDay: number
    platforms: Record<string, { postsPerDay?: number; postsPerWeek?: number; preferredHours?: number[] }>
  }>({ postsPerDay: 1, platforms: {} })

  // Inline brand info editing
  const [editingName, setEditingName] = useState(false)
  const [editingBiz, setEditingBiz] = useState(false)
  const [editingKnowledge, setEditingKnowledge] = useState(false)
  const [brandAccounts, setBrandAccounts] = useState<Array<{
    id: string; platformId: string; handle: string; displayName?: string | null;
    profileUrl?: string | null; followerCount?: number | null; followerDelta?: number | null;
  }>>([])
  const [researchSyncing, setResearchSyncing] = useState(false)
  const [draftName, setDraftName] = useState(brand.name || '')
  const [draftDesc, setDraftDesc] = useState(brand.description || '')
  const [draftLocation, setDraftLocation] = useState(brand.location || '')
  const [draftAddress, setDraftAddress] = useState((brand as any).address || '')
  const [draftPhone, setDraftPhone] = useState((brand as any).phone || '')
  const [draftWebsite, setDraftWebsite] = useState((brand as any).website || '')

  // Logo upload
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(brand.logoUrl || null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Slang form
  const [newTerm, setNewTerm] = useState('')
  const [newMeaning, setNewMeaning] = useState('')

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToastVal = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (showToast) {
      showToast(message, type)
    } else {
      setToast({ message, type })
      setTimeout(() => setToast(null), 3000)
    }
  }

  // Profile Markdown (embedded editor & growth parsing)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileMarkdown, setProfileMarkdown] = useState('')

  const loadProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/profile`)
      if (!res.ok) return
      const data = await res.json()
      const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
      setProfileMarkdown(markdown)
    } catch (e) {
      console.error('Failed to load brand profile markdown:', e)
    } finally {
      setProfileLoading(false)
    }
  }

  const loadIdentity = async () => {
    setIdentityLoading(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/identity`)
      if (!res.ok) throw new Error('无法读取品牌定位')
      setIdentitySnapshot(await res.json())
    } catch (error) {
      console.error('Failed to load brand identity:', error)
      setIdentitySnapshot(null)
    } finally {
      setIdentityLoading(false)
    }
  }

  const loadGrowthSyncStatus = async () => {
    try {
      const res = await fetch(`/api/brands/${brandId}/growth-sync`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json() as GrowthSyncStatus
        setGrowthSyncStatus(data)
        return data
      }
    } catch (error) {
      console.error('Failed to load Growth sync status:', error)
    }
    return null
  }

  const loadAllConfig = async () => {
    try {
      // 1. Fetch brand metadata for details (description, location, address, etc.)
      const resBrand = await fetch(`/api/brands/${brandId}`)
      if (resBrand.ok) {
        const dataBrand = await resBrand.json()
        setDraftName(dataBrand.name || '')
        setDraftDesc(dataBrand.description || '')
        setDraftLocation(dataBrand.location || '')
        setBrandSettings(dataBrand)
        // Always reset logo — don't keep brand A's logo if brand B has none
        setLogoPreview(dataBrand.logoUrl || null)
        // Always reset contact fields — prevents A's address from showing on B
        setDraftAddress((dataBrand as any).address || '')
        setDraftPhone((dataBrand as any).phone || '')
        setDraftWebsite((dataBrand as any).website || '')
      } else {
        // Fetch failed — ensure all brand meta fields are cleared
        setDraftName(''); setDraftDesc(''); setDraftLocation('')
        setDraftAddress(''); setDraftPhone(''); setDraftWebsite('')
        setLogoPreview(null)
      }

      // 2. Fetch brand knowledge (all sections)
      const resKnowledge = await fetch(`/api/brands/${brandId}/knowledge`)
      if (resKnowledge.ok) {
        const k = await resKnowledge.json()
        // Section 1 — brand story / tone
        setLocalBrandTone(k.brandTone || '')
        setLocalSlangDict(k.slangDict || {})
        setDraftAudience(k.audienceAssumptions || '')
        setDraftProduct(k.productAssumptions || '')
        setDraftNegPrompts(k.negPrompts || [])
        // Section 2 — business info
        // Always set (not conditionally): if brand B has no hours, clear the field
        if (typeof k.businessHours === 'string') setDraftBusinessHours(k.businessHours)
        else if (k.businessHours && typeof k.businessHours === 'object') setDraftBusinessHours(JSON.stringify(k.businessHours, null, 2))
        else setDraftBusinessHours('')
        setDraftReservationUrl(k.reservationUrl || '')
        setDraftOrderingUrl(k.orderingUrl || '')
        setDraftDeliveryUrls(Array.isArray(k.deliveryUrls) ? k.deliveryUrls : [])
        setDraftStores(Array.isArray(k.stores) ? k.stores : [])
        // Section 3 — knowledge base
        setDraftMarket(k.market || '')
        setDraftDistrict(k.district || '')
        setDraftCompetitors(Array.isArray(k.competitors) ? k.competitors : [])
        // Section 4 — promo plan & publishing frequency
        // Always overwrite — never merge — so empty brand B doesn't inherit brand A's plan.
        // Merge on top of full defaults so partial/legacy DB objects never crash the UI
        // (e.g. old promoPlan with no keyMessages would make .map() throw).
        const PROMO_DEFAULTS = {
          period: 'monthly', startDate: '', endDate: '',
          direction: '', copywritingRequirements: '',
          brandVoice: '', brandImage: '',
          keyMessages: [] as string[], campaigns: [] as Array<{name:string;dates:string;desc:string}>,
        }
        const rawPlan = k.promoPlan && typeof k.promoPlan === 'object' ? k.promoPlan : {}
        setPromoPlan({
          ...PROMO_DEFAULTS,
          ...rawPlan,
          // Guard every array/object field explicitly
          keyMessages: Array.isArray(rawPlan.keyMessages) ? rawPlan.keyMessages : [],
          campaigns: Array.isArray(rawPlan.campaigns) ? rawPlan.campaigns : [],
        })
        const rawFreq = k.publishingFreq && typeof k.publishingFreq === 'object' ? k.publishingFreq : {}
        setPublishingFreq({
          postsPerDay: typeof rawFreq.postsPerDay === 'number' && rawFreq.postsPerDay > 0 ? rawFreq.postsPerDay : 1,
          platforms: rawFreq.platforms && typeof rawFreq.platforms === 'object' && !Array.isArray(rawFreq.platforms)
            ? rawFreq.platforms
            : {},
        })
      } else {
        // No knowledge record for this brand — reset every section to empty defaults
        setLocalBrandTone(''); setLocalSlangDict({})
        setDraftAudience(''); setDraftProduct(''); setDraftNegPrompts([])
        setDraftBusinessHours(''); setDraftReservationUrl(''); setDraftOrderingUrl(''); setDraftDeliveryUrls([]); setDraftStores([])
        setDraftMarket(''); setDraftDistrict(''); setDraftCompetitors([])
        setPromoPlan({ period: 'monthly', startDate: '', endDate: '', direction: '', copywritingRequirements: '', brandVoice: '', brandImage: '', keyMessages: [], campaigns: [] })
        setPublishingFreq({ postsPerDay: 1, platforms: {} })
      }

      // 3. Fetch subscription
      const resSub = await fetch(`/api/brands/${brandId}/subscription`)
      if (resSub.ok) {
        const dataSub = await resSub.json()
        setLocalSubscriptionPlan(dataSub.plan_name === 'NONE' ? '未激活订阅' : dataSub.plan_name)
        setLocalAddons({
          veo3: !!dataSub.selectedAddons?.veo3,
          dubco: !!dataSub.selectedAddons?.dubco,
        })
      }
    } catch (e) {
      console.error('Failed to load brand configuration:', e)
    }
  }

  useEffect(() => {
    void loadProfile()
    void loadAllConfig()
    void loadIdentity()
    void loadGrowthSyncStatus()
    if (brandId) {
      fetch(`/api/brands/${brandId}/accounts`)
        .then(r => r.ok ? r.json() : { accounts: [] })
        .then(d => setBrandAccounts(Array.isArray(d.accounts) ? d.accounts : []))
        .catch(() => {})
    }
  }, [brandId])

  useEffect(() => {
    if (!growthSyncStatus || !['PENDING', 'PROCESSING'].includes(growthSyncStatus.status)) return
    const timer = window.setInterval(() => {
      void loadGrowthSyncStatus()
      void loadIdentity()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [brandId, growthSyncStatus?.status])

  const handleGrowthSyncAction = async (
    action?: 'overwrite_growth' | 'use_growth',
    selectedPaths?: string[]
  ) => {
    setGrowthSyncAction(true)
    try {
      const paths = action ? selectedPaths || [] : undefined
      const res = await fetch(`/api/brands/${brandId}/growth-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action ? { action, paths } : {}),
      })
      if (!res.ok) throw new Error('sync_action_failed')
      const data = await res.json()
      setGrowthSyncStatus(data)
      const [, , refreshedStatus] = await Promise.all([loadIdentity(), loadAllConfig(), loadGrowthSyncStatus()])
      const finalStatus = refreshedStatus || data as GrowthSyncStatus
      if (finalStatus.status === 'SYNCED') {
        showToastVal('已同步到 AMC-Growth', 'success')
      } else if (finalStatus.status === 'CONFLICT') {
        showToastVal(`仍有冲突：${growthConflictMessage(finalStatus.conflicts[0])}`, 'error')
      } else {
        showToastVal('同步任务已更新', 'info')
      }
    } catch {
      showToastVal('Growth 同步操作失败，请稍后重试', 'error')
    } finally {
      setGrowthSyncAction(false)
    }
  }

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
        showToastVal('保存品牌 Profile 失败，请重试', 'error')
        return
      }
      const data = await res.json()
      const serverMarkdown = typeof data?.markdown === 'string' ? data.markdown : markdown
      setProfileMarkdown(serverMarkdown)
      setProfileSaved(true)
      showToastVal('品牌 Profile 已保存', 'success')
      if (data.brand && onUpdate) {
        onUpdate(data.brand)
      }
      await loadAllConfig()
      await loadGrowthSyncStatus()
      setTimeout(() => setProfileSaved(false), 2500)
    } catch (e) {
      console.error(e)
      showToastVal('保存品牌 Profile 失败，请检查网络', 'error')
    } finally {
      setProfileSaving(false)
    }
  }

  const buildEditableBrandContextMarkdown = () => {
    const storeLines = draftStores.length
      ? draftStores
          .filter((s) => s.name || s.address)
          .map((s, index) => [
            `### ${s.name || `门店 ${index + 1}`}`,
            s.storeId ? `<!-- AMC:STORE_ID:${s.storeId} -->` : '',
            s.address ? `- 地址：${s.address}` : '',
            s.phone ? `- 电话：${s.phone}` : '',
            s.businessHours ? `- 营业时间：${s.businessHours}` : '',
            s.reservationUrl ? `- 订座链接：${s.reservationUrl}` : '',
            s.orderingUrl ? `- 下单链接：${s.orderingUrl}` : '',
          ].filter(Boolean).join('\n'))
          .join('\n\n')
      : [
          draftAddress ? `- 主门店地址：${draftAddress}` : '',
          draftPhone ? `- 联系电话：${draftPhone}` : '',
          draftWebsite ? `- 品牌网站：${draftWebsite}` : '',
          draftBusinessHours ? `- 营业时间：${draftBusinessHours}` : '',
          draftReservationUrl ? `- 订座链接：${draftReservationUrl}` : '',
          draftOrderingUrl ? `- 下单链接：${draftOrderingUrl}` : '',
        ].filter(Boolean).join('\n') || '（暂未填写）'

    return `# ${draftName || brand.name} 品牌上下文

## 品牌介绍
${draftDesc || '（暂未填写）'}

## 经营信息
${storeLines}
`
  }

  const openEditableBrandContext = () => {
    setProfileMarkdown(buildEditableBrandContextMarkdown())
    setShowContextModal(true)
  }

  const handleRefreshProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/profile?refresh=1`)
      if (!res.ok) {
        showToastVal('刷新 Profile 失败，请稍后再试', 'error')
        return
      }
      const data = await res.json()
      const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
      setProfileMarkdown(markdown)
      showToastVal('品牌自动部分刷新成功', 'success')
    } catch (e) {
      console.error(e)
      showToastVal('刷新 Profile 失败，请检查网络', 'error')
    } finally {
      setProfileLoading(false)
    }
  }

  const extractBlock = (markdownStr: string, startTag: string, endTag: string): string => {
    const startIdx = markdownStr.indexOf(startTag)
    const endIdx = markdownStr.indexOf(endTag)
    if (startIdx >= 0 && endIdx > startIdx) {
      return markdownStr.slice(startIdx + startTag.length, endIdx).trim()
    }
    return ''
  }

  const growthContext = extractBlock(
    profileMarkdown,
    '<!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:START -->',
    '<!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:END -->'
  )

  const growthPlan = extractBlock(
    profileMarkdown,
    '<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:START -->',
    '<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:END -->'
  )

  const presentationSlidesRaw = extractBlock(
    profileMarkdown,
    '<!-- AMC:BRAND_PROFILE:PRESENTATION_SLIDES:START -->',
    '<!-- AMC:BRAND_PROFILE:PRESENTATION_SLIDES:END -->'
  )

  let presentationSlides: Array<{ title: string; content: string }> = []
  if (presentationSlidesRaw) {
    try {
      presentationSlides = JSON.parse(presentationSlidesRaw)
    } catch (e) {
      console.error('Failed to parse synced presentation slides:', e)
    }
  }

  // Helper to extract nested section blocks from growthContext markdown
  const extractSubBlock = (text: string, header: string): string => {
    const idx = text.indexOf(header)
    if (idx === -1) return ''
    const startIdx = idx + header.length
    const remaining = text.slice(startIdx)
    const nextHeadingIdx = remaining.search(/\n(###|##)\s/)
    if (nextHeadingIdx !== -1) {
      return remaining.slice(0, nextHeadingIdx).trim()
    }
    return remaining.trim()
  }

  // Parse deep brand context from synced AMC-Growth markdown
  const parsedTargets = extractSubBlock(growthContext, '### 8.2 老板目标')
  const parsedPainPoints = extractSubBlock(growthContext, '### 8.3 当前痛点')

  // Parse brand story sections from synced AMC-Growth markdown
  const brandStoryRaw = extractBlock(
    profileMarkdown,
    '<!-- AMC:BRAND_PROFILE:BRAND_STORY:START -->',
    '<!-- AMC:BRAND_PROFILE:BRAND_STORY:END -->'
  )
  const parsedBrandStoryText = extractSubBlock(brandStoryRaw, '### 12.1 品牌故事')
  const parsedStoresInfo = extractSubBlock(brandStoryRaw, '### 12.2 门店信息')
  const parsedBrandPositioning = extractSubBlock(brandStoryRaw, '### 12.3 品牌定位')
  const parsedSignatureDishes = extractSubBlock(brandStoryRaw, '### 12.4 招牌菜')
  const parsedDiningGuide = extractSubBlock(brandStoryRaw, '### 12.5 用餐攻略')

  // Parse platform stats safely
  const accounts = (brandSettings?.accounts as any[]) || []
  const totalFollowers = accounts.reduce((sum, acc) => sum + (acc.followerCount || 0), 0)
  const googleAccount = accounts.find(acc => ['google', 'google_maps', 'gbp', 'gmb', 'google_business_profile'].includes(acc.platformId.toLowerCase()))
  const googleRating = googleAccount?.ratingScore || null
  const hasRealData = totalFollowers > 0 || googleRating !== null

  const cleanBrandStoryText = (text: string): string => {
    if (!text) return ''
    const sentences = text.split(/([。！？；.!?;\n])/)
    const result: string[] = []
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i]
      if (!s) continue
      const lower = s.toLowerCase()
      const isSystemInfo =
        lower.includes('订阅服务') ||
        lower.includes('starter plan') ||
        lower.includes('essential plan') ||
        lower.includes('pro plan') ||
        lower.includes('本文保留') ||
        lower.includes('实际执行') ||
        lower.includes('范围落地') ||
        lower.includes('升级探讨') ||
        lower.includes('代更新')
      if (isSystemInfo) {
        if (i + 1 < sentences.length && /^[。！？；.!?;\n]/.test(sentences[i + 1])) {
          i++
        }
        continue
      }
      result.push(s)
    }
    return result.join('').trim().replace(/\n+/g, '\n').replace(/^\s+|\s+$/g, '')
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSyncGrowth = async () => {
    setSyncing(true)
    setSyncStatus('正在同步...')
    try {
      const res = await fetch(`/api/brands/${brandId}/sync-growth`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setSyncStatus('同步成功')
        showToastVal(`品牌分析同步成功 (${data.merchantName || data.merchantId})`, 'success')
        void loadProfile() // Refresh local copy of profile markdown
        void loadAllConfig()
        setTimeout(() => setSyncStatus(null), 3000)
      } else {
        setSyncStatus('同步失败')
        showToastVal(data.error || '同步失败，未找到匹配 hometown 的 Growth 商家分析', 'error')
        setTimeout(() => setSyncStatus(null), 5000)
      }
    } catch (e) {
      console.error(e)
      setSyncStatus('同步失败')
      showToastVal('网络请求失败', 'error')
      setTimeout(() => setSyncStatus(null), 5000)
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAccounts = async () => {
    setSyncingAccounts(true)
    setSyncAccountsStatus('正在同步...')
    try {
      const res = await fetch(`/api/brands/${brandId}/sync-postfast`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setSyncAccountsStatus('同步成功')
        showToastVal(`已成功同步 ${data.accountCount || 0} 个社交媒体账号和发布数据！`, 'success')
        void loadAllConfig() // Refresh settings and accounts
        setTimeout(() => setSyncAccountsStatus(null), 3000)
      } else {
        setSyncAccountsStatus('同步失败')
        showToastVal(data.error || '同步账号失败', 'error')
        setTimeout(() => setSyncAccountsStatus(null), 5000)
      }
    } catch (e) {
      console.error(e)
      setSyncAccountsStatus('同步失败')
      showToastVal('同步请求失败，请检查网络连接', 'error')
      setTimeout(() => setSyncAccountsStatus(null), 5000)
    } finally {
      setSyncingAccounts(false)
    }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setLogoPreview(previewUrl)
    setUploadingLogo(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/brands/${brandId}/logo`, { method: 'POST', body: form })
      if (res.ok) {
        showToastVal('品牌 Logo 已更新', 'success')
        await loadGrowthSyncStatus()
      } else {
        showToastVal('Logo 上传失败', 'error')
      }
    } catch {
      showToastVal('Logo 上传失败', 'error')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSaveBrandInfo = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftName,
          description: draftDesc,
          address: draftAddress,
          phone: draftPhone,
          website: draftWebsite,
        }),
      })
      if (res.ok) {
        showToastVal('品牌信息已保存', 'success')
        setEditingName(false)
        const data = await res.json()
        setDraftDesc(data.description || '')
        if (onUpdate) onUpdate(data)
        await loadGrowthSyncStatus()
      } else {
        showToastVal('保存失败，请重试', 'error')
      }
    } catch {
      showToastVal('网络错误，保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Save any knowledge section fields
  const saveKnowledge = async (fields: Record<string, unknown>, successMsg?: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/knowledge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (res.ok) {
        showToastVal(successMsg ?? '已保存', 'success')
        await loadGrowthSyncStatus()
        return true
      } else {
        showToastVal('保存失败，请重试', 'error')
        return false
      }
    } catch {
      showToastVal('网络错误，保存失败', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }


  const handleSaveSlang = async () => {
    await saveKnowledge({ slangDict: activeSlangDict }, '俚语词典已保存')
  }

  const openIdentityEditor = (field: BrandIdentityFieldKey) => {
    const current = identitySnapshot?.fields[field]
    if (!current?.editable) return
    setIdentityDraft(JSON.parse(JSON.stringify(current.value)) as BrandIdentityValue)
    setIdentityError('')
    setEditingIdentityField(field)
  }

  const updateLocalIdentityState = (field: BrandIdentityFieldKey, value: BrandIdentityValue) => {
    if (field === 'brandTone' && typeof value === 'string') setBrandToneVal(value)
    if (field === 'targetAudience' && typeof value === 'string') setDraftAudience(value)
    if (field === 'sellingPoints' && Array.isArray(value)) setDraftProduct(value.join('\n'))
    if (field === 'operatingRegion' && typeof value === 'string') setDraftLocation(value)
    if (field === 'brandVoice' && typeof value === 'string') setPromoPlan(current => ({ ...current, brandVoice: value }))
    if (field === 'brandImage' && typeof value === 'string') setPromoPlan(current => ({ ...current, brandImage: value }))
    if (field === 'promotionFocus' && typeof value === 'string') setPromoPlan(current => ({ ...current, direction: value }))
    if (field === 'publishingFrequency' && typeof value === 'object' && !Array.isArray(value)) {
      setPublishingFreq(value as PublishingFrequencyValue)
    }
  }

  const handleSaveIdentity = async () => {
    if (!editingIdentityField || !identitySnapshot) return
    const current = identitySnapshot.fields[editingIdentityField]
    setIdentitySaving(true)
    setIdentityError('')
    try {
      const res = await fetch(`/api/brands/${brandId}/identity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: editingIdentityField,
          value: identityDraft,
          expectedVersion: current.version ?? 0,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.message || data.error || '保存失败，请重试')
      }
      const nextField = data.field
      setIdentitySnapshot(snapshot => snapshot ? {
        ...snapshot,
        growthAvailable: data.growthAvailable ?? snapshot.growthAvailable,
        fields: { ...snapshot.fields, [editingIdentityField]: nextField },
      } : snapshot)
      updateLocalIdentityState(editingIdentityField, nextField.value)
      await loadGrowthSyncStatus()
      if (data.syncStatus === 'pending_sync') {
        showToastVal(`${IDENTITY_LABELS[editingIdentityField]}已保存并生效，等待同步到 AMC-Growth`, 'info')
      } else if (data.syncStatus === 'sync_conflict') {
        showToastVal(`${IDENTITY_LABELS[editingIdentityField]}已保存并生效，但需要处理同步冲突`, 'info')
      } else {
        showToastVal(`${IDENTITY_LABELS[editingIdentityField]}已保存并立即生效`, 'success')
      }
      setEditingIdentityField(null)
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : '保存失败，请重试')
    } finally {
      setIdentitySaving(false)
    }
  }

  const handleIdentitySyncAction = async (
    field: BrandIdentityFieldKey,
    action: 'retry' | 'overwrite' | 'use_growth'
  ) => {
    setIdentitySyncingField(field)
    try {
      const res = await fetch(`/api/brands/${brandId}/identity/${field}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || '同步操作失败')
      const nextField = data.field
      setIdentitySnapshot(snapshot => snapshot ? {
        ...snapshot,
        growthAvailable: data.growthAvailable ?? snapshot.growthAvailable,
        fields: { ...snapshot.fields, [field]: nextField },
      } : snapshot)
      updateLocalIdentityState(field, nextField.value)
      if (data.syncStatus === 'published') showToastVal(`${IDENTITY_LABELS[field]}已同步到 AMC-Growth`, 'success')
      else if (data.syncStatus === 'discarded') showToastVal(`已采用 AMC-Growth 的${IDENTITY_LABELS[field]}`, 'success')
      else if (data.syncStatus === 'sync_conflict') showToastVal('Growth 版本再次变化，请重新处理冲突', 'info')
      else showToastVal('同步暂未完成，系统将继续自动重试', 'info')
    } catch (error) {
      showToastVal(error instanceof Error ? error.message : '同步操作失败', 'error')
    } finally {
      setIdentitySyncingField(null)
    }
  }

  const handleAddSlang = () => {
    const term = newTerm.trim()
    const meaning = newMeaning.trim()
    if (!term || !meaning) return
    setSlangDictVal({ ...activeSlangDict, [term]: meaning })
    setNewTerm('')
    setNewMeaning('')
  }

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings()
    } else {
      setShowSettings(true)
    }
  }

  // ── Growth Slide Color Map helpers ──────────────────────────────────────────

  const getGrowthSlideGradient = (index: number) => {
    const gradients = [
      'from-indigo-650 via-purple-600 to-indigo-800',
      'from-rose-600 via-red-500 to-rose-700',
      'from-amber-600 via-orange-500 to-amber-700',
      'from-emerald-600 via-teal-500 to-emerald-700',
      'from-teal-600 via-cyan-500 to-teal-700',
      'from-cyan-600 via-blue-500 to-cyan-700',
      'from-pink-600 via-rose-500 to-pink-700',
      'from-purple-600 via-violet-500 to-purple-700',
      'from-violet-600 via-fuchsia-500 to-violet-700',
      'from-slate-700 via-slate-800 to-slate-900',
    ]
    return gradients[index % gradients.length]
  }

  const getGrowthSlideGlow = (index: number) => {
    const glows = [
      'rgba(99,102,241,0.22)',
      'rgba(239,68,68,0.22)',
      'rgba(245,158,11,0.22)',
      'rgba(16,185,129,0.22)',
      'rgba(20,184,166,0.22)',
      'rgba(6,182,212,0.22)',
      'rgba(236,72,153,0.22)',
      'rgba(139,92,246,0.22)',
      'rgba(168,85,247,0.22)',
      'rgba(75,85,99,0.22)',
    ]
    return glows[index % glows.length]
  }

  const getGrowthSlideEmoji = (title: string) => {
    if (title.includes('当前') || title.includes('判断')) return '🔍'
    if (title.includes('问题') || title.includes('痛点')) return '⚠️'
    if (title.includes('机会') || title.includes('优势')) return '💡'
    if (title.includes('30天') || title.includes('验证')) return '📅'
    if (title.includes('90天') || title.includes('增长')) return '📈'
    if (title.includes('180天') || title.includes('品牌')) return '🏆'
    if (title.includes('指标') || title.includes('成功')) return '📊'
    if (title.includes('内容') || title.includes('方向')) return '✍️'
    if (title.includes('下一步') || title.includes('行动')) return '🏁'
    return '🚀'
  }

  const formatSlideContent = (content: string) => {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.some(l => l.startsWith('-') || l.startsWith('*') || l.match(/^\d+\./))) {
      return (
        <ul className="list-disc list-inside space-y-3.5 mt-3.5 text-xs md:text-sm text-white/95 font-medium leading-relaxed">
          {lines.map((line, idx) => {
            const cleanLine = line.replace(/^[-*\d+.\s]+/, '')
            return <li key={idx} className="drop-shadow-sm">{cleanLine}</li>
          })}
        </ul>
      )
    }
    return (
      <p className="text-xs md:text-sm text-white/95 font-medium leading-relaxed drop-shadow-sm mt-3.5">
        {content}
      </p>
    )
  }


  const parseBulletList = (text: string): string[] => {
    if (!text) return []
    return text
      .split(/\n+/)
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('*'))
      .map(line => line.replace(/^[-*]\s+/, '').trim())
  }

  const signatureDishesList = parseBulletList(parsedSignatureDishes)
  const dishes = signatureDishesList.map(item => {
    const cleanItem = item.replace(/\*\*/g, '')
    const parts = cleanItem.split(/[：:]/)
    return {
      title: parts[0] || '',
      desc: parts.slice(1).join('：') || ''
    }
  }).filter(d => d.title)

  const storesList = parseBulletList(parsedStoresInfo)
  const stores = storesList.map(item => {
    const cleanItem = item.replace(/\*\*/g, '')
    const parts = cleanItem.split(/[：:]/)
    return {
      name: parts[0] || '',
      details: parts.slice(1).join('：') || ''
    }
  }).filter(s => s.name)

  const diningGuideList = parseBulletList(parsedDiningGuide)
  const guides = diningGuideList.map(item => {
    const cleanItem = item.replace(/\*\*/g, '')
    const parts = cleanItem.split(/[：:]/)
    return {
      title: parts[0] || '',
      content: parts.slice(1).join('：') || ''
    }
  }).filter(g => g.title)

  const activeSubscriptionHref = subscriptionHref || `/profile/principal/brands/${brandId}/billing`
  const identityField = (field: BrandIdentityFieldKey) => identitySnapshot?.fields[field]
  const identityText = (field: BrandIdentityFieldKey, fallback = '') => {
    const value = identityField(field)?.value
    return typeof value === 'string' ? value : fallback
  }
  const identityList = (field: BrandIdentityFieldKey, fallback: string[] = []) => {
    const value = identityField(field)?.value
    return Array.isArray(value) ? value : fallback
  }
  const resolvedPublishingFrequency = (() => {
    const value = identityField('publishingFrequency')?.value
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as PublishingFrequencyValue
      : publishingFreq
  })()
  const emptyIdentityValue = identityLoading
    ? <span className="text-xs text-slate-300 dark:text-slate-600">加载中…</span>
    : <em className="text-slate-300 dark:text-slate-600 font-normal not-italic text-xs">暂无数据。</em>
  const editingIdentity = editingIdentityField ? identityField(editingIdentityField) : undefined
  const editingPublishingFrequency = identityDraft && typeof identityDraft === 'object' && !Array.isArray(identityDraft)
    ? identityDraft as PublishingFrequencyValue
    : { postsPerDay: 1, platforms: {} }
  const identitySyncProps = (field: BrandIdentityFieldKey) => ({
    status: identityField(field)?.status,
    syncing: identitySyncingField === field,
    onSyncAction: (action: 'retry' | 'overwrite' | 'use_growth') => handleIdentitySyncAction(field, action),
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col min-h-0 bg-[#f7f9fb] dark:bg-slate-950 overflow-y-auto relative h-full"
    >
      {/* ── Unified Top Navigation Navbar (Consolidated Header) ── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-3.5 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 transition-colors cursor-pointer"
              title="返回"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          
          <div className="flex items-center gap-2">
            {/* Logo in Navbar */}
            <div 
              className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200/50 dark:bg-slate-800 dark:border-slate-700 overflow-hidden flex items-center justify-center cursor-pointer group relative"
              onClick={() => logoInputRef.current?.click()}
              title="点击上传 Logo"
            >
              {logoPreview || brand.logoUrl ? (
                <img
                  src={logoPreview || brand.logoUrl!}
                  alt={draftName}
                  className="w-full h-full object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.svg' }}
                />
              ) : (
                <Utensils className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />

            {/* Name & Badges */}
            <div className="flex items-center gap-1.5">
              {editingName ? (
                <div className="flex items-center gap-1">
                  <input
                    value={draftName}
                    onChange={e => setDraftName(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white text-xs font-black rounded-lg px-2 py-1 outline-none border border-slate-200 dark:border-slate-700 focus:border-amber-400"
                    placeholder="品牌名称"
                  />
                  <button
                    onClick={handleSaveBrandInfo}
                    disabled={saving}
                    className="p-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 cursor-pointer active:scale-95 transition-all"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="p-1 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-black text-slate-800 dark:text-white truncate max-w-[120px] md:max-w-[200px]">{draftName}</h1>
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer flex-shrink-0"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </div>
              )}

              {draftLocation && (
                <span className="hidden md:flex items-center gap-0.5 text-slate-400 text-[10px] font-bold">
                  <MapPin className="w-2.5 h-2.5" />{draftLocation}
                </span>
              )}
              <PlanBadge plan={activeSubscriptionPlan} />
              {brand.autoPilot && (
                <span className="flex items-center gap-0.5 text-[9px] font-black bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                  <Zap className="w-2.5 h-2.5 animate-pulse" />托管
                </span>
              )}
            </div>
          </div>
        </div>


        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border border-slate-200/50 dark:border-slate-700/50 transition-all cursor-pointer active:scale-95"
          >
            <Settings className="w-3.5 h-3.5 text-slate-450" />
            品牌配置
          </button>
          <button
            onClick={openEditableBrandContext}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <BookOpen className="w-3.5 h-3.5" />
            编辑介绍与经营信息
          </button>
        </div>
      </div>

      {growthSyncStatus && ['PENDING', 'PROCESSING', 'CONFLICT'].includes(growthSyncStatus.status) && (
        <div className={`mx-5 mt-4 rounded-2xl border px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${growthSyncStatus.status === 'CONFLICT' ? 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20'}`}>
          <div>
            <p className={`text-xs font-black ${growthSyncStatus.status === 'CONFLICT' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {growthSyncStatus.status === 'CONFLICT' ? 'AMC-Growth 版本冲突' : '本地修改已保存，正在同步到 AMC-Growth'}
            </p>
            <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {growthSyncStatus.status === 'CONFLICT'
                ? growthConflictMessage(growthSyncStatus.conflicts[0])
                : growthSyncStatus.errorMessage || (growthSyncStatus.status === 'PROCESSING' ? '正在发送商家与门店快照' : '系统将自动重试')}
              {growthSyncStatus.nextRetryAt ? ` · 下次重试 ${new Date(growthSyncStatus.nextRetryAt).toLocaleString()}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {growthSyncStatus.status === 'CONFLICT' ? (
              <div className="space-y-1.5">
                {growthSyncStatus.conflicts.map(conflict => (
                  <div key={conflict.path} className="flex flex-wrap items-center justify-end gap-2">
                    <span className="max-w-52 truncate text-[10px] font-semibold text-rose-600 dark:text-rose-300" title={conflict.path}>{conflict.path}</span>
                    <button type="button" disabled={growthSyncAction} onClick={() => void handleGrowthSyncAction('overwrite_growth', [conflict.path])} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">覆盖到 Growth</button>
                    <button type="button" disabled={growthSyncAction} onClick={() => void handleGrowthSyncAction('use_growth', [conflict.path])} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[10px] font-bold text-rose-700 dark:border-rose-800 dark:bg-transparent dark:text-rose-300 disabled:opacity-50">采用 Growth 当前值</button>
                  </div>
                ))}
              </div>
            ) : (
              <button type="button" disabled={growthSyncAction} onClick={() => void handleGrowthSyncAction()} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[10px] font-bold text-amber-700 dark:border-amber-800 dark:bg-transparent dark:text-amber-300 disabled:opacity-50">
                <RefreshCw className={`w-3 h-3 ${growthSyncAction ? 'animate-spin' : ''}`} />立即重试
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Single-page scrolling content ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-10 pb-16 max-w-5xl mx-auto w-full">
              {/* ── MOCK BRAND WEBSITE NAVBAR ── */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shadow-sm bg-slate-50 dark:bg-slate-800">
                    {logoPreview || brand.logoUrl ? (
                      <img
                        src={logoPreview || brand.logoUrl!}
                        alt={draftName}
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.svg' }}
                      />
                    ) : (
                      <Utensils className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                      {draftName}
                      <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full text-[8px] font-black tracking-wider uppercase">品牌故事</span>
                    </h2>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-6 text-[10px] font-black text-slate-500 dark:text-slate-400">
                  <a href="#about" className="hover:text-amber-500 transition-colors">关于我们</a>
                  {dishes.length > 0 && <a href="#menu" className="hover:text-amber-500 transition-colors">招牌菜</a>}
                  {stores.length > 0 && <a href="#outlets" className="hover:text-amber-500 transition-colors">门店分部</a>}
                  {guides.length > 0 && <a href="#guide" className="hover:text-amber-500 transition-colors">用餐攻略</a>}
                </div>
                <div className="flex items-center gap-2">
                  {brand.phone && (
                    <a
                      href={`tel:${brand.phone}`}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-extrabold flex items-center gap-1 hover:bg-black dark:hover:bg-slate-100 active:scale-95 transition-all shadow-sm"
                    >
                      电话预约
                    </a>
                  )}
                  {showStoryEditor ? null : (
                    <button
                      onClick={() => setShowStoryEditor(true)}
                      className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
                      title="编辑设定"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* ── MOCK BRAND HERO WELCOME BANNER ── */}
              <div id="about" className="w-full rounded-3xl overflow-hidden relative border border-slate-200/40 dark:border-slate-800 shadow-xl bg-slate-900 text-white min-h-[300px] p-8 md:p-10 flex flex-col justify-between">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
                <div className="absolute top-0 right-0 w-[400px] h-[300px] bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-gradient-to-tr from-rose-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />

                <div className="relative z-10 max-w-2xl">
                  <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest bg-white/10 px-2.5 py-1 rounded-full backdrop-blur-md border border-white/10">Est. 2012 / 创始初心与使命</span>
                  <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mt-4 drop-shadow-md">
                    {draftName}
                  </h2>
                  <p className="text-xs md:text-sm text-white/95 font-medium leading-relaxed drop-shadow-sm mt-3.5 max-w-2xl">
                    {parsedBrandStoryText || cleanBrandStoryText(draftDesc) || '暂无品牌故事。请一键同步最新分析以加载详情。'}
                  </p>
                </div>

                <div className="relative z-10 w-full flex items-center justify-between border-t border-white/10 pt-5 mt-6 text-[10px] text-white/60 font-bold uppercase tracking-wider">
                  <span>{draftLocation || '新加坡地区'}</span>
                  <span>AI MARKETING CREW 官方托管</span>
                </div>
              </div>

              {/* ── MOCK BRAND SPECIALITIES GRID ── */}
              {dishes.length > 0 && (
                <div id="menu" className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                      <Utensils className="w-4 h-4 text-amber-500" />
                      招牌菜推荐 (Specialities Menu)
                    </h3>
                    <span className="text-[9px] text-slate-400 font-extrabold">精选 {dishes.length} 类招牌风味</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                    {dishes.map((dish, i) => (
                      <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:border-amber-500/40 hover:shadow-lg transition-all duration-300 group hover:-translate-y-1">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <h4 className="text-xs font-black text-slate-800 dark:text-white mb-2">{dish.title}</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">{dish.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── MOCK BRAND OUTLETS LIST ── */}
              {stores.length > 0 && (
                <div id="outlets" className="space-y-4">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2 pl-1">
                    <Store className="w-4 h-4 text-amber-500" />
                    分店与分局分布 (Our Outlets)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    {stores.map((store, i) => (
                      <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-3 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 flex items-center justify-center">
                              <MapPin className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-slate-800 dark:text-white">{store.name}</h4>
                            </div>
                          </div>
                          <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider">正常营业</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{store.details}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── MOCK BRAND DINING RESERVATION GUIDE ── */}
              {guides.length > 0 && (
                <div id="guide" className="space-y-4">
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2 pl-1">
                    <Compass className="w-4 h-4 text-amber-500" />
                    用餐攻略与预订须知 (Reservation Guide)
                  </h3>
                  <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/50 border border-slate-200/50 dark:border-slate-850 p-6 rounded-2xl shadow-sm space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {guides.map((guide, i) => (
                        <div key={i} className="space-y-2 border-r last:border-0 border-slate-100 dark:border-slate-800 pr-4 last:pr-0">
                          <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                            <Star className="w-3.5 h-3.5 fill-current" /> {guide.title}
                          </h4>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{guide.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── 2. BRAND STATS SHOWCASE BAR (SaaS Homepage style) ── */}
              {hasRealData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">社媒粉丝总量</span>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-white">
                        {totalFollowers > 0 ? `${totalFollowers.toLocaleString()}+` : '暂无数据'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-955/40 text-amber-500 flex items-center justify-center flex-shrink-0">
                      <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">谷歌主页评分</span>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-white">
                        {googleRating !== null ? `⭐ ${googleRating.toFixed(1)} / 5.0` : '⭐⭐⭐⭐⭐'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center flex-shrink-0">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">绑定运营门店</span>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-white">
                        {draftLocation ? '双门店联营' : '单店主理'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-955/40 text-rose-500 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">托管驾驶级别</span>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-white">
                        {brand.autoPilot ? '智能托管 (L4)' : '辅助生成 (L1)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Synced Brand Story Details ── */}
              {(parsedBrandStoryText || parsedBrandPositioning || parsedSignatureDishes || parsedStoresInfo || parsedDiningGuide) && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2 pl-1">
                    <span className="w-1.5 h-3.5 bg-amber-500 rounded-full" />
                    品牌故事讲述 (Brand Story & Content)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    {parsedBrandStoryText && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-3 md:col-span-2">
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <BookOpen className="w-4 h-4 text-amber-500" /> 品牌故事 (Brand Story)
                        </h4>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedBrandStoryText}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                    {parsedBrandPositioning && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <Bookmark className="w-4 h-4 text-amber-500" /> 品牌定位 (Brand Positioning)
                        </h4>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedBrandPositioning}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                    {parsedDiningGuide && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <Compass className="w-4 h-4 text-amber-500" /> 用餐攻略 (Dining Guide)
                        </h4>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedDiningGuide}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                    {parsedSignatureDishes && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <Utensils className="w-4 h-4 text-amber-500" /> 招牌菜 (Signature Dishes)
                        </h4>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedSignatureDishes}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                    {parsedStoresInfo && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <Store className="w-4 h-4 text-amber-500" /> 门店信息 (Stores Info)
                        </h4>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedStoresInfo}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── 3 & 4. BRAND IDENTITY ATTRIBUTES ── */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-500 rounded-full" />
                  <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">品牌定位与特征 (Brand Identity)</h3>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  <IdentityRow label="AI 品牌声调" englishLabel="Brand Tone" icon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />} iconClassName="bg-amber-50 dark:bg-amber-950/30"
                    value={identityText('brandTone', activeBrandTone) || emptyIdentityValue} editable={Boolean(identityField('brandTone')?.editable)} warning={identityField('brandTone')?.warning} {...identitySyncProps('brandTone')} onEdit={() => openIdentityEditor('brandTone')} />
                  <IdentityRow label="目标客群" englishLabel="Target Audience" icon={<Users className="w-3.5 h-3.5 text-blue-500" />} iconClassName="bg-blue-50 dark:bg-blue-950/30"
                    value={identityText('targetAudience', draftAudience) || emptyIdentityValue} editable={Boolean(identityField('targetAudience')?.editable)} warning={identityField('targetAudience')?.warning} {...identitySyncProps('targetAudience')} onEdit={() => openIdentityEditor('targetAudience')} />
                  <IdentityRow label="核心卖点" englishLabel="Selling Points" icon={<Star className="w-3.5 h-3.5 text-emerald-500" />} iconClassName="bg-emerald-50 dark:bg-emerald-950/30"
                    value={identityList('sellingPoints', draftProduct.split(/\r?\n/).filter(Boolean)).length ? (
                      <ul className="space-y-1 list-disc pl-4">{identityList('sellingPoints', draftProduct.split(/\r?\n/).filter(Boolean)).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                    ) : emptyIdentityValue} editable={Boolean(identityField('sellingPoints')?.editable)} warning={identityField('sellingPoints')?.warning} {...identitySyncProps('sellingPoints')} onEdit={() => openIdentityEditor('sellingPoints')} />
                  <IdentityRow label="运营区域" englishLabel="Location" icon={<MapPin className="w-3.5 h-3.5 text-slate-500" />} iconClassName="bg-slate-100 dark:bg-slate-800"
                    value={identityText('operatingRegion', draftLocation) || emptyIdentityValue} editable={Boolean(identityField('operatingRegion')?.editable)} warning={identityField('operatingRegion')?.warning} onEdit={() => openIdentityEditor('operatingRegion')} />
                  <IdentityRow label="品牌 Voice" englishLabel="Brand Voice" icon={<Sparkles className="w-3.5 h-3.5 text-rose-500" />} iconClassName="bg-rose-50 dark:bg-rose-950/30"
                    value={identityText('brandVoice', promoPlan.brandVoice) || emptyIdentityValue} editable={Boolean(identityField('brandVoice')?.editable)} warning={identityField('brandVoice')?.warning} onEdit={() => openIdentityEditor('brandVoice')} />
                  <IdentityRow label="品牌形象" englishLabel="Brand Image" icon={<Bookmark className="w-3.5 h-3.5 text-indigo-500" />} iconClassName="bg-indigo-50 dark:bg-indigo-950/30"
                    value={identityText('brandImage', promoPlan.brandImage) || emptyIdentityValue} editable={Boolean(identityField('brandImage')?.editable)} warning={identityField('brandImage')?.warning} onEdit={() => openIdentityEditor('brandImage')} />
                  <IdentityRow label="推广重点" englishLabel="Promotion Focus" icon={<Target className="w-3.5 h-3.5 text-amber-500" />} iconClassName="bg-amber-50 dark:bg-amber-950/30"
                    value={identityText('promotionFocus', promoPlan.direction) || emptyIdentityValue} editable={Boolean(identityField('promotionFocus')?.editable)} warning={identityField('promotionFocus')?.warning} onEdit={() => openIdentityEditor('promotionFocus')} />
                  <IdentityRow label="发布频次" englishLabel="Publishing Frequency" icon={<Zap className="w-3.5 h-3.5 text-amber-500" />} iconClassName="bg-amber-50 dark:bg-amber-950/30"
                    value={<div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800">默认 {resolvedPublishingFrequency.postsPerDay} 帖/天</span>
                      {Object.entries(resolvedPublishingFrequency.platforms).filter(([, config]) => config.postsPerDay || config.postsPerWeek).map(([platform, config]) => (
                        <span key={platform} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {platform} {config.postsPerDay ? `${config.postsPerDay} 帖/天` : `${config.postsPerWeek} 帖/周`}
                        </span>
                      ))}
                    </div>} editable={Boolean(identityField('publishingFrequency')?.editable)} warning={identityField('publishingFrequency')?.warning} onEdit={() => openIdentityEditor('publishingFrequency')} />
                </div>
              </div>

              {/* ── 5. OFFICIAL SOCIAL MEDIA CHANNELS (Official Website style) ── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pl-1 pr-1">
                  <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-3.5 bg-rose-500 rounded-full" />
                    官方自媒体运营阵地 (Official Channels)
                  </h3>
                  <button
                    onClick={handleSyncAccounts}
                    disabled={syncingAccounts}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-900 text-white hover:bg-black dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60 active:scale-95 transition-all cursor-pointer shadow-sm"
                  >
                    {syncingAccounts ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {syncAccountsStatus || '同步账号'}
                  </button>
                </div>

                {accounts.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                    {accounts.map((acc) => {
                      const platformColors: Record<string, string> = {
                        instagram: 'from-pink-500 to-rose-500',
                        facebook: 'from-blue-600 to-indigo-700',
                        tiktok: 'from-slate-800 to-black dark:from-slate-900 dark:to-black',
                        google: 'from-red-500 to-amber-500',
                        google_maps: 'from-emerald-500 to-teal-600',
                        gbp: 'from-red-500 to-amber-500',
                        gmb: 'from-red-500 to-amber-500',
                      }
                      const color = platformColors[acc.platformId.toLowerCase()] || 'from-slate-600 to-slate-805'

                      return (
                        <a
                          key={acc.id}
                          href={acc.profileUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex items-center justify-between hover:border-slate-350 dark:hover:border-slate-700 transition-all hover:scale-[1.01] group cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${color} text-white flex items-center justify-center font-black text-[9px] uppercase tracking-wider`}>
                              {acc.platformId.slice(0, 3)}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-extrabold text-slate-800 dark:text-white block truncate group-hover:text-amber-500 transition-colors">
                                {acc.displayName || acc.handle}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate">@{acc.handle}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {acc.followerCount !== null && (
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                {acc.followerCount.toLocaleString()} 粉丝
                              </span>
                            )}
                            <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                          </div>
                        </a>
                      )
                    })}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 p-8 rounded-2xl shadow-sm text-center">
                    <p className="text-xs text-slate-400 italic">暂无绑定的社交媒体账号，请点击右上角“同步账号”拉取已配置账号或进入配置。</p>
                  </div>
                )}
              </div>

              {/* Toggle Editor Panel Trigger */}
              <div className="pt-4 w-full">
                <button
                  onClick={() => setShowStoryEditor(!showStoryEditor)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 text-xs font-black text-slate-700 dark:text-slate-200 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {showStoryEditor ? '收起基础资料与俚语词典' : '展开编辑基础资料与俚语词典'}
                </button>
              </div>

              {/* Expandable Editor Fields */}
              <AnimatePresence>
                {showStoryEditor && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-4 w-full"
                  >
                    {/* Brand Info Form Card */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                      <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3">编辑基础信息</h3>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">品牌名称</label>
                        <input
                          value={draftName}
                          onChange={e => setDraftName(e.target.value)}
                          className="w-full text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          placeholder="品牌名称"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">品牌简介与故事使命 (Description)</label>
                        <p className="text-[9px] text-slate-400 mb-1">是根据老板和企业的品牌定位，目标读者是企业消费者讲述的品牌故事。</p>
                        <textarea
                          value={draftDesc}
                          onChange={e => setDraftDesc(e.target.value)}
                          className="w-full min-h-[90px] text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                          placeholder="根据老板与企业定位，面向消费者讲述的品牌故事与使命..."
                        />
                      </div>
                      <button
                        onClick={handleSaveBrandInfo}
                        disabled={saving}
                        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer active:scale-95 transition-all"
                      >
                        {saving ? <div className="w-3.5 h-3.5 border-2 border-white dark:border-slate-900 border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        保存品牌基本信息
                      </button>
                    </div>

                    {/* Local Slang Dictionary Card */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                        <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">本地俚语词典 (Slang Dict)</h3>
                        <button
                          onClick={handleSaveSlang}
                          disabled={saving}
                          className="flex items-center gap-1 text-[11px] font-bold text-amber-500 hover:text-amber-600 cursor-pointer active:scale-95 transition-transform"
                        >
                          <Save className="w-3.5 h-3.5" />
                          保存俚语词典
                        </button>
                      </div>

                      {/* Local Slang Dict */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">本地俚语词典 (Slang Dict)</label>
                          <span className="text-[9px] text-slate-400">供 AI 写手合理插入本地化口语表达</span>
                        </div>

                        {Object.keys(activeSlangDict).length > 0 && (
                          <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800">
                            {Object.entries(activeSlangDict).map(([term, meaning]) => (
                              <div
                                key={term}
                                className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm"
                              >
                                <div className="min-w-0 pr-1.5">
                                  <span className="text-[11px] font-bold text-slate-800 dark:text-white block truncate">"{term}"</span>
                                  <span className="text-[9px] text-slate-400 block truncate">{meaning}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = { ...activeSlangDict }
                                    delete next[term]
                                    setSlangDictVal(next)
                                  }}
                                  className="p-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/30 transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-850 p-2 rounded-xl border border-dashed border-slate-250 dark:border-slate-700">
                          <input
                            value={newTerm}
                            onChange={(e) => setNewTerm(e.target.value)}
                            placeholder="词语 (如: Lah)"
                            className="w-1/3 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                          <input
                            value={newMeaning}
                            onChange={(e) => setNewMeaning(e.target.value)}
                            placeholder="解释 (如: 强调语气词)"
                            className="flex-1 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                          <button
                            type="button"
                            onClick={handleAddSlang}
                            className="p-1.5 rounded-lg bg-slate-900 text-white hover:bg-black dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white active:scale-95 transition-all"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

        {/* ── SECTION: 经营信息 ─────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-indigo-500" />
              <h2 className="text-xs font-black text-slate-700 dark:text-white flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-500" /> 经营信息
              </h2>
            </div>
            {editingBiz ? (
              <div className="flex items-center gap-1.5">
                <button onClick={() => setEditingBiz(false)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer">
                  <X size={11} /> 取消
                </button>
                <button onClick={async () => {
                  setSaving(true)
                  try {
                    const r1 = await fetch(`/api/brands/${brandId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: draftAddress, phone: draftPhone, website: draftWebsite }) })
                    const r2 = await fetch(`/api/brands/${brandId}/knowledge`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessHours: draftBusinessHours, reservationUrl: draftReservationUrl, orderingUrl: draftOrderingUrl, deliveryUrls: draftDeliveryUrls, stores: draftStores }) })
                    if (r1.ok && r2.ok) { showToastVal('经营信息已保存', 'success'); setEditingBiz(false); await loadGrowthSyncStatus() }
                    else showToastVal('保存失败，请重试', 'error')
                  } catch { showToastVal('网络错误', 'error') }
                  finally { setSaving(false) }
                }} disabled={saving}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-black disabled:opacity-60 transition-all cursor-pointer">
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            ) : (
              <button onClick={() => setEditingBiz(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer">
                <Edit3 size={11} /> 编辑
              </button>
            )}
          </div>

          {/* View Mode */}
          {!editingBiz && (
            <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {[
                { label: '门店地址', value: draftAddress },
                { label: '联系电话', value: draftPhone },
                { label: '品牌网站', value: draftWebsite },
                { label: '营业时间', value: draftBusinessHours },
                { label: '订座链接', value: draftReservationUrl },
                { label: '自有下单', value: draftOrderingUrl },
              ].map(({ label, value }) => (
                <div key={label} className="grid grid-cols-[160px_1fr] gap-3 px-5 py-3">
                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 pt-0.5">{label}</span>
                  <span className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {value || <em className="text-slate-300 dark:text-slate-600 font-normal not-italic">暂未填写</em>}
                  </span>
                </div>
              ))}
              {draftDeliveryUrls.length > 0 && (
                <div className="grid grid-cols-[160px_1fr] gap-3 px-5 py-3">
                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 pt-0.5">外卖平台</span>
                  <div className="flex flex-wrap gap-1.5">
                    {draftDeliveryUrls.map((d, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {d.platform}{d.url && <ExternalLink size={9} />}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {draftStores.length > 0 && (
                <div className="grid grid-cols-[160px_1fr] gap-3 px-5 py-3">
                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 pt-0.5">门店列表</span>
                  <div className="space-y-2">
                    {draftStores.filter(s => s.name || s.address).map((s, i) => (
                      <div key={i} className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700 p-3">
                        <p className="text-xs font-black text-slate-700 dark:text-slate-100">{s.name || `门店 ${i + 1}`}</p>
                        {s.address && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{s.address}</p>}
                        {(s.phone || s.businessHours) && (
                          <p className="text-[10px] text-slate-400 mt-1">{[s.phone, s.businessHours].filter(Boolean).join(' · ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Edit Mode */}
          {editingBiz && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: '门店地址', value: draftAddress, set: setDraftAddress, placeholder: '如：2 Orchard Turn, Singapore 238801' },
                  { label: '联系电话', value: draftPhone, set: setDraftPhone, placeholder: '+65 6123 4567' },
                  { label: '品牌网站', value: draftWebsite, set: setDraftWebsite, placeholder: 'https://yourbrand.com' },
                  { label: '订座链接', value: draftReservationUrl, set: setDraftReservationUrl, placeholder: 'https://chope.co/...' },
                  { label: '自有下单链接', value: draftOrderingUrl, set: setDraftOrderingUrl, placeholder: 'https://yourbrand.com/order' },
                ].map(({ label, value, set, placeholder }) => (
                  <label key={label} className="block">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</span>
                    <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                      className="mt-1 w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">营业时间</span>
                <textarea value={draftBusinessHours} onChange={e => setDraftBusinessHours(e.target.value)} rows={3}
                  placeholder={"周一至周五：11:00 - 22:00\n周末及公假：10:00 - 23:00"}
                  className="mt-1 w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none resize-none" />
              </label>
              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">外卖平台链接</p>
                <div className="space-y-2">
                  {draftDeliveryUrls.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={d.platform} onChange={e => { const n = [...draftDeliveryUrls]; n[i] = { ...n[i], platform: e.target.value }; setDraftDeliveryUrls(n) }}
                        placeholder="平台名称（如 GrabFood）" className="w-32 px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none" />
                      <input value={d.url} onChange={e => { const n = [...draftDeliveryUrls]; n[i] = { ...n[i], url: e.target.value }; setDraftDeliveryUrls(n) }}
                        placeholder="链接 URL" className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none" />
                      <button onClick={() => setDraftDeliveryUrls(draftDeliveryUrls.filter((_, j) => j !== i))} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => setDraftDeliveryUrls([...draftDeliveryUrls, { platform: '', url: '' }])}
                    className="flex items-center gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                    <Plus size={12} /> 添加外卖平台
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">门店列表</p>
                <div className="space-y-3">
                  {draftStores.map((store, i) => (
                    <div key={store.storeId || i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input value={store.name}
                          onChange={e => { const n = [...draftStores]; n[i] = { ...store, name: e.target.value }; setDraftStores(n) }}
                          placeholder="门店名称"
                          className="flex-1 px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none" />
                        <button onClick={() => setDraftStores(draftStores.filter((_, j) => j !== i))} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                      <input value={store.address}
                        onChange={e => { const n = [...draftStores]; n[i] = { ...store, address: e.target.value }; setDraftStores(n) }}
                        placeholder="门店地址"
                        className="w-full px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none" />
                      <div className="grid grid-cols-2 gap-2">
                        <input value={store.phone || ''}
                          onChange={e => { const n = [...draftStores]; n[i] = { ...store, phone: e.target.value }; setDraftStores(n) }}
                          placeholder="电话"
                          className="px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none" />
                        <input value={store.businessHours || ''}
                          onChange={e => { const n = [...draftStores]; n[i] = { ...store, businessHours: e.target.value }; setDraftStores(n) }}
                          placeholder="营业时间"
                          className="px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={store.reservationUrl || ''}
                          onChange={e => { const n = [...draftStores]; n[i] = { ...store, reservationUrl: e.target.value }; setDraftStores(n) }}
                          placeholder="订座链接"
                          className="px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none" />
                        <input value={store.orderingUrl || ''}
                          onChange={e => { const n = [...draftStores]; n[i] = { ...store, orderingUrl: e.target.value }; setDraftStores(n) }}
                          placeholder="下单链接"
                          className="px-2 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none" />
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setDraftStores([...draftStores, { storeId: `store_${crypto.randomUUID()}`, name: '', address: '' }])}
                    className="flex items-center gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                    <Plus size={12} /> 添加门店
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legacy Growth Context Slides */}
        {presentationSlides.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white">🚀 战略诊断与增长计划</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">从 AMC Growth 同步的智能诊断报告</p>
              </div>
              <button onClick={handleSyncGrowth} disabled={syncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-900 text-white hover:bg-black dark:bg-slate-100 dark:text-slate-900 disabled:opacity-60 active:scale-95 transition-all cursor-pointer">
                {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {syncStatus || '同步'}
              </button>
            </div>
          </div>
        )}

        </div> {/* end single-page wrapper */}
      </div>




      {/* ── Brand Config Drawer/Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfigModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-slate-50 dark:bg-slate-950 shadow-2xl flex flex-col h-full z-10 border-l border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white">⚙️ 品牌平台与集成配置</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">管理社交平台授权、第三方 API 凭证与多门店设置</p>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-10">
                {/* Connected Accounts Snapshot */}
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-800 dark:text-white">📊 已绑定账号资产快照</span>
                  </div>
                  {brandSettings?.accounts && (brandSettings.accounts as any[]).length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {(brandSettings.accounts as any[]).map((acc) => (
                        <div key={acc.id} className="py-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-[10px] tracking-wide bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                              {acc.platformId.toUpperCase()}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{acc.displayName || acc.handle}</span>
                            <span className="text-slate-400 text-[10px]">@{acc.handle}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-550 dark:text-slate-400 font-bold">
                            {acc.followerCount !== null ? (
                              <span>{acc.followerCount.toLocaleString()} 粉丝</span>
                            ) : (
                              <span className="text-slate-350 dark:text-slate-600">暂无数据</span>
                            )}
                            {acc.autoPilot && (
                              <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[9px] font-black px-1.5 py-0.2 rounded-full">
                                托管中
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">暂无绑定的社交媒体账号，请在下方点击配置按钮进入平台绑定。</p>
                  )}
                </div>

                {/* Social Platform Integration Cards */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">集成第三方平台</h3>
                  {[
                    {
                      name: 'PostFast',
                      desc: '自动发布至 Instagram、Facebook 等主流平台',
                      color: 'from-indigo-500 to-purple-600',
                      icon: (
                        <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204 0.013-3.583 0.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                        </svg>
                      ),
                    },
                    {
                      name: 'Google Business',
                      desc: '管理 Google Maps 商家主页、评论与 OAuth 凭证',
                      color: 'from-red-500 to-orange-500',
                      icon: (
                        <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                          <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748z" />
                        </svg>
                      ),
                    },
                  ].map(platform => (
                    <div
                      key={platform.name}
                      className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm"
                    >
                      <div className={`bg-gradient-to-r ${platform.color} p-3.5 flex items-center gap-3`}>
                        <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                          {platform.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white">{platform.name}</h4>
                          <p className="text-[10px] text-white/75 mt-0.5">{platform.desc}</p>
                        </div>
                      </div>
                      <div className="p-3">
                        <button
                          onClick={handleOpenSettings}
                          className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/50 dark:border-slate-700/50 py-2 rounded-xl transition-all cursor-pointer active:scale-95"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          配置 {platform.name}
                          <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-450" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Store Configuration */}
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-3.5 flex items-center gap-3">
                    <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">门店与多地址配置</h4>
                      <p className="text-[10px] text-white/75 mt-0.5">管理多门店地址、营业时间与 Google 映射配置</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <button
                      onClick={handleOpenSettings}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/50 dark:border-slate-700/50 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      配置门店详细信息
                      <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-455" />
                    </button>
                  </div>
                </div>

                {/* Subscription & Add-ons */}
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">订阅套餐 & 增值计划</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">AI Marketing Crew 订阅方案与增值应用状态</p>
                    </div>
                    <PlanBadge plan={activeSubscriptionPlan} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'veo3', label: 'Veo3 视频生成', active: activeAddons.veo3 },
                      { key: 'dubco', label: 'Dub.co 多语言配音', active: activeAddons.dubco },
                    ].map(addon => (
                      <div
                        key={addon.key}
                        className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-1.5">
                          <Package className={`w-3.5 h-3.5 ${addon.active ? 'text-amber-500' : 'text-slate-400'}`} />
                          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{addon.label}</span>
                        </div>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${addon.active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400 dark:bg-slate-700'}`}>
                          {addon.active ? '开通' : '未开'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <a
                    href={activeSubscriptionHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow-md shadow-indigo-500/10 cursor-pointer group text-xs text-white font-bold"
                  >
                    <span>管理订阅方案与升级服务</span>
                    <ExternalLink className="w-3.5 h-3.5 text-white" />
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Brand Identity Field Drawer ──────────────────────────────────────── */}
      <AnimatePresence>
        {editingIdentityField && editingIdentity && (
          <div className="fixed inset-0 z-[60] flex justify-end">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !identitySaving && setEditingIdentityField(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl flex flex-col h-full z-10 border-l border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white">编辑{IDENTITY_LABELS[editingIdentityField]}</h3>
                  <p className="text-[10px] text-slate-400 mt-1">
                    数据来源：{editingIdentity.source === 'growth' ? 'AMC-Growth' : editingIdentity.source === 'legacy' ? '兼容旧数据' : 'AMC-Kanban'}
                    {editingIdentity.version !== undefined ? ` · 当前 v${editingIdentity.version}` : ''} · 保存后立即生效
                  </p>
                </div>
                <button type="button" disabled={identitySaving} onClick={() => setEditingIdentityField(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 disabled:opacity-50">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {editingIdentityField === 'sellingPoints' && Array.isArray(identityDraft) ? (
                  <div className="space-y-3">
                    {identityDraft.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          value={item}
                          onChange={event => setIdentityDraft(current => Array.isArray(current) ? current.map((entry, itemIndex) => itemIndex === index ? event.target.value : entry) : current)}
                          placeholder={`卖点 ${index + 1}`}
                          className="flex-1 px-3 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        <button type="button" onClick={() => setIdentityDraft(current => Array.isArray(current) ? current.filter((_, itemIndex) => itemIndex !== index) : current)} className="p-2.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setIdentityDraft(current => Array.isArray(current) ? [...current, ''] : [''])} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30">
                      <Plus size={14} /> 添加卖点
                    </button>
                  </div>
                ) : editingIdentityField === 'publishingFrequency' ? (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">默认频次（帖/天）</span>
                      <input type="number" min={0.5} max={20} step={0.5} value={editingPublishingFrequency.postsPerDay}
                        onChange={event => setIdentityDraft({ ...editingPublishingFrequency, postsPerDay: Number(event.target.value) })}
                        className="w-full px-3 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    </label>
                    <div className="space-y-3">
                      {PUBLISHING_PLATFORMS.map(platform => {
                        const config = editingPublishingFrequency.platforms[platform] || {}
                        return (
                          <div key={platform} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                            <span className="text-xs font-black text-slate-600 dark:text-slate-300 capitalize">{platform}</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input type="number" min={0.5} max={20} step={0.5} value={config.postsPerDay ?? ''} placeholder="帖/天（可选）"
                                onChange={event => {
                                  const value = event.target.value === '' ? undefined : Number(event.target.value)
                                  setIdentityDraft({ ...editingPublishingFrequency, platforms: { ...editingPublishingFrequency.platforms, [platform]: { ...config, postsPerDay: value } } })
                                }}
                                className="px-3 py-2 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                              <input value={(config.preferredHours ?? []).join(',')} placeholder="首选时段，如 11,18,20"
                                onChange={event => {
                                  const preferredHours = event.target.value.split(',').map(value => value.trim()).filter(Boolean).map(Number).filter(value => Number.isInteger(value))
                                  setIdentityDraft({ ...editingPublishingFrequency, platforms: { ...editingPublishingFrequency.platforms, [platform]: { ...config, preferredHours } } })
                                }}
                                className="px-3 py-2 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : editingIdentityField === 'operatingRegion' ? (
                  <input value={typeof identityDraft === 'string' ? identityDraft : ''} onChange={event => setIdentityDraft(event.target.value)} placeholder="例如：Hong Kong"
                    className="w-full px-3 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                ) : (
                  <textarea value={typeof identityDraft === 'string' ? identityDraft : ''} onChange={event => setIdentityDraft(event.target.value)} rows={10}
                    placeholder={`填写${IDENTITY_LABELS[editingIdentityField]}`}
                    className="w-full px-3 py-2.5 rounded-xl text-sm leading-relaxed border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y" />
                )}

                {editingIdentity.source === 'legacy' && (
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300">
                    这是历史兼容值。首次保存会迁移到 AMC-Growth 并发布为正式版本。
                  </div>
                )}
                {identityError && <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-xs font-semibold text-rose-600 dark:text-rose-300">{identityError}</div>}
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-3">
                <button type="button" disabled={identitySaving} onClick={() => setEditingIdentityField(null)} className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-50">取消</button>
                <button type="button" disabled={identitySaving} onClick={handleSaveIdentity} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-60">
                  {identitySaving ? <><Loader2 size={14} className="animate-spin" /> 保存中…</> : <><Save size={14} /> 保存并生效</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Brand Context Drawer/Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showContextModal && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowContextModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-2xl bg-slate-50 dark:bg-slate-900 shadow-2xl flex flex-col h-full z-10 border-l border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white">品牌上下文 Markdown</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">仅编辑品牌介绍与经营信息；品牌定位请在对应行编辑。</p>
                </div>
                <button
                  onClick={() => setShowContextModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col space-y-3 min-h-0 bg-white dark:bg-slate-900">
                <div className="flex-1 min-h-0 flex flex-col">
                  <textarea
                    value={profileMarkdown}
                    onChange={(e) => setProfileMarkdown(e.target.value)}
                    placeholder="# 品牌名称..."
                    className="flex-1 w-full min-h-[520px] p-4 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleSaveProfile()}
                  disabled={profileSaving || profileLoading || !profileMarkdown.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer active:scale-95 transition-all flex-shrink-0"
                >
                  {profileSaving ? (
                    <><Loader2 size={13} className="animate-spin" /> 保存中…</>
                  ) : profileSaved ? (
                    <><CheckCircle2 size={13} className="text-emerald-400" /> 上下文已成功保存</>
                  ) : (
                    <><Save size={13} /> 保存品牌上下文 Markdown</>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-bold text-white transition-all animate-in fade-in slide-in-from-top-4 duration-355 ${
          toast.type === 'success' ? 'bg-emerald-500 border-emerald-400' :
          toast.type === 'error' ? 'bg-rose-500 border-rose-400' :
          'bg-slate-800 border-slate-700'
        }`}>
          {toast.message}
        </div>
      )}

      {showSettings && (
        <BrandSettingsPanel
          brandId={brandId}
          open={showSettings}
          onClose={() => {
            setShowSettings(false)
            void loadAllConfig()
          }}
          initialSettings={brandSettings ?? undefined}
        />
      )}
    </motion.div>
  )
}
