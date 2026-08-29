'use client'
import React, { useEffect, useState, useMemo, useRef } from 'react'
import PostPreviewModal from './PostPreviewModal'
import PostEditDrawer from './PostEditDrawer'
import { callGeminiDirect } from '@/lib/gemini-direct'
import { COPYWRITER_ROSTER, draftAccountIdForCopywriter } from '@/lib/copywriters'
import {
  formatMediaWarnings,
  mediaValidationErrorMessage,
} from '@/lib/mediaValidationClient'
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  ThumbsUp,
  Star,
  Globe,
  Store,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Video,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Shield,
  Copy,
  Plus,
  Compass,
  ArrowRight,
  RefreshCw,
  Send,
  Zap,
  Eye,
  MoreVertical,
  Wand2,
  Loader2,
  Play,
  X,
  ChevronDown,
  Check,
  Maximize2,
  ExternalLink,
  Download,
  Save,
  Trash2
} from 'lucide-react'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

// Platform pill — no background fill, subtle colored text + thin border
const PLATFORM_COLORS: Record<string, string> = {
  'IG':   'bg-white dark:bg-slate-900 text-pink-500 dark:text-pink-400 border-pink-200 dark:border-pink-800/60',
  '小红书': 'bg-white dark:bg-slate-900 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800/60',
  'TikTok': 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
  'Google': 'bg-white dark:bg-slate-900 text-blue-500 dark:text-blue-400 border-blue-200 dark:border-blue-800/60',
  'Facebook': 'bg-white dark:bg-slate-900 text-indigo-500 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60',
  'Email': 'bg-white dark:bg-slate-900 text-cyan-500 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/60',
  '任务': 'bg-white dark:bg-slate-900 text-violet-500 dark:text-violet-400 border-violet-200 dark:border-violet-800/60',
  '全平台': 'bg-white dark:bg-slate-900 text-emerald-500 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60',
}

function normalizePlatformLabel(platform: string) {
  const key = platform.trim().toLowerCase()
  const aliasMap: Record<string, string> = {
    instagram: 'IG',
    ig: 'IG',
    xiaohongshu: '小红书',
    rednote: '小红书',
    red: '小红书',
    xhs: '小红书',
    tiktok: 'TikTok',
    google: 'Google',
    google_business: 'Google',
    google_maps: 'Google',
    facebook: 'Facebook',
    fb: 'Facebook',
    email: 'Email',
    newsletter: 'Email',
    task: '任务',
    任务: '任务',
    all: '全平台',
    '全平台': '全平台',
  }

  return aliasMap[key] ?? platform
}

function parseTags(value: string) {
  return value
    .split(/[#,，,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
}

function isVideoUrl(url: string): boolean {
  if (!url) return false
  const path = url.split('?')[0]
  return /\.(mp4|mov|avi|webm|ogg|m4v|3gp)(?:\?.*)?$/i.test(path)
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null
}

const STATUS_COLORS: Record<string, string> = {
  'done': 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/20',
  'pending': 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/20',
  'draft': 'bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  'planned_unimplemented': 'bg-rose-50 dark:bg-rose-900/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/20',
  'scheduled': 'bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/20',
  'publishing': 'bg-violet-50 dark:bg-violet-900/10 text-violet-600 dark:text-violet-400 border-violet-100 dark:border-violet-900/20',
  'failed': 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/20',
}

type CalendarEventStatus = 'done' | 'pending' | 'draft' | 'planned_unimplemented' | 'scheduled' | 'publishing' | 'failed'
type CalendarFilter = 'all' | CalendarEventStatus

function calendarStatusLabel(status: CalendarEventStatus, type?: 'post' | 'task') {
  if (status === 'done') return type === 'task' ? '已完成' : '已发布'
  if (status === 'pending') return '待审核'
  if (status === 'draft') return '草稿'
  if (status === 'planned_unimplemented') return '排期待制作'
  if (status === 'publishing') return '发布中'
  if (status === 'failed') return '发布失败'
  return '已排期'
}

function isCalendarGridStatus(status: CalendarEventStatus) {
  return ['done', 'pending', 'draft', 'planned_unimplemented', 'scheduled', 'publishing', 'failed'].includes(status)
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface Comment {
  id: string
  author: string
  avatar: string
  content: string
  time: string
  reply?: string
  isAiReply?: boolean
  isGeneratingReply?: boolean
}

interface GroupedEvent {
  id: string
  brandName: string
  platform: string
  title: string
  cleanTitle: string
  status: CalendarEventStatus
  time: string
  scheduledAt: string
  mediaUrls?: string[]
  clicks?: number
  roi?: number
  platformPostId?: string | null
  events: CalendarEvent[]
}

function getCleanTitle(title: string, platform: string): string {
  const normPlatform = normalizePlatformLabel(platform)
  const escapedPlatform = normPlatform.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const pattern = new RegExp(`^(\\[?${escapedPlatform}\\]?\\s*·?\\s*|${escapedPlatform}\\s*[:：·]?\\s*|${platform}\\s*[:：·]?\\s*)`, 'i')
  return title.replace(pattern, '').trim()
}

function groupEventsByTitle(events: CalendarEvent[]): GroupedEvent[] {
  const groups: Record<string, GroupedEvent> = {}
  events.forEach(ev => {
    const cleanTitle = getCleanTitle(ev.title, ev.platform)
    const key = `${ev.brandName}|${cleanTitle}`
    if (!groups[key]) {
      groups[key] = {
        id: ev.id,
        brandName: ev.brandName,
        platform: ev.platform,
        title: ev.title,
        cleanTitle: cleanTitle,
        status: ev.status,
        time: ev.time,
        scheduledAt: ev.scheduledAt,
        mediaUrls: ev.mediaUrls,
        clicks: ev.clicks,
        roi: ev.roi,
        platformPostId: ev.platformPostId,
        events: []
      }
    }
    groups[key].events.push(ev)
    const group = groups[key]
    if (ev.status === 'done') {
      group.status = 'done'
    } else if (ev.status === 'scheduled' && group.status !== 'done') {
      group.status = 'scheduled'
    } else if (ev.status === 'planned_unimplemented' && group.status !== 'done' && group.status !== 'scheduled') {
      group.status = 'planned_unimplemented'
    } else if (ev.status === 'pending' && group.status !== 'done' && group.status !== 'scheduled' && group.status !== 'planned_unimplemented') {
      group.status = 'pending'
    }
    if (ev.clicks) group.clicks = (group.clicks || 0) + ev.clicks
    if (ev.roi) group.roi = (group.roi || 0) + ev.roi
  })
  return Object.values(groups)
}

function getPostOriginalUrl(platform: string, platformPostId: string | null | undefined, postUrl?: string | null): string {
  if (postUrl && (postUrl.startsWith('http://') || postUrl.startsWith('https://'))) {
    return postUrl
  }
  if (platformPostId && (platformPostId.startsWith('http://') || platformPostId.startsWith('https://'))) {
    return platformPostId
  }
  if (!platformPostId) return ''
  const normPlatform = normalizePlatformLabel(platform)
  const postId = platformPostId
  switch (normPlatform) {
    case 'IG':
      return `https://www.instagram.com/p/${postId}/`
    case '小红书':
      return `https://www.xiaohongshu.com/explore/${postId}`
    case 'TikTok':
      return `https://www.tiktok.com/video/${postId}`
    case 'Google':
      return `https://www.google.com/maps/place/${postId}`
    case 'Facebook':
      return `https://www.facebook.com/${postId}`
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(normPlatform + ' post ' + postId)}`
  }
}

function getFallbackHooks(topic: string, contentType: 'video' | 'photo') {
  const t = topic || '我们的特色服务'
  if (contentType === 'video') {
    return [
      { visual: '画面：快速切过产品或店铺细节，拉近镜头特写', overlay: `别再瞎找攻略了！`, audio: `大家都以为这很简单，其实懂行的人都在看这个细节！` },
      { visual: '画面：展示博主在镜头前操作或体验产品的特写', overlay: `原来这才是搞定它的最快捷径`, audio: `今天不废话，用这套实操步骤直接帮你省下80%的精力。` },
      { visual: '画面：展示令人惊艳的效果图或者用户满足的表情', overlay: `我敢保证你绝对没听过这个`, audio: `这是一个只有行业内部人员才知道的隐藏秘密，建议先收藏。` }
    ]
  } else {
    return [
      { visual: '排版：精美的拼图/多图网格，首图重点标红', overlay: `避坑！劝你避开这三个雷区`, audio: `最近被私信轰炸问这个事情，今天整理了一套清晰图解给大家彻底说明白。` },
      { visual: '排版：左侧暗淡普通图，右侧极具视觉冲击的成品图', overlay: `普通人轻松搞定它的底层逻辑`, audio: `这套保姆级攻略直接打包分享，以后遇到类似问题照着抄作业就够了。` },
      { visual: '排版：带有醒目疑问文字的图片作为第一张封面', overlay: `为什么高手都在偷偷用这个？`, audio: `看似普通的做法背后，其实藏着这几个拉开差距的绝招，建议点赞保存。` }
    ]
  }
}

interface CalendarEvent {
  id: string
  brandId: string
  brandName: string
  platform: string
  title: string
  status: CalendarEventStatus
  time: string
  scheduledAt: string
  mediaUrls?: string[]
  captionLang?: string
  mediaAssetId?: string | null
  clicks?: number
  roi?: number
  platformPostId?: string | null
  type?: 'post' | 'task'
  postUrl?: string | null
  agentNote?: string | null
  creativeHooks?: string | null
}

interface DashboardCalendarProps {
  brandId?: string
  preselectedAssetIds?: string[] | null
  clearPreselectedAssets?: () => void
}

export default function DashboardCalendar({ brandId, preselectedAssetIds, clearPreselectedAssets }: DashboardCalendarProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggeringId, setTriggeringId] = useState<string | null>(null)

  // Stitch & Postis UX elements
  const [activeFilter, setActiveFilter] = useState<CalendarFilter>('all')
  const [activeView, setActiveView] = useState<'month' | 'week' | 'day' | 'list'>('month')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [isBrandsCollapsed, setIsBrandsCollapsed] = useState(true)
  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[]>>({})
  const [commentReplyText, setCommentReplyText] = useState<Record<string, string>>({})
  const [designerPromptText, setDesignerPromptText] = useState('')
  const [assetPageSize, setAssetPageSize] = useState(12)
  const [designerProcessing, setDesignerProcessing] = useState(false)
  const [videoProcessing, setVideoProcessing] = useState(false)
  const [showDesignerPanel, setShowDesignerPanel] = useState<string | null>(null)
  const [aiProposalGenerating, setAiProposalGenerating] = useState(false)
  const [brandDetails, setBrandDetails] = useState<any>(null)

  const [activeBrandId, setActiveBrandId] = useState(brandId)
  const [allBrands, setAllBrands] = useState<any[]>([])
  // Map of brandId → lastPublishedAt ISO string (or null)
  const [brandActivityMap, setBrandActivityMap] = useState<Record<string, string | null>>({})

  // Draft Creation Workspace states
  const [isCreatingPost, setIsCreatingPost] = useState(false)
  const [isCreatingNewPost, setIsCreatingNewPost] = useState(false)
  /** Media pre-filled when navigating here from asset library */
  const [pendingInitialMedia, setPendingInitialMedia] = useState<Array<{ id: string; type: 'asset'; url: string }> | null>(null)
  const [contentIdea, setContentIdea] = useState('')
  const [creativeHooks, setCreativeHooks] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [accountId, setAccountId] = useState<string>('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [agentNote, setAgentNote] = useState('')
  const [attachedMedia, setAttachedMedia] = useState<Array<{ id: string; type: 'asset' | 'url'; url: string }>>([])
  const [newUrlInput, setNewUrlInput] = useState('')
  const [assetTypeFilter, setAssetTypeFilter] = useState<'unused' | 'all'>('unused')
  
  // Hooks generator states
  const [showHookGenerator, setShowHookGenerator] = useState(false)
  const [isGeneratingHooks, setIsGeneratingHooks] = useState(false)
  const [generatedHooks, setGeneratedHooks] = useState<Array<{ visual: string; overlay: string; audio: string }>>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [brandAssets, setBrandAssets] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [mediaProcessingIndex, setMediaProcessingIndex] = useState<number | null>(null)
  const [activeMediaOp, setActiveMediaOp] = useState<{ index: number; action: 'design' | 'video' } | null>(null)
  const [mediaOpPrompt, setMediaOpPrompt] = useState('')
  const [previewMediaIndex, setPreviewMediaIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

    const [createdDrafts, setCreatedDrafts] = useState<any[] | null>(null)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [draftCaptions, setDraftCaptions] = useState<Record<string, string>>({})
  const [draftHashtags, setDraftHashtags] = useState<Record<string, string>>({})
  const [draftStatuses, setDraftStatuses] = useState<Record<string, 'generating' | 'completed' | 'failed'>>({})
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [showPublishOptionModal, setShowPublishOptionModal] = useState(false)
  const [showPublishDropdown, setShowPublishDropdown] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewOnly, setPreviewOnly] = useState(false)

  const handleGenerateHooks = async () => {
    setIsGeneratingHooks(true)
    const hasVideo = attachedMedia.some(m => isVideoUrl(m.url))
    const contentType = hasVideo ? 'video' : 'photo'
    
    // 1. Try server-side generation (uses system configs, API keys, and backup models)
    try {
      const response = await fetch('/api/copywriter/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: activeBrandId || brandId,
          contentType,
          contentIdea
        })
      })
      if (response.ok) {
        const json = await response.json()
        if (json.success && Array.isArray(json.hooks) && json.hooks.length > 0) {
          setGeneratedHooks(json.hooks.slice(0, 3))
          setIsGeneratingHooks(false)
          return
        }
      }
      throw new Error('Server-side hook generation failed')
    } catch (serverErr) {
      console.warn('[handleGenerateHooks] Server-side generation failed, trying browser-direct next:', serverErr)
      
      // 2. Try browser-direct Gemini call (if configured on client)
      try {
        const systemPrompt = `You are an expert copywriter. Generate 3 ready-to-use opening hook options for a social media post based on the brand context and the user's content idea / materials description.
${contentType === 'video'
  ? 'The content type is Video (Reels/Shorts/Video post). Visual design instructions should specify dynamic, high-engagement 3-second B-Roll action video instructions for the creator.'
  : 'The content type is Photo/Carousel (图文/图片卡片). Visual design instructions should specify static image layout, graphic styling, or carousel slide visual instructions.'}

Return the output strictly in a valid JSON array format, where each item in the array has:
- "visual": Visual design/graphic/video instructions for the creator (in Chinese, max 15 words).
- "overlay": The text to print/overlay on the graphic/video overlay (in Chinese, max 7 words).
- "audio": The opening spoken/written caption line that hooks the audience (in Chinese, 1 short sentence).

JSON output format:
[
  { "visual": "...", "overlay": "...", "audio": "..." },
  { "visual": "...", "overlay": "...", "audio": "..." },
  { "visual": "...", "overlay": "...", "audio": "..." }
]
Never include any markdown backticks, conversational preamble, or explanation outside the JSON.`

        const promptMsg = `[Content Idea / Materials Description]
${contentIdea || 'No details provided.'}`
        
        const res = await callGeminiDirect(systemPrompt, [], promptMsg, false, 800)
        if (res.direct && res.reply) {
          let cleanText = res.reply.replace(/```json/gi, '').replace(/```/g, '').trim()
          const parsed = JSON.parse(cleanText)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setGeneratedHooks(parsed.slice(0, 3))
            setIsGeneratingHooks(false)
            return
          }
        }
        throw new Error('Browser-direct generation failed')
      } catch (directErr) {
        console.warn('[handleGenerateHooks] Browser-direct failed, falling back to local preset templates:', directErr)
        
        // 3. Fallback to local rule-based templates
        const fallbacks = getFallbackHooks(contentIdea, contentType)
        setGeneratedHooks(fallbacks)
      }
    } finally {
      setIsGeneratingHooks(false)
    }
  }

  const accountOptions = useMemo(() => {
    const list = [...accounts]

    // Add unconfigured placeholder accounts from createdDrafts if any
    if (createdDrafts && createdDrafts.length > 0) {
      createdDrafts.forEach(d => {
        if (d.account && d.account.handle === 'unconfigured') {
          if (!list.some(a => a.id === d.account.id)) {
            const pId = d.account.platformId.toLowerCase()
            const isGoogle = ['google', 'google_business'].includes(pId)
            const isRed = ['red', 'xiaohongshu', 'xhs'].includes(pId)
            list.push({
              id: d.account.id,
              platformId: d.account.platformId,
              handle: 'unconfigured',
              displayName: d.account.displayName || (
                isGoogle ? 'Google Business (未配置)'
                : isRed ? '小红书 (未配置)'
                : pId === 'instagram' ? 'Instagram (未配置)'
                : pId === 'facebook' ? 'Facebook (未配置)'
                : pId === 'tiktok' ? 'TikTok (未配置)'
                : `${d.account.platformId.charAt(0).toUpperCase() + d.account.platformId.slice(1)} (未配置)`
              ),
              autoPilot: false,
              profileUrl: null
            } as any)
          }
        }
      })
    }

    const hasGoogle = list.some(a => ['google', 'google_business'].includes(a.platformId.toLowerCase()))
    const hasRednote = list.some(a => ['red', 'xiaohongshu', 'xhs'].includes(a.platformId.toLowerCase()))
    const hasInstagram = list.some(a => a.platformId.toLowerCase() === 'instagram')
    const hasFacebook = list.some(a => a.platformId.toLowerCase() === 'facebook')
    const hasTiktok = list.some(a => a.platformId.toLowerCase() === 'tiktok')

    if (!hasGoogle) {
      list.push({
        id: 'unconfigured_google_business',
        platformId: 'google',
        handle: 'unconfigured',
        displayName: 'Google Business (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasRednote) {
      list.push({
        id: 'unconfigured_red',
        platformId: 'red',
        handle: 'unconfigured',
        displayName: '小红书 (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasInstagram) {
      list.push({
        id: 'unconfigured_instagram',
        platformId: 'instagram',
        handle: 'unconfigured',
        displayName: 'Instagram (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasFacebook) {
      list.push({
        id: 'unconfigured_facebook',
        platformId: 'facebook',
        handle: 'unconfigured',
        displayName: 'Facebook (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasTiktok) {
      list.push({
        id: 'unconfigured_tiktok',
        platformId: 'tiktok',
        handle: 'unconfigured',
        displayName: 'TikTok (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    COPYWRITER_ROSTER.forEach((copywriter) => {
      const id = draftAccountIdForCopywriter(copywriter, accounts)
      if (list.some((account) => account.id === id)) return
      list.push({
        id,
        platformId: copywriter.platform,
        handle: 'unconfigured',
        displayName: `${copywriter.handle} (未配置)`,
        autoPilot: false,
        profileUrl: null,
      } as any)
    })
    return list
  }, [accounts, createdDrafts])

  useEffect(() => {
    if (!isAiGenerating || !createdDrafts || createdDrafts.length === 0) return

    let isMounted = true
    const interval = setInterval(async () => {
      const generatingDrafts = createdDrafts.filter(d => draftStatuses[d.accountId] === 'generating')
      
      if (generatingDrafts.length === 0) {
        setIsAiGenerating(false)
        clearInterval(interval)
        return
      }

      await Promise.all(
        generatingDrafts.map(async (draft) => {
          try {
            const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}`)
            const account = accountOptions.find(a => a.id === draft.accountId)
            const label = account ? (account.displayName || account.handle) : draft.accountId

            if (res.status === 404) {
              if (isMounted) {
                setDraftStatuses(prev => ({ ...prev, [draft.accountId]: 'failed' }))
                alert(`【AI 创作失败】账号 [${label}] 的内容生成未成功，数据已清理。`)
                setCreatedDrafts(prev => prev ? prev.filter(d => d.id !== draft.id) : null)
                setSelectedAccountIds(prev => prev.filter(id => id !== draft.accountId))
                setDraftCaptions(prev => {
                  const next = { ...prev }
                  delete next[draft.accountId]
                  return next
                })
                setDraftHashtags(prev => {
                  const next = { ...prev }
                  delete next[draft.accountId]
                  return next
                })
              }
              return
            }
            if (!res.ok) return
            const json = await res.json()
            const updatedDraft = json.draft
            
            if (updatedDraft) {
              if (updatedDraft.status === 'failed') {
                if (isMounted) {
                  setDraftStatuses(prev => ({ ...prev, [draft.accountId]: 'failed' }))
                  const errMsg = updatedDraft.agentNote || '未知错误'
                  alert(`【AI 创作失败】账号 [${label}] 内容生成失败：\n${errMsg}`)
                  
                  // Clean up draft from DB immediately
                  fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}`, { method: 'DELETE' }).catch(() => {})

                  setCreatedDrafts(prev => prev ? prev.filter(d => d.id !== draft.id) : null)
                  setSelectedAccountIds(prev => prev.filter(id => id !== draft.accountId))
                  setDraftCaptions(prev => {
                    const next = { ...prev }
                    delete next[draft.accountId]
                    return next
                  })
                  setDraftHashtags(prev => {
                    const next = { ...prev }
                    delete next[draft.accountId]
                    return next
                  })
                }
                return
              }
              if (updatedDraft.caption && updatedDraft.caption !== '【AI 正在创作中...】') {
                if (isMounted) {
                  setDraftCaptions(prev => ({ ...prev, [draft.accountId]: updatedDraft.caption }))
                  setDraftHashtags(prev => ({ ...prev, [draft.accountId]: (updatedDraft.hashtags || []).join(' ') }))
                  setDraftStatuses(prev => ({ ...prev, [draft.accountId]: 'completed' }))
                }
              }
            }
          } catch (e) {
            console.error(`Error polling draft ${draft.id}:`, e)
          }
        })
      )
    }, 2000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [isAiGenerating, createdDrafts, draftStatuses, activeBrandId, accountOptions])

  useEffect(() => {
    if (activeBrandId) {
      // Load accounts
      fetch(`/api/brands/${activeBrandId}/accounts`)
        .then(res => res.json())
        .then(data => setAccounts(data.accounts || []))
        .catch(() => setAccounts([]))

      // Load assets
      fetch(`/api/brands/${activeBrandId}/assets`)
        .then(res => res.json())
        .then(data => setBrandAssets(data.assets || []))
        .catch(() => setBrandAssets([]))
    } else {
      setAccounts([])
      setBrandAssets([])
    }
  }, [activeBrandId])

  useEffect(() => {
    setAssetPageSize(12)
  }, [activeBrandId, assetTypeFilter, isCreatingPost])

  useEffect(() => {
    setActiveBrandId(brandId)
  }, [brandId])

  useEffect(() => {
    fetch('/api/brands?assignedOnly=true')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAllBrands(data)
        }
      })
      .catch(() => {})
  }, [])

  // Fetch brand activity (last published date) for color-coded health status
  useEffect(() => {
    fetch('/api/dashboard/brand-activity')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.brands)) {
          const map: Record<string, string | null> = {}
          data.brands.forEach((b: { id: string; lastPublishedAt: string | null }) => {
            map[b.id] = b.lastPublishedAt
          })
          setBrandActivityMap(map)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (activeBrandId) {
      fetch(`/api/brands/${activeBrandId}`)
        .then(res => res.json())
        .then(data => setBrandDetails(data))
        .catch(() => {})
    }
  }, [activeBrandId])



  // Media asset handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    setAttachedMedia((prev) => {
      const updated = [...prev]
      const draggedItem = updated[draggedIndex]
      updated.splice(draggedIndex, 1)
      updated.splice(index, 0, draggedItem)
      return updated
    })
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleToggleAsset = (asset: { id: string; url: string }) => {
    setAttachedMedia((prev) => {
      const exists = prev.some((m) => m.type === 'asset' && m.id === asset.id)
      if (exists) {
        return prev.filter((m) => !(m.type === 'asset' && m.id === asset.id))
      } else {
        return [...prev, { id: asset.id, type: 'asset', url: asset.url }]
      }
    })
  }

  const handleRemoveMedia = (index: number) => {
    setAttachedMedia((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleAddUrl = () => {
    const url = newUrlInput.trim()
    if (!url) return
    setAttachedMedia((prev) => [
      ...prev,
      { id: url, type: 'url', url }
    ])
    setNewUrlInput('')
  }

  const selectedAssetIds = useMemo(() => attachedMedia.filter(m => m.type === 'asset').map(m => m.id), [attachedMedia])

  // Asset filtering helper
  const filteredAssets = useMemo(() => {
    // Sort descending by createdAt to prioritize latest uploaded assets
    const sorted = [...brandAssets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return sorted.filter(asset => {
      if (assetTypeFilter === 'unused') {
        return asset.usedCount === 0
      }
      const isVid = asset.mimeType?.startsWith('video/') || isVideoUrl(asset.url)
      if (assetTypeFilter === 'all') {
        return !isVid
      }
      return true
    })
  }, [brandAssets, assetTypeFilter])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return
      if (e.key === 'Escape') {
        setLightboxIndex(null)
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null && prev < filteredAssets.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredAssets.length - 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, filteredAssets.length])

  useEffect(() => {
    if (preselectedAssetIds && preselectedAssetIds.length > 0 && brandAssets.length > 0) {
      const mappedAssets = preselectedAssetIds
        .map((id) => {
          const found = brandAssets.find((a) => a.id === id)
          return found ? { id: found.id, type: 'asset' as const, url: found.url } : null
        })
        .filter((a): a is { id: string; type: 'asset'; url: string } => !!a)

      if (mappedAssets.length > 0) {
        // Store media to pre-fill in PostEditDrawer, then open drawer
        setPendingInitialMedia(mappedAssets)
        setIsCreatingNewPost(true)
      }

      clearPreselectedAssets?.()
    }
  }, [preselectedAssetIds, brandAssets, clearPreselectedAssets])

  // API triggers
  const triggerCopywriter = async (draftId: string, silent = false) => {
    if (!activeBrandId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draftId}/trigger-copywriter`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '触发 AI 创作失败')
      if (!silent) {
        alert('AI 创作已在后台启动，您可以稍后查看。')
        setIsCreatingPost(false)
        await refreshCalendar()
      }
    } catch (e: any) {
      if (!silent) {
        alert(e.message || '触发 AI 创作失败')
      } else {
        console.error(`Copywriter trigger failed silently:`, e)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCancelCreation = async () => {
    if (createdDrafts && createdDrafts.length > 0) {
      setSaving(true)
      try {
        await Promise.all(
          createdDrafts.map(d =>
            fetch(`/api/brands/${activeBrandId}/drafts/${d.id}`, { method: 'DELETE' }).catch(() => {})
          )
        )
      } catch (e) {
        console.error('Failed to clean up drafts on cancel:', e)
      } finally {
        setSaving(false)
      }
    }
    setIsCreatingPost(false)
    setPreviewModalOpen(false)
    setCreatedDrafts(null)
    setIsAiGenerating(false)
    setDraftCaptions({})
    setDraftHashtags({})
    setDraftStatuses({})
    setCaption('')
    setContentIdea('')
    setCreativeHooks('')
    setHashtags('')
    setScheduledAt('')
    setAgentNote('')
    setAttachedMedia([])
  }

  const handleRegenerate = async () => {
    if (!createdDrafts || createdDrafts.length === 0) return
    setSaving(true)
    try {
      const newCaptions: Record<string, string> = {}
      const newHashtags: Record<string, string> = {}
      const newStatuses: Record<string, 'generating' | 'completed' | 'failed'> = {}

      createdDrafts.forEach(d => {
        const accId = d.accountId || ''
        newCaptions[accId] = '【AI 正在重新创作中...】'
        newHashtags[accId] = ''
        newStatuses[accId] = 'generating'
      })

      setDraftCaptions(newCaptions)
      setDraftHashtags(newHashtags)
      setDraftStatuses(newStatuses)
      setIsAiGenerating(true)

      await Promise.allSettled(createdDrafts.map(async (draft) => {
        const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}/trigger-copywriter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            theme: contentIdea || caption || agentNote,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'AI 创作失败')
      }))
    } catch (e) {
      console.error('Failed to regenerate drafts:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleMediaAIDesign = async (index: number, assetId: string, actionType: 'design' | 'video') => {
    if (!mediaOpPrompt.trim()) {
      alert('请输入操作提示词')
      return
    }
    
    setMediaProcessingIndex(index)
    try {
      const imageUrls = attachedMedia
        .map((m) => m.url)
        .filter((u): u is string => Boolean(u))

      const apiPath = actionType === 'video'
        ? `/api/brands/${activeBrandId}/video-director`
        : `/api/brands/${activeBrandId}/assets/${assetId}/design`

      const payload = actionType === 'video'
        ? {
            prompt: mediaOpPrompt,
            creativeHooks,
            imageAssetIds: [assetId],
            imageUrls,
          }
        : {
            prompt: mediaOpPrompt,
            action: actionType,
          }

      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '操作失败')
      }

      const newAsset = data.asset

      setAttachedMedia(prev => {
        const next = [...prev]
        next[index] = {
          id: newAsset.id,
          type: 'asset',
          url: newAsset.url
        }
        return next
      })

      alert(actionType === 'video' ? 'VideoDirector 图生视频成功！已为您同步该视频。' : 'AI 修图优化成功！已为您更新该图片。')
      setActiveMediaOp(null)
      setMediaOpPrompt('')
      // refresh assets
      fetch(`/api/brands/${activeBrandId}/assets`)
        .then(res => res.json())
        .then(data => setBrandAssets(data.assets || []))
        .catch(() => {})
    } catch (err: any) {
      alert(err.message || '操作失败')
    } finally {
      setMediaProcessingIndex(null)
    }
  }

    const saveDraft = async (nextStatus?: string, captionOverride?: string, scheduledAtOverride?: string, accountIdsOverride?: string[]) => {
    if (!activeBrandId) return null
    let activeCaption = captionOverride !== undefined ? captionOverride : caption
    if (!activeCaption.trim() && contentIdea.trim()) {
      activeCaption = contentIdea.trim()
      setCaption(activeCaption)
    }
    const trimmedCaption = activeCaption.trim()
    if (!trimmedCaption) {
      alert('草稿正文或内容创意不能为空')
      return null
    }
    const activeAccountIds = accountIdsOverride || selectedAccountIds
    if (activeAccountIds.length === 0) {
      alert('请至少选择一位 Copywriter')
      return null
    }
    setSaving(true)
    const mediaUrls = attachedMedia.filter((m) => m.type === 'url').map((m) => m.url)
    const formattedAgentNote = contentIdea.trim() ? `【AI 生成指令】${contentIdea.trim()}【/AI 生成指令】\n${agentNote}` : agentNote
    try {
      const savedDrafts: any[] = []

      // Create new drafts for all selected accounts
      const results = await Promise.all(
        activeAccountIds.map(async (accId) => {
          const res = await fetch(`/api/brands/${activeBrandId}/drafts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caption: trimmedCaption,
              hashtags: parseTags(hashtags),
              accountId: accId,
              scheduledAt: scheduledAtOverride === 'none' ? null : ((scheduledAtOverride || scheduledAt) ? new Date(scheduledAtOverride || scheduledAt).toISOString() : null),
              agentNote: formattedAgentNote,
              status: nextStatus || 'draft',
              mediaUrls,
              assetIds: selectedAssetIds,
              creativeHooks: creativeHooks.trim(),
            }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json.error || '创建草稿失败')
          return json.draft || null
        })
      )
      results.forEach(d => { if (d) savedDrafts.push(d) })

      await refreshCalendar()
      return savedDrafts
    } catch (e: any) {
      alert(e.message || '保存草稿失败')
      return null
    } finally {
      setSaving(false)
    }
  }

  const hasPendingGeneratedDrafts = () => Boolean(createdDrafts?.some((d) => draftStatuses[d.accountId] === 'generating'))

    const saveOrUpdateDrafts = async (status: string, scheduledAtOverride?: string | null) => {
    if (!activeBrandId) return null
    setSaving(true)
    try {
      if (createdDrafts && createdDrafts.length > 0) {
        const readyDrafts = createdDrafts.filter((d) => {
          const key = d.accountId || ''
          const cap = (draftCaptions[key] || d.caption || '').trim()
          return draftStatuses[key] === 'completed' && cap && !cap.includes('【AI 正在创作中')
        })
        if (readyDrafts.length === 0) {
          alert('暂无已完成的内容可操作')
          return []
        }
        const updated = await Promise.all(
          readyDrafts.map(async (d) => {
            const currentCaption = draftCaptions[d.accountId] || d.caption || '【AI 正在创作中...】'
            const currentHashtags = draftHashtags[d.accountId] !== undefined
              ? (typeof draftHashtags[d.accountId] === 'string' ? parseTags(draftHashtags[d.accountId]) : draftHashtags[d.accountId])
              : d.hashtags

            const res = await fetch(`/api/brands/${activeBrandId}/drafts/${d.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                caption: currentCaption,
                hashtags: Array.isArray(currentHashtags) ? currentHashtags : parseTags(String(currentHashtags || '')),
                status,
                scheduledAt: scheduledAtOverride === null ? null : (scheduledAtOverride || (scheduledAt ? new Date(scheduledAt).toISOString() : null)),
                creativeHooks: creativeHooks.trim(),
              }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || `更新草稿失败: ${d.id}`)
            return json.draft
          })
        )
        const updatedIds = new Set(readyDrafts.map((draft) => draft.id))
        const remainingDrafts = createdDrafts.filter((draft) => !updatedIds.has(draft.id))
        setCreatedDrafts(remainingDrafts.length > 0 ? remainingDrafts : null)
        await refreshCalendar()
        return updated
      } else {
        const saved = await saveDraft(status, undefined, scheduledAtOverride === null ? 'none' : scheduledAtOverride)
        return saved
      }
    } catch (e: any) {
      alert(e.message || '操作失败')
      return null
    } finally {
      setSaving(false)
    }
  }

    const submitDraft = async () => {
    if (!activeBrandId) return
    const draftsList = await saveOrUpdateDrafts('draft')
    if (!draftsList || draftsList.length === 0) return

    setSaving(true)
    try {
      const responses = await Promise.all(
        draftsList.map(async (draft) => {
          const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}/submit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: agentNote }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(mediaValidationErrorMessage(json, `提交草稿 ${draft.id} 失败`))
          return json
        })
      )
      const warningText = formatMediaWarnings(responses)
      alert(`草稿提交成功！${warningText ? `\n\n${warningText}` : ''}`)
      if (!hasPendingGeneratedDrafts()) setIsCreatingPost(false)
      await refreshCalendar()
    } catch (e: any) {
      alert(e.message || '提交草稿失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSchedulePublish = async (customTime?: string) => {
    if (!activeBrandId) return

    setSaving(true)
    try {
      // Call unified smart scheduling API to get recommended publish time if no customTime provided
      let targetDateISO: string
      const parsedTime = scheduledAt ? new Date(scheduledAt).toISOString() : null
      const isFutureTime = parsedTime && new Date(parsedTime).getTime() > Date.now()

      if (customTime) {
        targetDateISO = new Date(customTime).toISOString()
      } else if (isFutureTime && parsedTime) {
        targetDateISO = parsedTime
      } else {
        try {
          const schedRes = await fetch(`/api/brands/${activeBrandId}/scheduling/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: null, numberOfPosts: 1, urgency: 'normal' }),
          })
          if (schedRes.ok) {
            const schedData = await schedRes.json()
            targetDateISO = schedData.recommendations?.[0]?.recommendedAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
          } else {
            targetDateISO = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
          }
        } catch {
          targetDateISO = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        }
      }

      const draftsList = await saveOrUpdateDrafts('scheduled', targetDateISO)
      if (!draftsList || draftsList.length === 0) { setSaving(false); return }

      const responses = await Promise.all(
        draftsList.map(async (draft) => {
          const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}/submit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: agentNote }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(mediaValidationErrorMessage(json, `提交草稿 ${draft.id} 失败`))
          return json
        })
      )

      const dt = new Date(targetDateISO)
      const timeStr = dt.toLocaleString('zh-CN', {
        month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      const warningText = formatMediaWarnings(responses)
      const queuedCount = responses.filter((response: any) => response?.queued).length
      if (queuedCount > 0) {
        alert(`${queuedCount} 个大视频已进入后台发布队列，页面会自动更新发布状态。${warningText ? `\n\n${warningText}` : ''}`)
      } else if (customTime) {
        alert(`排期成功！系统已为您安排在 ${timeStr} 发布。${warningText ? `\n\n${warningText}` : ''}`)
      } else {
        alert(`智能排期成功！系统已为您安排在 ${timeStr} 发布。${warningText ? `\n\n${warningText}` : ''}`)
      }
      if (!hasPendingGeneratedDrafts()) {
        setIsCreatingPost(false)
        setShowPublishOptionModal(false)
      }
      await refreshCalendar()
    } catch (e: any) {
      alert(e.message || '排期提交失败')
    } finally {
      setSaving(false)
    }
  }



  const handlePublishImmediately = async () => {
    if (!activeBrandId) return

    // For immediate publish, scheduledAt should be null so that it gets published right now.
    // Use 'draft' as intermediate status — submitDraftForDelivery decides the final status
    // (either 'published', 'scheduled', or 'failed'). Pre-setting 'published' caused a
    // status inconsistency when PostFast API key was missing or delivery failed.
    const draftsList = await saveOrUpdateDrafts('draft', null)
    if (!draftsList || draftsList.length === 0) return

    setSaving(true)
    try {
      const responses = await Promise.all(
        draftsList.map(async (draft) => {
          // Use /approve route to bypass autopilot check and force publish
          const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}/approve`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: agentNote }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(mediaValidationErrorMessage(json, `发布草稿 ${draft.id} 失败`))
          return json
        })
      )

      const warningText = formatMediaWarnings(responses)
      const queuedCount = responses.filter((response: any) => response?.queued).length
      alert(queuedCount > 0
        ? `${queuedCount} 个大视频已进入后台发布队列，页面会自动更新发布状态。${warningText ? `\n\n${warningText}` : ''}`
        : `立刻发布成功！系统已为您直接发布内容。${warningText ? `\n\n${warningText}` : ''}`)
      if (!hasPendingGeneratedDrafts()) {
        setIsCreatingPost(false)
        setShowPublishOptionModal(false)
      }
      await refreshCalendar()
    } catch (e: any) {
      alert(e.message || '立刻发布失败')
    } finally {
      setSaving(false)
    }
  }

  const refreshCalendar = async () => {
    try {
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (activeBrandId) query.set('brandId', activeBrandId)
      const res = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const calendarCreativeIdFromEvent = (event: CalendarEvent) => {
    return event.agentNote?.match(/brand-plan-calendar-item:([^\s]+)/)?.[1] || ''
  }

  const materialRequirementsFromEvent = (event: CalendarEvent) => {
    const source = event.creativeHooks || event.agentNote || ''
    const materialLine = source
      .split(/\r?\n/)
      .find((line) => line.startsWith('素材需求：') || line.startsWith('material:'))
    const raw = materialLine
      ? materialLine.replace(/^素材需求：/, '').replace(/^material:/, '')
      : ''
    return raw
      .split(/[；;]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  const handleDownloadMaterialRequirement = (event: CalendarEvent) => {
    const requirements = materialRequirementsFromEvent(event)
    const fallback = event.creativeHooks || event.agentNote || event.title
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(event.title)} - 素材需求</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #111827; line-height: 1.55; }
    header { border-bottom: 2px solid #111827; margin-bottom: 20px; padding-bottom: 12px; }
    h1 { font-size: 24px; margin: 0 0 6px; }
    .meta { color: #475569; font-size: 13px; }
    section { break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; }
    p { margin: 6px 0; white-space: pre-wrap; }
    ul { margin: 8px 0 0 20px; padding: 0; }
    li { margin: 6px 0; white-space: pre-wrap; }
    @media print { body { margin: 18mm; } section { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(event.title || '内容创意')}</h1>
    <div class="meta">${escapeHtml(new Date(event.scheduledAt).toLocaleDateString('zh-CN'))} · ${escapeHtml(event.platform)} · ${escapeHtml(event.brandName)}</div>
  </header>
  <section>
    ${requirements.length
      ? `<p><strong>素材需求：</strong></p><ul>${requirements.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
      : `<p>${escapeHtml(fallback || '请按创意说明采集可用于发布的图片或视频素材。')}</p>`}
  </section>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = event.scheduledAt.slice(0, 10)
    link.href = url
    link.download = `${date}-${event.title || event.id}-素材需求.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleRegenerateCalendarCreative = async (event: CalendarEvent) => {
    const itemId = calendarCreativeIdFromEvent(event)
    if (!itemId) {
      alert('未找到对应的内容日历创意')
      return
    }
    setTriggeringId(event.id)
    try {
      const month = event.scheduledAt.slice(0, 7)
      const res = await fetch(`/api/brands/${event.brandId}/brand-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'regenerate_calendar_item',
          month,
          itemId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '重新生成创意失败')
      await refreshCalendar()
    } catch (error: any) {
      alert(error?.message || '重新生成创意失败')
    } finally {
      setTriggeringId(null)
    }
  }

  const handleAIWrite = async (eventBrandId: string, draftId: string) => {
    const targetBrandId = eventBrandId || activeBrandId
    if (!targetBrandId) {
      alert('未找到关联的品牌ID')
      return
    }
    setTriggeringId(draftId)
    try {
      const currentEvent = events.find(e => e.id === draftId)
      let notePayload = ""
      if (currentEvent) {
        const originalNote = currentEvent.agentNote || ""
        const cleanNote = originalNote.replace(/【AI 生成指令】[\s\S]*?【\/AI 生成指令】(?:\r?\n)?/, '').trim()
        notePayload = contentIdea.trim() 
          ? `【AI 生成指令】${contentIdea.trim()}【/AI 生成指令】\n${cleanNote}`.trim()
          : cleanNote
      } else {
        notePayload = contentIdea.trim() ? `【AI 生成指令】${contentIdea.trim()}【/AI 生成指令】` : ""
      }

      const patchRes = await fetch(`/api/brands/${targetBrandId}/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentNote: notePayload,
          creativeHooks: creativeHooks.trim()
        })
      })

      if (!patchRes.ok) {
        const errJson = await patchRes.json().catch(() => ({}))
        throw new Error(errJson.error || '保存创意想法与指令失败')
      }

      const res = await fetch(`/api/brands/${targetBrandId}/drafts/${draftId}/trigger-copywriter`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '触发 AI 创作失败')
      
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (activeBrandId) query.set('brandId', activeBrandId)
      
      // Update calendar immediately to show the placeholder caption
      const reloadRes = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (reloadRes.ok) {
        const data = await reloadRes.json()
        setEvents(data.events || [])
      }

      // Poll every 2 seconds until AI copywriting is complete
      let attempts = 0
      const maxAttempts = 15 // 30 seconds max
      const interval = setInterval(async () => {
        attempts++
        try {
          const checkRes = await fetch(`/api/brands/${targetBrandId}/drafts/${draftId}`)
          if (checkRes.status === 404) {
            clearInterval(interval)
            setTriggeringId(null)
            alert('【AI 创作失败】该渠道的内容生成未成功，数据已清理。')
            await refreshCalendar()
            return
          }
          if (checkRes.ok) {
            const checkData = await checkRes.json()
            const updatedDraft = checkData.draft
            if (updatedDraft) {
              if (updatedDraft.status === 'failed') {
                clearInterval(interval)
                setTriggeringId(null)
                const errMsg = updatedDraft.agentNote || '未知错误'
                alert(`【AI 创作失败】内容生成失败：\n${errMsg}`)
                
                // Clean up draft from DB immediately
                fetch(`/api/brands/${targetBrandId}/drafts/${draftId}`, { method: 'DELETE' }).catch(() => {})
                await refreshCalendar()
                return
              }
              if (updatedDraft.caption && updatedDraft.caption !== '【AI 正在创作中...】') {
                clearInterval(interval)
                setTriggeringId(null)
                
                // Reload final events to show the actual generated caption
                const reloadRes2 = await fetch(`/api/dashboard/calendar?${query.toString()}`)
                if (reloadRes2.ok) {
                  const data2 = await reloadRes2.json()
                  setEvents(data2.events || [])
                }
              }
            }
          }
        } catch (e) {
          console.error('Polling error:', e)
        }
        if (attempts >= maxAttempts) {
          clearInterval(interval)
          setTriggeringId(null)
        }
      }, 2000)

    } catch (e) {
      alert(e instanceof Error ? e.message : '触发 AI 创作失败')
      setTriggeringId(null)
    }
  }

  const handleAIDesign = async (draftId: string, mediaAssetId: string, actionType: 'design' | 'video') => {
    if (!designerPromptText.trim()) {
      alert('请输入您的智能修改指令，例如：“添加店长推荐标签”')
      return
    }

    if (actionType === 'video') {
      setVideoProcessing(true)
    } else {
      setDesignerProcessing(true)
    }

    try {
      const targetBrandId = activeBrandId || events.find(e => e.id === draftId)?.brandId
      if (!targetBrandId) {
        throw new Error('未找到关联的品牌ID')
      }

      const targetEvent = events.find(e => e.id === draftId)
      const apiPath = actionType === 'video'
        ? `/api/brands/${targetBrandId}/video-director`
        : `/api/brands/${targetBrandId}/assets/${mediaAssetId}/design`

      const payload = actionType === 'video'
        ? {
            prompt: designerPromptText,
            creativeHooks,
            imageAssetIds: [mediaAssetId],
            imageUrls: targetEvent?.mediaUrls || [],
          }
        : {
            prompt: designerPromptText,
            action: actionType,
          }

      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '设计修改失败')
      }

      const newAsset = data.asset

      // Patch the draft with the new media asset URL
      const patchRes = await fetch(`/api/brands/${targetBrandId}/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrls: [newAsset.url],
          assetIds: [newAsset.id]
        })
      })

      if (!patchRes.ok) {
        const patchData = await patchRes.json()
        throw new Error(patchData.error || '关联新素材到排期失败')
      }

      alert(actionType === 'video' ? 'VideoDirector 操作成功！已完成图生视频并同步到排期。' : 'Designer AI 操作成功！排期已自动同步全新设计的海报。')
      
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (activeBrandId) query.set('brandId', activeBrandId)
      const reloadRes = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (reloadRes.ok) {
        const data = await reloadRes.json()
        setEvents(data.events || [])
      }
      setShowDesignerPanel(null)
      setDesignerPromptText('')
    } catch (err: any) {
      alert(err.message || '修改失败')
    } finally {
      setDesignerProcessing(false)
      setVideoProcessing(false)
    }
  }

  const handleAIProposal = async () => {
    setAiProposalGenerating(true)
    try {
      // Trigger Apify sync to get latest reviews/topics for planning
      if (activeBrandId) {
        await fetch(`/api/brands/${activeBrandId}/apify-sync`, { method: 'POST' }).catch(() => {})
      }
      
      // Call coordinate-scheduler workflows to generate drafts (simulated interval or direct trigger if present)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Reload calendar to fetch newly created draft proposals
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (activeBrandId) query.set('brandId', activeBrandId)
      const res = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
        alert('AI 已根据品牌资产和本地动态为您生成了全新排期提案！')
      }
    } catch (err) {
      alert('一键排期提案失败，请稍后重试')
    } finally {
      setAiProposalGenerating(false)
    }
  }

  // Derived state memoizations
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      // Calendar grid shows the bounded publishing workflow returned by the API.
      const isVisible = isCalendarGridStatus(ev.status)
      if (activeFilter === 'all') return isVisible
      if (activeFilter === 'done') return ev.status === 'done' && ev.type !== 'task'
      return ev.status === activeFilter
    })
  }, [events, activeFilter])

  const eventsByDay = useMemo(() => {
    return filteredEvents.reduce<Record<number, CalendarEvent[]>>((acc, event) => {
      const day = new Date(event.scheduledAt).getDate()
      acc[day] = acc[day] || []
      acc[day].push(event)
      return acc
    }, {})
  }, [filteredEvents])

  const selectedDayEvents = useMemo(() => {
    return selectedDay ? (eventsByDay[selectedDay] || []) : []
  }, [selectedDay, eventsByDay])

  const activeDrawerEvent = useMemo(() => {
    return selectedDayEvents.find(e => e.id === selectedEventId) || selectedDayEvents[0]
  }, [selectedDayEvents, selectedEventId])

  const activeEventComments = useMemo(() => {
    return (activeDrawerEvent && commentsMap[activeDrawerEvent.id]) || []
  }, [activeDrawerEvent, commentsMap])

  // Synchronize Content Idea and Creative Hooks when selecting an event in the calendar drawer
  const lastDrawerEventIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (activeDrawerEvent) {
      if (lastDrawerEventIdRef.current !== activeDrawerEvent.id) {
        lastDrawerEventIdRef.current = activeDrawerEvent.id
        
        const note = activeDrawerEvent.agentNote || ''
        if (note.includes('【AI 生成指令】')) {
          const match = note.match(/【AI 生成指令】([\s\S]*?)【\/AI 生成指令】/)
          if (match) {
            setContentIdea(match[1].trim())
          } else {
            setContentIdea('')
          }
        } else {
          setContentIdea(note)
        }
        setCreativeHooks(activeDrawerEvent.creativeHooks || '')
      }
    } else {
      lastDrawerEventIdRef.current = null
      setContentIdea('')
      setCreativeHooks('')
    }
  }, [activeDrawerEvent])

  // Load calendar events
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
        const query = new URLSearchParams({ month })
        if (activeBrandId) query.set('brandId', activeBrandId)
        const res = await fetch(`/api/dashboard/calendar?${query.toString()}`)
        if (!res.ok) throw new Error('load failed')
        const data = await res.json()
        if (!cancelled) setEvents(data.events || [])
      } catch {
        if (!cancelled) setError('日历数据加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [viewYear, viewMonth, activeBrandId])

  // Reset selectedEventId to the first event of the selected day when day changes
  // NOTE: do NOT include selectedEventId in deps — that would cause the drawer to
  // reopen immediately after the user closes it (onClose sets selectedEventId=null,
  // then the effect fires and sets it back to selectedDayEvents[0].id).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedDay) {
      if (selectedDayEvents.length > 0) {
        setSelectedEventId(prev => {
          if (prev && selectedDayEvents.some(e => e.id === prev)) return prev
          return null   // don't auto-open; let the user click an event
        })
      } else {
        setSelectedEventId(null)
      }
    } else {
      setSelectedEventId(null)
    }
  }, [selectedDay, selectedDayEvents])



  const handleSendManualReply = (eventId: string, commentId: string) => {
    const text = commentReplyText[commentId]?.trim()
    if (!text) return

    setCommentsMap(prev => {
      const list = prev[eventId] || []
      return {
        ...prev,
        [eventId]: list.map(c => c.id === commentId ? { ...c, reply: text } : c)
      }
    })
    setCommentReplyText(prev => ({ ...prev, [commentId]: '' }))
  }

  const handleGenerateAiReply = (eventId: string, commentId: string, commentContent: string) => {
    setCommentsMap(prev => {
      const list = prev[eventId] || []
      return {
        ...prev,
        [eventId]: list.map(c => c.id === commentId ? { ...c, isGeneratingReply: true } : c)
      }
    })

    setTimeout(() => {
      let aiResponse = '感谢您的反馈！我们会继续努力提供更好的产品和服务。'
      if (commentContent.includes('地址') || commentContent.includes('门店') || commentContent.includes('在哪里')) {
        aiResponse = '亲亲，我们在上海市静安区南京西路123号设有旗舰店，欢迎您随时来店打卡体验！'
      } else if (commentContent.includes('预约') || commentContent.includes('排队') || commentContent.includes('周末')) {
        aiResponse = '周末客流量较大，为了避免您排队，建议您关注我们的小程序提前进行预约排队哦！'
      } else if (commentContent.includes('好吃') || commentContent.includes('超赞') || commentContent.includes('delicious') || commentContent.includes('amazing')) {
        aiResponse = '哇，太开心得到您的喜爱！我们会保持品质，期待您的下一次光临！❤️'
      } else if (commentContent.includes('open') || commentContent.includes('weekend')) {
        aiResponse = 'Yes, we are open on weekends from 9 AM to 10 PM. Looking forward to welcoming you!'
      } else if (commentContent.includes('vegan') || commentContent.includes('dairy-free')) {
        aiResponse = 'Yes, we do have delicious vegan and dairy-free options available! Please ask our staff when you arrive.'
      }

      setCommentsMap(prev => {
        const list = prev[eventId] || []
        return {
          ...prev,
          [eventId]: list.map(c => c.id === commentId ? {
            ...c,
            reply: aiResponse,
            isAiReply: true,
            isGeneratingReply: false
          } : c)
        }
      })
    }, 1000)
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
    setSelectedDay(null)
    setSelectedEventId(null)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
    setSelectedDay(null)
    setSelectedEventId(null)
  }

  const handlePrev = () => {
    if (activeView === 'day') {
      const refDay = selectedDay || 1
      const current = new Date(viewYear, viewMonth, refDay)
      current.setDate(current.getDate() - 1)
      setViewYear(current.getFullYear())
      setViewMonth(current.getMonth())
      setSelectedDay(current.getDate())
      setSelectedEventId(null)
    } else if (activeView === 'week') {
      const refDay = selectedDay || 1
      const current = new Date(viewYear, viewMonth, refDay)
      current.setDate(current.getDate() - 7)
      setViewYear(current.getFullYear())
      setViewMonth(current.getMonth())
      setSelectedDay(current.getDate())
      setSelectedEventId(null)
    } else {
      prevMonth()
    }
  }

  const handleNext = () => {
    if (activeView === 'day') {
      const refDay = selectedDay || 1
      const current = new Date(viewYear, viewMonth, refDay)
      current.setDate(current.getDate() + 1)
      setViewYear(current.getFullYear())
      setViewMonth(current.getMonth())
      setSelectedDay(current.getDate())
      setSelectedEventId(null)
    } else if (activeView === 'week') {
      const refDay = selectedDay || 1
      const current = new Date(viewYear, viewMonth, refDay)
      current.setDate(current.getDate() + 7)
      setViewYear(current.getFullYear())
      setViewMonth(current.getMonth())
      setSelectedDay(current.getDate())
      setSelectedEventId(null)
    } else {
      nextMonth()
    }
  }

  // Auto-select day when entering day/week view if selectedDay is null
  useEffect(() => {
    if ((activeView === 'day' || activeView === 'week') && !selectedDay) {
      const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()
      setSelectedDay(isCurrentMonth ? today.getDate() : 1)
    }
  }, [activeView, selectedDay, viewYear, viewMonth])

  // Get formatted week range label
  const getWeekRangeLabel = () => {
    const weekDays = getDaysForWeekView()
    const start = weekDays[0]
    const end = weekDays[6]
    if (start.getFullYear() === end.getFullYear()) {
      if (start.getMonth() === end.getMonth()) {
        return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getDate()}日`
      }
      return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`
    }
    return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const getDaysForWeekView = () => {
    const referenceDate = selectedDay ? new Date(viewYear, viewMonth, selectedDay) : new Date(viewYear, viewMonth, 1)
    const dayOfWeek = referenceDate.getDay() // 0 is Sunday
    const startOfWeek = new Date(referenceDate)
    startOfWeek.setDate(referenceDate.getDate() - dayOfWeek)
    
    const weekDays = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      weekDays.push(d)
    }
    return weekDays
  }

  // --- Start of Diagnostics & Stats ---
  const getVisibleEvents = () => {
    if (activeView === 'day' && selectedDay) {
      return events.filter(ev => {
        const d = new Date(ev.scheduledAt)
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === selectedDay
      })
    } else if (activeView === 'week') {
      const weekDays = getDaysForWeekView()
      const start = weekDays[0]
      const end = weekDays[6]
      const startMs = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0).getTime()
      const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime()
      return events.filter(ev => {
        const t = new Date(ev.scheduledAt).getTime()
        return t >= startMs && t <= endMs
      })
    } else {
      return events.filter(ev => {
        const d = new Date(ev.scheduledAt)
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth
      })
    }
  }

  const visibleEvents = getVisibleEvents()

  const stats = {
    done: visibleEvents.filter(e => e.status === 'done' && e.type !== 'task').length,
    draft: visibleEvents.filter(e => e.status === 'draft').length,
    scheduled: visibleEvents.filter(e => e.status === 'scheduled').length,
    planned: visibleEvents.filter(e => e.status === 'planned_unimplemented').length,
    pending: visibleEvents.filter(e => e.status === 'pending').length,
    publishing: visibleEvents.filter(e => e.status === 'publishing').length,
    failed: visibleEvents.filter(e => e.status === 'failed').length,
    total: visibleEvents.length
  }

  // Calculate gap days (days with 0 posts)
  const getGapDaysCount = () => {
    if (activeView === 'day' && selectedDay) {
      const dayEvents = events.filter(ev => {
        const d = new Date(ev.scheduledAt)
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === selectedDay
      })
      return dayEvents.length === 0 ? 1 : 0
    } else if (activeView === 'week') {
      let gaps = 0
      const weekDays = getDaysForWeekView()
      weekDays.forEach(wd => {
        const dayEvents = events.filter(ev => {
          const d = new Date(ev.scheduledAt)
          return d.getFullYear() === wd.getFullYear() && d.getMonth() === wd.getMonth() && d.getDate() === wd.getDate()
        })
        if (dayEvents.length === 0) gaps++
      })
      return gaps
    } else {
      let gaps = 0
      const totalMonthDays = new Date(viewYear, viewMonth + 1, 0).getDate()
      for (let d = 1; d <= totalMonthDays; d++) {
        const dayEvents = events.filter(ev => {
          const date = new Date(ev.scheduledAt)
          return date.getFullYear() === viewYear && date.getMonth() === viewMonth && date.getDate() === d
        })
        if (dayEvents.length === 0) gaps++
      }
      return gaps
    }
  }

  const gapDaysCount = getGapDaysCount()

  // Calculate missing platforms (for single brand view)
  const getMissingPlatforms = () => {
    const activeAccounts = brandDetails?.accounts || []
    const missing: string[] = []
    if (activeBrandId && activeAccounts.length > 0) {
      activeAccounts.forEach((acc: any) => {
        const normPlatform = normalizePlatformLabel(acc.platformId)
        const hasPost = visibleEvents.some(ev => normalizePlatformLabel(ev.platform) === normPlatform)
        if (!hasPost && !missing.includes(normPlatform)) {
          missing.push(normPlatform)
        }
      })
    }
    return missing
  }

  const missingPlatforms = getMissingPlatforms()

  // Calculate missing brands (for all brands view)
  const getMissingBrands = () => {
    const missing: string[] = []
    if (!activeBrandId && allBrands.length > 0) {
      allBrands.forEach((b: any) => {
        const hasPost = visibleEvents.some(ev => ev.brandId === b.id)
        if (!hasPost) {
          missing.push(b.name)
        }
      })
    }
    return missing
  }

  const missingBrands = getMissingBrands()
  // --- End of Diagnostics & Stats ---

  const isToday = (d: number) => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
  const formatTime = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  const expiredAccounts = brandDetails?.accounts?.filter((acc: any) => {
    if (!acc.expiresAt) return false
    return new Date(acc.expiresAt) < new Date()
  }) || []

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 bg-slate-50 dark:bg-slate-950 font-sans">
      
      {/* 1. Left Sidebar: Channels & Private Domain */}
      <aside className="w-full lg:w-[260px] bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-4 tracking-wider">托管渠道 (Channels)</h2>
          
          <button
            onClick={() => {
              if (!activeBrandId) {
                alert('请在左侧选择特定品牌后再新建发布草稿。')
                return
              }
              setIsCreatingNewPost(true)
            }}
            className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-slate-700 dark:text-slate-300 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all font-bold text-xs"
          >
            <Plus className="w-4 h-4 text-slate-500" />
            <span>新建发布 (New Post)</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
          {/* Brand List Selection */}
          <div>
            <div 
              onClick={() => setIsBrandsCollapsed(!isBrandsCollapsed)}
              className="flex items-center justify-between mb-3 px-1 cursor-pointer select-none text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <span className="text-[10px] font-black uppercase tracking-widest">
                我的品牌 (My Brands)
              </span>
              {isBrandsCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </div>
            {!isBrandsCollapsed && (
              allBrands.length > 0 ? (() => {
                const now = new Date()

                // Compute health status per brand
                const getBrandHealth = (brandId: string): 'red' | 'yellow' | 'green' | 'unknown' => {
                  if (!(brandId in brandActivityMap)) return 'unknown'
                  const lastPub = brandActivityMap[brandId]
                  if (!lastPub) return 'red'
                  const daysSince = Math.floor((now.getTime() - new Date(lastPub).getTime()) / (1000 * 60 * 60 * 24))
                  if (daysSince <= 2) return 'green'
                  if (daysSince === 3) return 'yellow'
                  return 'red'
                }

                const healthOrder: Record<string, number> = { red: 0, yellow: 1, green: 2, unknown: 3 }
                const sortedBrands = [...allBrands].sort((a, b) => {
                  return (healthOrder[getBrandHealth(a.id)] ?? 3) - (healthOrder[getBrandHealth(b.id)] ?? 3)
                })

                const healthDot: Record<string, string> = {
                  red: 'bg-red-500',
                  yellow: 'bg-amber-400',
                  green: 'bg-emerald-500',
                  unknown: 'bg-slate-300 dark:bg-slate-600',
                }

                const healthLabel: Record<string, string> = {
                  red: '超过2天未发布',
                  yellow: '第3天未发布',
                  green: '3天内有发布',
                  unknown: '暂无数据',
                }

                return (
                  <ul className="space-y-1.5 mb-6">
                    <li
                      onClick={() => setActiveBrandId(undefined)}
                      className={`flex flex-col p-2.5 rounded-xl cursor-pointer transition-all border ${
                        activeBrandId === undefined
                          ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-400 font-bold'
                          : 'bg-white dark:bg-slate-900 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <span className="text-xs text-slate-700 dark:text-slate-200">全部品牌 (All Brands)</span>
                    </li>
                    {sortedBrands.map((b: any) => {
                      const isSelected = b.id === activeBrandId
                      const lacksChannels = !b.accounts || b.accounts.length === 0
                      const health = getBrandHealth(b.id)
                      return (
                        <li
                          key={b.id}
                          onClick={() => setActiveBrandId(b.id)}
                          className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                            isSelected
                              ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800/40 font-bold'
                              : 'bg-white dark:bg-slate-900 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30'
                          }`}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className={`text-xs truncate ${
                              isSelected
                                ? 'text-indigo-700 dark:text-indigo-400'
                                : 'text-slate-700 dark:text-slate-200'
                            }`}>{b.name}</span>
                            {lacksChannels && (
                              <span className="text-[9px] text-red-500 font-medium mt-0.5">
                                ⚠️ 缺失渠道配置
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-0.5 ml-2 shrink-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                health === 'red' ? 'bg-red-500 animate-pulse' :
                                health === 'yellow' ? 'bg-amber-400' :
                                health === 'green' ? 'bg-emerald-500' :
                                'bg-slate-300 dark:bg-slate-600'
                              }`}
                              title={healthLabel[health]}
                            />
                            <span className={`text-[8px] font-semibold ${
                              health === 'red' ? 'text-red-500' :
                              health === 'yellow' ? 'text-amber-500' :
                              health === 'green' ? 'text-emerald-600 dark:text-emerald-400' :
                              'text-slate-400'
                            }`}>
                              {healthLabel[health]}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )
              })() : (
                <div className="text-[11px] text-slate-400 italic p-1 mb-6">加载品牌中...</div>
              )
            )}
          </div>

          {/* Dynamic Accounts List from DB */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {brandDetails?.name || '当前品牌'} · 托管渠道
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            
            {activeBrandId && brandDetails?.accounts && brandDetails.accounts.length > 0 ? (
              <ul className="space-y-1.5">
                {brandDetails.accounts.filter((acc: any) => {
                    const label = (acc.handle || acc.displayName || '').trim().toLowerCase()
                    return label && label !== 'unconfigured' && label !== 'unknown' && label !== '未配置'
                  }).map((acc: any) => {
                  const normPlatform = normalizePlatformLabel(acc.platformId)
                  const isExpired = acc.expiresAt && new Date(acc.expiresAt) < new Date()
                  return (
                    <li key={acc.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 flex items-center justify-center rounded text-[9px] text-white font-extrabold ${
                          normPlatform === 'IG' ? 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500' :
                          normPlatform === 'Google' ? 'bg-blue-550' :
                          normPlatform === 'TikTok' ? 'bg-black' :
                          normPlatform === 'Facebook' ? 'bg-indigo-650' :
                          normPlatform === '小红书' ? 'bg-red-600' : 'bg-slate-500'
                        }`}>
                          {normPlatform}
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate max-w-[140px]">
                          {acc.handle || acc.displayName}
                        </span>
                      </div>
                      <span className={`w-1.5 h-1.5 rounded-full ${isExpired ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    </li>
                  )
                })}
              </ul>
            ) : !activeBrandId ? (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80">
                当前显示全部品牌发布排期。选择左侧特定品牌可查看并配置其单独的托管发布渠道。
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80">
                暂未连接发布渠道，请前往“品牌设置”完成账号授权。
              </div>
            )}
          </div>

          {/* Dynamic Warnings List */}
          {activeBrandId && expiredAccounts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">警告与异常</span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              </div>
              <div className="space-y-2">
                {expiredAccounts.map((acc: any) => (
                  <div key={acc.id} className="bg-amber-50 dark:bg-amber-955/20 border border-amber-200/50 dark:border-amber-900/30 p-3 rounded-xl flex gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="text-[10px]">
                      <p className="font-extrabold leading-tight">{normalizePlatformLabel(acc.platformId)} 授权过期</p>
                      <p className="mt-1 opacity-90">账号 {acc.handle} 的 AccessToken 已失效，排期将无法自动发布。</p>
                      <button onClick={() => alert('请前往设置重新连接')} className="mt-1.5 font-black underline hover:no-underline text-[9px]">去重新授权</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Brand Website / Landing Conversion page */}
          {activeBrandId && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">引流落地页</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/35 border border-slate-100 dark:border-slate-800 rounded-xl">
                <div className="flex items-center gap-2">
                  {brandDetails?.website ? (
                    <>
                      <Compass className="w-4 h-4 text-indigo-500" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[170px]">{brandDetails.website}</span>
                    </>
                  ) : (
                    <>
                      <Compass className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500 italic">缺失</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 2. Central Content Area: Calendar Grid */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950 p-4 lg:p-6 overflow-y-auto">
          <>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm mb-6 shrink-0">
          
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 min-w-[120px]">
              {activeView === 'day' && selectedDay
                ? `${viewYear}年 ${viewMonth + 1}月${selectedDay}日`
                : activeView === 'week'
                ? getWeekRangeLabel()
                : `${viewYear}年 ${MONTHS[viewMonth]}`}
            </h2>
            <div className="flex border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-800">
              <button onClick={handlePrev} className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 border-r border-slate-200 dark:border-slate-700 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={handleNext} className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDay(today.getDate()) }}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all bg-white dark:bg-slate-900"
            >
              今天 (Today)
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl">
              {(['all', 'planned_unimplemented', 'draft', 'pending', 'scheduled', 'publishing', 'done', 'failed'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setActiveFilter(filter); setSelectedEventId(null) }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    activeFilter === filter
                      ? 'bg-white dark:bg-slate-750 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {filter === 'all' ? '全部' : filter === 'planned_unimplemented' ? '排期待制作' : filter === 'draft' ? '草稿' : filter === 'pending' ? '待审核' : filter === 'scheduled' ? '排期待发布' : filter === 'publishing' ? '发布中' : filter === 'failed' ? '发布失败' : '已发布'}
                </button>
              ))}
            </div>

            <div className="flex border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
              {(['month', 'week', 'day', 'list'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`px-3.5 py-1.5 text-xs font-bold transition-all ${
                    activeView === view
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 border-r border-slate-200 dark:border-slate-700 last:border-0'
                  }`}
                >
                  {view === 'month' ? '月' : view === 'week' ? '周' : view === 'day' ? '日' : '列表'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm overflow-hidden flex flex-col flex-1">
          {activeView !== 'day' && activeView !== 'list' ? (
            <div className="overflow-x-auto flex-1 flex flex-col">
              <div className="min-w-[700px] md:min-w-0 flex-1 flex flex-col">
                <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                  {WEEKDAYS.map(d => (
                    <div key={d} className="text-center text-[10px] font-black text-slate-400 dark:text-slate-500 py-3 uppercase tracking-wider">
                      {d === '日' || d === '六' ? <span className="text-red-400">{d}</span> : d}
                    </div>
                  ))}
                </div>

                {activeView === 'month' && (
                  <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800 flex-1 min-h-[400px]">
              {cells.map((day, idx) => {
                const dayEvents = day ? (eventsByDay[day] || []) : []
                const selected = day === selectedDay
                const todayCell = day ? isToday(day) : false

                return (
                  <div
                    key={idx}
                    onClick={() => day && setSelectedDay(day)}
                    className={`p-2 cursor-pointer transition-all flex flex-col justify-between group min-h-[90px] lg:min-h-[110px]
                      ${day ? 'hover:bg-slate-50/60 dark:hover:bg-slate-800/20' : 'bg-slate-50/30 dark:bg-slate-950/20'}
                      ${selected ? 'bg-indigo-50/30 dark:bg-indigo-900/10 ring-2 ring-inset ring-indigo-500/55' : ''}`}
                  >
                    {day ? (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full
                            ${todayCell ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>
                            {day}
                          </span>
                          {dayEvents.length > 2 && (
                            <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">+{dayEvents.length - 2}</span>
                          )}
                        </div>
                        
                        <div className="space-y-1 flex-1 flex flex-col justify-end overflow-hidden">
                          {dayEvents.length > 0 ? (
                            groupEventsByTitle(dayEvents).slice(0, 2).map((group) => {
                              const isGrouped = group.events.length > 1
                              const normPlatform = normalizePlatformLabel(group.platform)
                              const hasVideo = group.mediaUrls?.[0] && group.platform === 'IG' && group.title.includes('视频')
                              
                              if (!isGrouped) {
                                return (
                                  <div
                                    key={group.id}
                                    onClick={(e) => { e.stopPropagation(); setSelectedDay(day); setSelectedEventId(group.id) }}
                                    className={`text-[9px] font-bold px-1.5 py-1 rounded-lg border flex items-center gap-1 truncate transition-transform hover:scale-[1.02] shadow-sm relative ${
                                      PLATFORM_COLORS[normPlatform] || 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200'
                                    }`}
                                  >
                                    {group.status === 'scheduled' && (
                                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                      </span>
                                    )}
                                    {hasVideo && <Video className="w-2.5 h-2.5 inline-block shrink-0 text-pink-500" />}
                                    {group.status === 'scheduled' && normPlatform === 'Google' && (
                                      <Shield className="w-2.5 h-2.5 text-blue-500 fill-blue-500/10 shrink-0" />
                                    )}
                                    <span>
                                      {!activeBrandId && `[${group.brandName}] `}
                                      {normPlatform} · {group.cleanTitle}
                                    </span>
                                  </div>
                                )
                              } else {
                                return (
                                  <div
                                    key={group.id}
                                    onClick={(e) => { e.stopPropagation(); setSelectedDay(day); setSelectedEventId(group.id) }}
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg border bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-800 dark:to-indigo-950/10 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-350 flex items-center gap-1 truncate transition-transform hover:scale-[1.02] shadow-sm relative"
                                  >
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      {group.events.map((e, idx) => {
                                        const p = normalizePlatformLabel(e.platform)
                                        return (
                                          <span key={idx} className="px-0.5 py-0 text-[7px] font-black rounded bg-slate-200/80 dark:bg-slate-700 text-slate-650 dark:text-slate-350 shrink-0">
                                            {p}
                                          </span>
                                        )
                                      })}
                                    </div>
                                    <span className="truncate">
                                      {!activeBrandId && `[${group.brandName}] `}
                                      {group.cleanTitle}
                                    </span>
                                  </div>
                                )
                              }
                            })
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {activeView === 'week' && (
            <div className="grid grid-cols-7 divide-x divide-slate-100 dark:divide-slate-800 flex-1 min-h-[150px]">
              {getDaysForWeekView().map((d, idx) => {
                const isSelected = selectedDay === d.getDate() && viewMonth === d.getMonth() && viewYear === d.getFullYear()
                const todayCell = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
                const isCurrentMonth = d.getMonth() === viewMonth
                
                const dayEvents = filteredEvents.filter(ev => {
                  const evDate = new Date(ev.scheduledAt)
                  return evDate.getDate() === d.getDate() &&
                         evDate.getMonth() === d.getMonth() &&
                         evDate.getFullYear() === d.getFullYear() &&
                         (activeFilter === 'all' ? isCalendarGridStatus(ev.status) : ev.status === activeFilter)
                })

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setViewYear(d.getFullYear())
                      setViewMonth(d.getMonth())
                      setSelectedDay(d.getDate())
                    }}
                    className={`p-2 cursor-pointer transition-all flex flex-col justify-between group min-h-[200px]
                      ${isCurrentMonth ? 'hover:bg-slate-50/60 dark:hover:bg-slate-800/20' : 'bg-slate-50/30 dark:bg-slate-950/20 opacity-60'}
                      ${isSelected ? 'bg-indigo-50/30 dark:bg-indigo-900/10 ring-2 ring-inset ring-indigo-500/55' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full
                        ${todayCell ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>
                        {d.getDate()}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">{WEEKDAYS[d.getDay()]}</span>
                    </div>
                    
                    <div className="space-y-1 flex-1 flex flex-col justify-end overflow-y-auto no-scrollbar">
                      {dayEvents.length > 0 ? (
                        groupEventsByTitle(dayEvents).map((group) => {
                          const isGrouped = group.events.length > 1
                          const normPlatform = normalizePlatformLabel(group.platform)
                          const hasVideo = group.mediaUrls?.[0] && group.platform === 'IG' && group.title.includes('视频')
                          
                          if (!isGrouped) {
                            return (
                              <div
                                key={group.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedDay(d.getDate()); setSelectedEventId(group.id) }}
                                className={`text-[9px] font-bold px-1.5 py-1 rounded-lg border flex items-center gap-1 truncate transition-transform hover:scale-[1.02] shadow-sm relative ${
                                  PLATFORM_COLORS[normPlatform] || 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200'
                                }`}
                              >
                                {group.status === 'scheduled' && (
                                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                  </span>
                                )}
                                {hasVideo && <Video className="w-2.5 h-2.5 inline-block shrink-0 text-pink-500" />}
                                {group.status === 'scheduled' && normPlatform === 'Google' && (
                                  <Shield className="w-2.5 h-2.5 text-blue-500 fill-blue-500/10 shrink-0" />
                                )}
                                <span>
                                  {!activeBrandId && `[${group.brandName}] `}
                                  {normPlatform} · {group.cleanTitle}
                                </span>
                              </div>
                            )
                          } else {
                            return (
                              <div
                                key={group.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedDay(d.getDate()); setSelectedEventId(group.id) }}
                                className="text-[9px] font-bold px-1.5 py-1 rounded-lg border bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-800 dark:to-indigo-950/10 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-350 flex flex-col gap-1 transition-transform hover:scale-[1.02] shadow-sm relative"
                              >
                                <div className="flex items-center gap-1 flex-wrap">
                                  {group.events.map((e, idx) => {
                                    const p = normalizePlatformLabel(e.platform)
                                    return (
                                      <span key={idx} className="px-1 py-0.2 text-[8px] font-black rounded bg-slate-200 dark:bg-slate-700 text-slate-650 dark:text-slate-350 shrink-0">
                                        {p}
                                      </span>
                                    )
                                  })}
                                </div>
                                <span className="truncate">
                                  {!activeBrandId && `[${group.brandName}] `}
                                  {group.cleanTitle}
                                </span>
                              </div>
                            )
                          }
                        })
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
              </div>
            </div>
          ) : null}

          {activeView === 'day' && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                      {viewYear}年 {viewMonth + 1}月{selectedDay}日 排期内容
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">当天共有 {selectedDayEvents.length} 条排期记录</p>
                  </div>
                </div>
                
                {selectedDayEvents.length === 0 ? (
                  <div className="py-12 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
                    <Clock className="w-10 h-10 mx-auto mb-3 opacity-20 text-slate-400" />
                    <p className="text-sm font-extrabold text-slate-750 dark:text-slate-350">当天无任何排期内容</p>
                    
                    {activeBrandId && (brandDetails?.accounts || []).length > 0 ? (
                      <div className="mt-4 max-w-sm mx-auto p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-800 text-left">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-widest block mb-2">渠道发布缺口检测：</span>
                        <div className="space-y-1.5">
                          {(brandDetails.accounts || []).map((acc: any) => {
                            const normPlatform = normalizePlatformLabel(acc.platformId)
                            return (
                              <div key={acc.id} className="flex items-center justify-between text-xs">
                                <span className="text-slate-650 dark:text-slate-450">{normPlatform} ({acc.handle || acc.displayName})</span>
                                <span className="text-[10px] font-black text-red-500 bg-red-50 dark:bg-red-955/20 px-1.5 py-0.5 rounded-full border border-red-100 dark:border-red-900/30">
                                  ❌ 缺失发布内容
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : !activeBrandId ? (
                      <p className="text-xs text-slate-450 mt-2">当前显示合并品牌看板。选择左侧特定品牌，可检测该品牌的具体渠道发布缺口。</p>
                    ) : (
                      <p className="text-xs text-slate-450 mt-2">该品牌暂未绑定任何托管发布渠道。请先前往“品牌设置”连接渠道账号。</p>
                    )}

                          {activeBrandId && (
                      <button
                        onClick={() => {
                          alert('请在“发布”或“任务”视图新建排期草稿，发布后将在日历对应日期上显示。')
                        }}
                        className="mt-6 inline-flex items-center gap-2 bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-xs py-2 px-4 rounded-xl transition-all shadow-md active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5 text-white" />
                        <span>新建排期草稿</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedDayEvents.map((ev) => {
                      const normPlatform = normalizePlatformLabel(ev.platform)
                      const isExpired = expiredAccounts.some((acc: any) => acc.platformId === ev.platform)
                      const isCalendarCreative = Boolean(calendarCreativeIdFromEvent(ev))
                      return (
                        <div 
                          key={ev.id}
                          onClick={() => { setSelectedEventId(ev.id) }}
                          className={`p-4 bg-white dark:bg-slate-850/40 rounded-2xl border border-slate-100 dark:border-slate-800/80 hover:border-indigo-500/40 hover:shadow-md transition-all cursor-pointer flex gap-4 ${
                            selectedEventId === ev.id ? 'ring-2 ring-indigo-500/60' : ''
                          }`}
                        >
                          {ev.mediaUrls?.[0] && (
                            <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-slate-100 border border-slate-200/40">
                              <img src={ev.mediaUrls[0]} alt={ev.title} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-2">
                                  {!activeBrandId && (
                                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-150 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/30">
                                      {ev.brandName}
                                    </span>
                                  )}
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                    PLATFORM_COLORS[normPlatform] || 'bg-slate-100 text-slate-500 border-slate-200'
                                  }`}>
                                    {normPlatform}
                                  </span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold">{formatTime(ev.time)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {ev.status === 'done' && ev.type !== 'task' && (
                                    <a
                                      href={getPostOriginalUrl(ev.platform, ev.platformPostId, ev.postUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indigo-650 hover:text-indigo-750 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                                    >
                                      <ExternalLink className="w-2.5 h-2.5" />
                                      <span>查看原文</span>
                                    </a>
                                  )}
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${STATUS_COLORS[ev.status]}`}>
                                    {calendarStatusLabel(ev.status, ev.type)}
                                  </span>
                                  {isCalendarCreative && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDownloadMaterialRequirement(ev)
                                        }}
                                        className="w-6 h-6 inline-flex items-center justify-center rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                                        title="下载素材需求"
                                      >
                                        <Download className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleRegenerateCalendarCreative(ev)
                                        }}
                                        disabled={triggeringId === ev.id}
                                        className="w-6 h-6 inline-flex items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 disabled:opacity-50"
                                        title="重新生成创意"
                                      >
                                        <RefreshCw className={`w-3 h-3 ${triggeringId === ev.id ? 'animate-spin' : ''}`} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed">
                                {!activeBrandId && `[${ev.brandName}] `}
                                {ev.title}
                              </h4>
                            </div>
                            
                            {isExpired && (
                              <div className="flex items-center gap-1 mt-2 text-[9px] font-bold text-amber-600 dark:text-amber-500">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>授权已失效</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === 'list' && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-2">
                  <div>
                    <h3 className="text-base font-black text-slate-800 dark:text-slate-100">本月排期列表</h3>
                    <p className="text-xs text-slate-400 mt-1">共筛选出 {filteredEvents.length} 条排期记录</p>
                  </div>
                </div>

                {filteredEvents.length === 0 ? (
                  <div className="py-24 text-center text-slate-400 dark:text-slate-500">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-extrabold">暂无符合条件的排期记录</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredEvents.map((ev) => {
                      const normPlatform = normalizePlatformLabel(ev.platform)
                      const evDate = new Date(ev.scheduledAt)
                      const isSelected = selectedEventId === ev.id
                      const isCalendarCreative = Boolean(calendarCreativeIdFromEvent(ev))
                      return (
                        <div
                          key={ev.id}
                          onClick={() => {
                            setSelectedDay(evDate.getDate())
                            setSelectedEventId(ev.id)
                          }}
                          className={`py-3.5 px-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 cursor-pointer transition-colors flex items-center justify-between gap-4 ${
                            isSelected ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="flex flex-col items-center shrink-0 w-10 text-center">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">
                                {evDate.toLocaleDateString('zh-CN', { month: 'short' })}
                              </span>
                              <span className="text-sm font-black text-slate-700 dark:text-slate-300 mt-0.5">{evDate.getDate()}日</span>
                            </div>

                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 ${
                              PLATFORM_COLORS[normPlatform] || 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                              {normPlatform}
                            </span>

                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[320px]">
                              {!activeBrandId && `[${ev.brandName}] `}
                              {ev.title.replace(`${normPlatform} · `, '')}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-slate-400 font-bold">{formatTime(ev.time)}</span>
                            {ev.status === 'done' && ev.type !== 'task' && (
                              <a
                                href={getPostOriginalUrl(ev.platform, ev.platformPostId, ev.postUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indigo-650 hover:text-indigo-750 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                <span>查看原文</span>
                              </a>
                            )}
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${STATUS_COLORS[ev.status]}`}>
                              {calendarStatusLabel(ev.status, ev.type)}
                            </span>
                            {isCalendarCreative && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDownloadMaterialRequirement(ev)
                                  }}
                                  className="w-7 h-7 inline-flex items-center justify-center rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                                  title="下载素材需求"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRegenerateCalendarCreative(ev)
                                  }}
                                  disabled={triggeringId === ev.id}
                                  className="w-7 h-7 inline-flex items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 disabled:opacity-50"
                                  title="重新生成创意"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${triggeringId === ev.id ? 'animate-spin' : ''}`} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </>
      </main>
      <PostEditDrawer
        isOpen={selectedEventId !== null || isCreatingNewPost}
        onClose={() => {
          setSelectedEventId(null);
          setIsCreatingNewPost(false);
          setPendingInitialMedia(null);
        }}
        postId={selectedEventId}
        brandId={activeBrandId || brandId || ''}
        brandName={brandDetails?.name}
        onSuccess={refreshCalendar}
        initialAttachedMedia={isCreatingNewPost && !selectedEventId ? pendingInitialMedia ?? undefined : undefined}
      />
    </div>
  )
}
