'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  Sparkles, Mic, Image as ImageIcon, Calendar as CalendarIcon, 
  ShoppingBag, Trash2, CheckCircle2, AlertCircle, Plus, 
  Send, RefreshCw, Layers, ShieldCheck, ChevronDown, Check,
  Play, BarChart2, Star, Video, Link, ArrowRight,
  Bell, Menu, Upload, X, ChevronUp, MapPin, Settings, LogOut,
  Utensils, Copy
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams, useRouter } from 'next/navigation'

const getMainAppUrl = (path: string) => {
  if (typeof window === 'undefined') return path
  const hostname = window.location.hostname
  const protocol = window.location.protocol
  const port = window.location.port
  
  if (port === '3001') {
    return `${protocol}//localhost:3000${path}`
  }
  
  if (hostname.startsWith('amc-mm.')) {
    const parentHost = hostname.replace(/^amc-mm\./, '')
    const portSuffix = port ? `:${port}` : ''
    return `${protocol}//${parentHost}${portSuffix}${path}`
  }
  
  return path
}

interface Brand {
  id: string
  name: string
  description?: string | null
  location?: string | null
  autoPilot: boolean
  logoUrl?: string | null
}

interface MediaAsset {
  id: string
  url: string
  filename?: string | null
  aiCategory?: string | null
  aiCaption?: string | null
  aiTags: string[]
}

interface ContentDraft {
  id: string
  caption: string
  mediaUrls: string[]
  scheduledAt?: string | null
  status: string
  platform: string
}

export default function BrandOwnerDashboard() {
  const searchParams = useSearchParams()
  const queryBrandId = searchParams?.get('brandId')
  const router = useRouter()
  const now = new Date()

  // --- States ---
  const [brands, setBrands] = useState<Brand[]>([])
  const [activeBrand, setActiveBrand] = useState<Brand | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Sub-pages overlay view state
  const [activeSubPage, setActiveSubPage] = useState<'calendar' | 'market' | 'assets' | 'settings' | null>(null)
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [actionItems, setActionItems] = useState<any[]>([])
  const [notificationsExpanded, setNotificationsExpanded] = useState(false)
  
  // Companion Chat state
  const [messages, setMessages] = useState<{ sender: 'ai' | 'user'; text: string; time: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [companionState, setCompanionState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle')
  const [emotion, setEmotion] = useState<'normal' | 'smile' | 'laugh' | 'effort' | 'confused' | 'wink' | 'excited'>('normal')

  // Assets upload state
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Previews & Ideas bulk posts states
  const [pendingImages, setPendingImages] = useState<File[]>([])
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([])
  const [postIdea, setPostIdea] = useState('')
  const [generatingBulk, setGeneratingBulk] = useState(false)
  const [completedNotification, setCompletedNotification] = useState(false)

  // Fullscreen Draft Previews overlay states
  const [generatedDrafts, setGeneratedDrafts] = useState<any[] | null>(null)
  const [isSubmittingFinalDrafts, setIsSubmittingFinalDrafts] = useState(false)
  const [scheduleTime, setScheduleTime] = useState<string>('')
  const [showSchedulePicker, setShowSchedulePicker] = useState(false)

  // Drafts & Weekly feed state
  const [drafts, setDrafts] = useState<ContentDraft[]>([])
  const [selectedDay, setSelectedDay] = useState<Date>(new Date())

  // Marketplace & Subscription state
  const [addons, setAddons] = useState({ veo3: false, dubco: false })
  const [updatingAddons, setUpdatingAddons] = useState(false)
  const [subscriptionPlan, setSubscriptionPlan] = useState<string>('未激活订阅')

  // AI Voice & Slang dictionary state
  const [brandTone, setBrandTone] = useState('')
  const [slangDict, setSlangDict] = useState<Record<string, string>>({})

  // Dropdown states
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false)
  
  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // --- Fetch Brand Data ---
  useEffect(() => {
    async function loadInitialData() {
      try {
        const res = await fetch('/api/brands')
        // If the session cookie is missing or expired, redirect to login
        if (res.status === 401 || res.status === 403) {
          router.replace('/login')
          return
        }
        if (res.ok) {
          const list = await res.json()
          setBrands(list)
          if (list.length > 0) {
            // Read active brand from URL parameter, or local storage if available
            const savedId = queryBrandId || localStorage.getItem('dashboard.activeBrandId')
            const found = list.find((b: any) => b.id === savedId) || list[0]
            setActiveBrand(found)
          }
        }
      } catch (err) {
        console.error('Failed to load brands:', err)
      } finally {
        setLoading(false)
      }
    }
    loadInitialData()
  }, [queryBrandId, router])

  // Sync active brand when query param changes
  useEffect(() => {
    if (queryBrandId && brands.length > 0) {
      const found = brands.find(b => b.id === queryBrandId)
      if (found && found.id !== activeBrand?.id) {
        setActiveBrand(found)
      }
    }
  }, [queryBrandId, brands, activeBrand?.id])

  // --- Load Assets & Drafts for Active Brand ---
  useEffect(() => {
    if (!activeBrand) return
    const currentBrandId = activeBrand.id
    localStorage.setItem('dashboard.activeBrandId', currentBrandId)
    
    async function loadBrandDetails(id: string) {
      try {
        // Fetch drafts
        const draftsRes = await fetch(`/api/brands/${id}/drafts`)
        if (draftsRes.ok) {
          const resData = await draftsRes.json()
          setDrafts(Array.isArray(resData) ? resData : resData.drafts || [])
        }
        
        // Fetch assets
        const assetsRes = await fetch(`/api/brands/${id}/assets`)
        if (assetsRes.ok) {
          const data = await assetsRes.json()
          setAssets(data.assets || [])
        }

        // Fetch subscription
        const subRes = await fetch(`/api/brands/${id}/subscription`)
        if (subRes.ok) {
          const subData = await subRes.json()
          const planName = subData.plan_name === 'NONE' ? '未激活订阅' : (subData.plan_name || '未激活订阅')
          setSubscriptionPlan(planName)
          if (subData && subData.selectedAddons) {
            setAddons({
              veo3: !!subData.selectedAddons.veo3,
              dubco: !!subData.selectedAddons.dubco
            })
          } else {
            setAddons({ veo3: false, dubco: false })
          }
        } else {
          setSubscriptionPlan('未激活订阅')
        }

        // Fetch brand knowledge
        const knowRes = await fetch(`/api/brands/${id}/knowledge`)
        if (knowRes.ok) {
          const knowData = await knowRes.json()
          setBrandTone(knowData.brandTone || '')
          setSlangDict(knowData.slangDict || {})
        }

        // Fetch brand details to get actionItems
        const detailRes = await fetch(`/api/brands/${id}`)
        if (detailRes.ok) {
          const detailData = await detailRes.json()
          setActionItems(detailData.actionItems || [])
          
          // Set dynamic greeting based on active brand details
          setMessages([
            { 
              sender: 'ai', 
              text: `你好！我是 ${detailData.name || activeBrand?.name || ''} 的 AI 语音助手。随时可以开始和我说出您的内容创意。`, 
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            }
          ])
        }
      } catch (err) {
        console.error('Failed to load brand details:', err)
      }
    }
    loadBrandDetails(currentBrandId)
  }, [activeBrand])

  // --- Text to Speech (TTS) ---
  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()

    // Clean text of markdown and brackets
    const cleanedText = text.replace(/\[.*?\]/g, '').replace(/[*#_`]/g, '').trim()
    if (!cleanedText) return

    const utterance = new SpeechSynthesisUtterance(cleanedText)
    utterance.lang = 'zh-CN'
    utterance.rate = 1.0

    utterance.onstart = () => {
      setCompanionState('speaking')
      // Scan content to select funny/smiling emotion
      const lower = cleanedText.toLowerCase()
      if (lower.includes('哈') || lower.includes('喜') || lower.includes('棒') || lower.includes('好') || lower.includes('完成') || lower.includes('成功') || lower.includes('日历')) {
        setEmotion('laugh')
      } else {
        setEmotion('smile')
      }
    }

    utterance.onend = () => {
      setCompanionState('idle')
      setEmotion('normal')
    }

    utterance.onerror = () => {
      setCompanionState('idle')
      setEmotion('normal')
    }

    window.speechSynthesis.speak(utterance)
  }

  // --- Voice Assist Activation (STT & TTS Chat integration) ---
  const startVoiceAssist = () => {
    if (!activeBrand) {
      showToast('未检测到有效品牌，请先选择品牌！', 'error')
      return
    }
    if (typeof window === 'undefined') return
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      showToast('您的浏览器不支持语音识别，请尝试使用 Chrome 或 Safari。', 'error')
      return
    }

    if (companionState === 'listening') {
      setCompanionState('idle')
      return
    }

    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel()
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'zh-CN'

    recognition.onstart = () => {
      setCompanionState('listening')
      showToast('正在倾听，请说话...', 'info')
    }

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript
      if (!transcript) return

      const lower = transcript.toLowerCase()
      const isPublishCommand = lower.includes('发布') || lower.includes('生成') || lower.includes('上传') || lower.includes('创作')

      if (isPublishCommand) {
        setCompanionState('thinking')
        try {
          const res = await fetch(`/api/brands/${activeBrand?.id}/copywriter/voice-chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: transcript })
          })
          if (res.ok) {
            const data = await res.json()
            if (data.reply) {
              speakText(data.reply)
            }
            if (data.action === 'GENERATE_AND_PUBLISH') {
              handleVoiceTriggerGenerateAndPublish(postIdea || '美味新品推荐', true)
              return
            }
          }
        } catch (err) {
          console.error(err)
        }
      }

      // If there are pending media previews, feed transcript and trigger copywriting generation
      if (pendingPreviews.length > 0) {
        setPostIdea(transcript)
        setCompanionState('thinking')
        setEmotion('effort')
        showToast(`已识别想法：“${transcript}”，正在批量创作...`, 'info')
        speakText('收到您的创意想法，正在为您创作所有平台的文案草稿...')
        handleVoiceTriggerGenerateAndPublish(transcript, false)
        return
      }

      setCompanionState('thinking')
      try {
        const res = await fetch(`/api/brands/${activeBrand?.id}/copywriter/voice-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: transcript })
        })
        if (res.ok) {
          const data = await res.json()
          if (data.reply) {
            speakText(data.reply)
          }
          if (data.action === 'GENERATE_AND_PUBLISH') {
            handleVoiceTriggerGenerateAndPublish(postIdea || '美食新品发布', true)
          } else {
            if (!data.reply) setCompanionState('idle')
          }
        } else {
          setCompanionState('idle')
        }
      } catch (err) {
        console.error(err)
        setCompanionState('idle')
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setCompanionState('idle')
      if (event.error === 'not-allowed') {
        showToast('请允许麦克风权限以进行对讲', 'error')
      }
    }

    recognition.onend = () => {
      setCompanionState(prev => prev === 'listening' ? 'idle' : prev)
    }

    recognition.start()
  }

  // --- Quick Upload Photos ---
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    if (!activeBrand) {
      showToast('未选择活动品牌，无法上传素材', 'error')
      e.target.value = ''
      return
    }
    const files = Array.from(e.target.files) as File[]

    try {
      if (activeSubPage === 'assets') {
        // Media Library Subpage: Upload immediately to backend
        setUploading(true)
        showToast(`正在上传 ${files.length} 个素材...`, 'info')
        try {
          for (const file of files) {
            const fileBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => {
                const result = reader.result as string
                const base64 = result.split(',')[1]
                resolve(base64)
              }
              reader.onerror = reject
              reader.readAsDataURL(file)
            })

            const res = await fetch(`/api/brands/${activeBrand.id}/assets/upload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: file.name,
                mimeType: file.type,
                fileBase64,
                folder: '素材库',
                aiCategory: 'raw',
                aiTags: ['待确认']
              })
            })

            if (res.ok) {
              const data = await res.json()
              if (data.asset) {
                setAssets(prev => [data.asset, ...prev])
              }
            }
          }
          showToast('素材上传成功！')
        } catch (err) {
          console.error('Upload failed:', err)
          showToast('素材上传失败，请重试', 'error')
        } finally {
          setUploading(false)
        }
      } else {
        // Homepage: Save to pending and invite prompt/idea input
        const videos = files.filter(file => file.type.startsWith('video/'))
        const images = files.filter(file => file.type.startsWith('image/'))

        if (videos.length > 0) {
          if (files.length > 1) {
            showToast('视频必须单独上传，不能与其它图片或视频混合！', 'error')
            return
          }
          if (videos.length > 1) {
            showToast('一次只能上传最多 1 个视频！', 'error')
            return
          }
          setPendingImages(videos)
          const previews = videos.map(file => URL.createObjectURL(file))
          setPendingPreviews(previews)
          showToast('已选择 1 个视频，请输入您的创意想法或开始语音对答。', 'info')
        } else {
          if (images.length > 9) {
            showToast('一次最多只能上传 9 张图片！', 'error')
            return
          }
          setPendingImages(images)
          const previews = images.map(file => URL.createObjectURL(file))
          setPendingPreviews(previews)
          showToast(`已选择 ${images.length} 张图片，请输入您的创意想法或开始语音对答。`, 'info')
        }
      }
    } finally {
      e.target.value = ''
    }
  }

  // --- Voice Trigger Generate and Publish ---
  const handleVoiceTriggerGenerateAndPublish = async (idea: string, autoPublish: boolean) => {
    if (!activeBrand) return
    if (pendingImages.length === 0) {
      setCompanionState('speaking')
      setEmotion('confused')
      speakText('老板，请先在控制台左侧上传至少一张素材图，然后再让我为您生成发布推文。')
      showToast('请先选择上传素材图！', 'error')
      return
    }

    setGeneratingBulk(true)
    setCompanionState('thinking')
    setEmotion('effort')
    showToast(autoPublish ? '收到指令：正在为您自动创作并发布到全部平台...' : '收到指令：正在为您创作多平台草稿...', 'info')

    try {
      const uploadedAssetIds: string[] = []
      const uploadedAssetUrls: string[] = []

      // 1. Upload pending images as base64 to assets API
      for (const file of pendingImages) {
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            const base64 = result.split(',')[1]
            resolve(base64)
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        const res = await fetch(`/api/brands/${activeBrand.id}/assets/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type,
            fileBase64,
            folder: '素材库',
            aiCategory: 'raw',
            aiTags: ['排期发布', '创意推文']
          })
        })

        if (res.ok) {
          const data = await res.json()
          if (data.assetId) {
            uploadedAssetIds.push(data.assetId)
            uploadedAssetUrls.push(data.assetUrl || data.asset?.url)
          }
        }
      }

      if (uploadedAssetIds.length === 0) {
        throw new Error('素材图片上传失败')
      }

      // 2. Submit to bulk-generate copywriter endpoint
      const bulkRes = await fetch(`/api/brands/${activeBrand.id}/copywriter/bulk-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetIds: uploadedAssetIds,
          mediaUrls: uploadedAssetUrls,
          idea
        })
      })

      if (!bulkRes.ok) {
        const errJson = await bulkRes.json().catch(() => ({}))
        throw new Error(errJson.error || 'Copywriter 批量内容创作失败')
      }

      const data = await bulkRes.json()
      if (!data.success || !data.drafts) {
        throw new Error('未返回有效的草稿列表')
      }

      const drafts = data.drafts

      if (autoPublish) {
        // 3. Auto-publish immediately
        showToast('文案创作已完成，正在一键发布到全部平台...', 'info')
        for (const draft of drafts) {
          const createRes = await fetch(`/api/brands/${activeBrand.id}/drafts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId: draft.accountId,
              caption: draft.caption,
              hashtags: draft.hashtags,
              mediaUrls: draft.mediaUrls,
              assetIds: draft.assetIds,
              status: 'draft',
            })
          })
          if (!createRes.ok) throw new Error('自动创建草稿失败')
          const created = await createRes.json()
          const createdDraftId = created.id

          const approveRes = await fetch(`/api/brands/${activeBrand.id}/drafts/${createdDraftId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              publishType: 'immediate',
            })
          })
          if (!approveRes.ok) throw new Error('自动发布草稿失败')
        }

        // Clean preview state
        setPendingImages([])
        setPendingPreviews([])
        setPostIdea('')
        setGeneratedDrafts(null)
        setCompanionState('speaking')
        setEmotion('wink')
        speakText('搞定，老板！文案已经自动生成并一键发布到了所有平台。您可以去发布日历中查看。')
        showToast('发布成功！所有推文已同步至排期并发布。', 'success')
      } else {
        // Just preview drafts on dashboard
        setGeneratedDrafts(drafts.map((d: any) => ({ ...d, selected: true })))
        setCompanionState('speaking')
        setEmotion('smile')
        speakText('我已经生成了所有平台的推文草稿，请您在屏幕上预览并安排发布。')
      }

    } catch (err: any) {
      console.error(err)
      showToast(err.message || '指令执行失败，请稍后重试', 'error')
      setCompanionState('idle')
      setEmotion('confused')
    } finally {
      setGeneratingBulk(false)
    }
  }

  // --- Bulk Submit (Generate all platform content) ---
  const handleBulkSubmit = async (overrideIdea?: string) => {
    await handleVoiceTriggerGenerateAndPublish(overrideIdea || postIdea, false)
  }

  const handleDirectPublish = async () => {
    if (!generatedDrafts || !activeBrand) return
    const selected = generatedDrafts.filter(d => d.selected)
    if (selected.length === 0) {
      showToast('请选择至少一个平台草稿进行发布！', 'error')
      return
    }

    const connectedDrafts = selected.filter(d => d.isConnected !== false)
    const unconnectedDrafts = selected.filter(d => d.isConnected === false)

    setIsSubmittingFinalDrafts(true)
    
    try {
      if (connectedDrafts.length > 0) {
        showToast('正在为您发布选中的已连接平台推文...', 'info')
        for (const draft of connectedDrafts) {
          // Create draft
          const createRes = await fetch(`/api/brands/${activeBrand.id}/drafts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId: draft.accountId,
              caption: draft.caption,
              hashtags: draft.hashtags,
              mediaUrls: draft.mediaUrls,
              assetIds: draft.assetIds,
              status: 'draft',
            })
          })
          if (!createRes.ok) {
            const err = await createRes.json().catch(() => ({}))
            throw new Error(err.error || '创建草稿失败')
          }
          const createdData = await createRes.json()
          const createdDraftId = createdData.draft.id

          // Approve/Submit immediately (forces publication)
          const approveRes = await fetch(`/api/brands/${activeBrand.id}/drafts/${createdDraftId}/approve`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: '立即发布' })
          })
          if (!approveRes.ok) {
            const err = await approveRes.json().catch(() => ({}))
            throw new Error(err.error || '立即发布草稿失败')
          }
        }
        showToast('已连接平台的推文发布成功！', 'success')
      }

      if (unconnectedDrafts.length > 0) {
        // Keep only unconnected drafts in the preview list
        setGeneratedDrafts(unconnectedDrafts)
        setCompanionState('speaking')
        setEmotion('wink')
        speakText('部分未连接平台需要您手动复制发布，文案已保留在屏幕上，您可以点击复制按钮进行手动发布。')
        showToast('有部分平台需手动发布，文案已保留', 'info')
      } else {
        // All done
        setGeneratedDrafts(null)
        setPendingImages([])
        setPendingPreviews([])
        setPostIdea('')
        setCompanionState('speaking')
        setEmotion('smile')
        speakText('搞定，老板！文案已经一键发布到了所有已连接平台。')
      }

      const draftsRes = await fetch(`/api/brands/${activeBrand.id}/drafts`)
      if (draftsRes.ok) {
        const resData = await draftsRes.json()
        setDrafts(Array.isArray(resData) ? resData : resData.drafts || [])
      }
    } catch (err: any) {
      console.error(err)
      showToast(`发布失败: ${err.message}`, 'error')
    } finally {
      setIsSubmittingFinalDrafts(false)
    }
  }

  const handleSmartSchedule = async () => {
    if (!generatedDrafts || !activeBrand) return
    const selected = generatedDrafts.filter(d => d.selected)
    if (selected.length === 0) {
      showToast('请选择至少一个平台草稿进行智能排期！', 'error')
      return
    }

    setIsSubmittingFinalDrafts(true)
    showToast('正在提交草稿到后台...', 'info')

    try {
      for (const draft of selected) {
        // Create draft in database with status 'draft' and keep it there
        const createRes = await fetch(`/api/brands/${activeBrand.id}/drafts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: draft.accountId,
            caption: draft.caption,
            hashtags: draft.hashtags,
            mediaUrls: draft.mediaUrls,
            assetIds: draft.assetIds,
            status: 'draft',
            scheduledAt: draft.scheduledAt,
          })
        })
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}))
          throw new Error(err.error || '提交草稿失败')
        }
      }

      showToast('已提交草稿并加入系统排期！', 'success')
      setCompanionState('speaking')
      setEmotion('smile')
      speakText('老板，我已经把所有生成的推文草稿提交并加入系统排期了。')

      setGeneratedDrafts(null)
      setPendingImages([])
      setPendingPreviews([])
      setPostIdea('')

      const draftsRes = await fetch(`/api/brands/${activeBrand.id}/drafts`)
      if (draftsRes.ok) {
        const resData = await draftsRes.json()
        setDrafts(Array.isArray(resData) ? resData : resData.drafts || [])
      }
    } catch (err: any) {
      console.error(err)
      showToast(`保存草稿失败: ${err.message}`, 'error')
    } finally {
      setIsSubmittingFinalDrafts(false)
    }
  }

  // --- Create Instagram Post from Asset ---
  const convertAssetToPost = async (asset: MediaAsset) => {
    if (!activeBrand) return
    showToast('Creating Instagram post from asset...', 'info')
    
    try {
      const res = await fetch(`/api/brands/${activeBrand.id}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: `Indulge in our finest ${asset.aiCategory || 'delicacy'}! Made fresh daily just for you.`,
          mediaUrls: [asset.url],
          platform: 'instagram'
        })
      })

      if (res.ok) {
        const newDraft = await res.json()
        if (newDraft) {
          setDrafts(prev => [newDraft, ...prev])
        }
        showToast('Created successfully! Review it in Calendar.')
        setActiveSubPage('calendar')
      } else {
        throw new Error('API creation failed')
      }
    } catch (err) {
      // Local mockup fallback
      const mockDraft: ContentDraft = {
        id: Math.random().toString(),
        caption: `Indulge in our finest ${asset.aiCategory || 'delicacy'}! Made fresh daily just for you.`,
        mediaUrls: [asset.url],
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        status: 'draft',
        platform: 'instagram'
      }
      setDrafts(prev => [mockDraft, ...prev])
      showToast('Created local draft mock.')
    }
  }

  // --- Update Add-ons & Subscription ---
  const handleToggleAddon = async (key: 'veo3' | 'dubco') => {
    if (!activeBrand) return
    const nextAddons = { ...addons, [key]: !addons[key] }
    setAddons(nextAddons)
    setUpdatingAddons(true)

    try {
      const res = await fetch(`/api/brands/${activeBrand.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedAddons: nextAddons })
      })
      if (res.ok) {
        showToast(`${key === 'veo3' ? 'Veo3 Video API' : 'Dub.co Analytics'} subscription updated!`)
      }
    } catch (err) {
      console.error('Failed to sync subscription addon:', err)
      showToast('Toggle cached locally.')
    } finally {
      setUpdatingAddons(false)
    }
  }

  // --- Date helper for Weekly Planner ---
  const getWeekDates = () => {
    const dates = []
    const startOfWeek = new Date()
    // Go back to the nearest Friday (mockup specifies Fri 15 to Wed 20)
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(startOfWeek.getDate() + i)
      dates.push({
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dateNum: d.getDate(),
        fullDate: d
      })
    }
    return dates
  }

  const weekDates = getWeekDates()

  // --- Dynamic Calendar calculations for Brand Owner subpage ---
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate()
  const monthCells = [
    ...Array(firstDayIndex).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1)
  ]
  const monthDrafts = drafts.filter(draft => {
    if (!draft.scheduledAt) return false
    const dDraft = new Date(draft.scheduledAt)
    return dDraft.getMonth() === currentMonth && dDraft.getFullYear() === currentYear
  })
  const selectedDayDrafts = drafts.filter(draft => {
    if (!draft.scheduledAt) return false
    const dDraft = new Date(draft.scheduledAt)
    return dDraft.getDate() === selectedDay.getDate() &&
           dDraft.getMonth() === selectedDay.getMonth() &&
           dDraft.getFullYear() === selectedDay.getFullYear()
  })

  // --- Floating alert interactive actions ---
  const handleMapsAlertClick = (itemText?: string) => {
    setCompanionState('thinking')
    setMessages(prev => [
      ...prev,
      { sender: 'user', text: itemText || 'I saw the Google Maps low rating alert. What should we do?', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ])
    setTimeout(() => {
      setCompanionState('idle')
      setMessages(prev => [
        ...prev,
        { 
          sender: 'ai', 
          text: 'I detected a new review alert. I suggest we draft a polite response and set up a special campaign to balance our load and address this feedback. Would you like me to generate that post draft now?', 
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        }
      ])
    }, 1500)
  }

  const handleSuggestionClick = (text: string) => {
    setMessages(prev => [...prev, { sender: 'user', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    setCompanionState('thinking')

    setTimeout(() => {
      setCompanionState('idle')
      let reply = `I've noted that! I will apply it to optimize our next campaigns for ${activeBrand?.name}.`
      if (text.toLowerCase().includes('review') || text.toLowerCase().includes('评价')) {
        reply = 'I have analyzed the recent feedback. Guests are raving about our Xiaolongbao, but there are a few requests for vegetarian dumpling options. I can draft a campaign highlighting our vegetarian menu if you like!'
      } else if (text.toLowerCase().includes('maps') || text.toLowerCase().includes('地图')) {
        reply = "I've drafted a Google Maps update post featuring our signature dishes and high-quality photography. Would you like me to schedule it?"
      } else if (text.toLowerCase().includes('meeting') || text.toLowerCase().includes('会议') || text.toLowerCase().includes('takeaway')) {
        reply = 'Here are the top 3 marketing takeaways for our next team meeting:\n1. Truffle Risotto campaign had a 24% conversion spike.\n2. Google Maps ratings need a minor push.\n3. Video content on Xiaohongshu is outperforming images by 2x.'
      }
      setMessages(prev => [...prev, { sender: 'ai', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    }, 1500)
  }

  const triggerRandomEmotion = () => {
    if (companionState !== 'idle' || emotion !== 'normal') return
    const emotions: ('smile' | 'laugh' | 'wink' | 'excited' | 'confused')[] = ['smile', 'laugh', 'wink', 'excited', 'confused']
    const random = emotions[Math.floor(Math.random() * emotions.length)]
    setEmotion(random)
    setTimeout(() => {
      setEmotion('normal')
    }, 2200)
  }

  // --- Dynamic Eye Renderer ---
  const renderEye = (isLeft: boolean) => {
    // Determine Eyebrow animation/style
    let eyebrowRotation = 0
    let eyebrowY = 0
    if (companionState === 'thinking' || emotion === 'confused') {
      eyebrowRotation = isLeft ? 12 : -18
      eyebrowY = isLeft ? 1 : -3
    } else if (emotion === 'effort') {
      eyebrowRotation = isLeft ? -15 : 15
      eyebrowY = 2
    } else if (emotion === 'excited') {
      eyebrowY = -4
    } else if (emotion === 'laugh' || emotion === 'smile' || emotion === 'wink') {
      eyebrowY = -2
    }

    const renderEyebrow = () => (
      <motion.div
        animate={{ rotate: eyebrowRotation, y: eyebrowY }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-slate-700 dark:bg-slate-300 rounded-full"
      />
    )

    return (
      <div className="relative w-8 h-8 flex items-center justify-center">
        {renderEyebrow()}
        {/* Render Eye Core */}
        {(() => {
          if (emotion === 'effort') {
            return (
              <motion.svg 
                animate={{ scale: [1, 0.85, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                width="20" height="20" viewBox="0 0 20 20" fill="none"
              >
                <path 
                  d={isLeft ? "M14 6L6 10L14 14" : "M6 6L14 10L6 14"} 
                  stroke="currentColor" 
                  className="text-slate-700 dark:text-slate-300" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </motion.svg>
            )
          }

          if (emotion === 'laugh') {
            return (
              <motion.svg 
                animate={{ y: [0, -2, 0] }}
                transition={{ repeat: Infinity, duration: 0.6, delay: isLeft ? 0 : 0.15 }}
                width="20" height="14" viewBox="0 0 20 14" fill="none"
              >
                <path 
                  d="M3 11C5 5 15 5 17 11" 
                  stroke="currentColor" 
                  className="text-slate-700 dark:text-slate-300" 
                  strokeWidth="3.5" 
                  strokeLinecap="round"
                />
              </motion.svg>
            )
          }

          if (emotion === 'smile') {
            return (
              <motion.svg 
                animate={{ scaleY: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                width="20" height="12" viewBox="0 0 20 12" fill="none"
              >
                <path 
                  d="M3 9C5 4 15 4 17 9" 
                  stroke="currentColor" 
                  className="text-slate-700 dark:text-slate-300" 
                  strokeWidth="3" 
                  strokeLinecap="round"
                />
              </motion.svg>
            )
          }

          if (emotion === 'wink') {
            if (isLeft) {
              // Closed eye for winking
              return (
                <motion.svg 
                  animate={{ scaleY: [1, 0.8, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  width="20" height="12" viewBox="0 0 20 12" fill="none"
                >
                  <path 
                    d="M3 9C5 4 15 4 17 9" 
                    stroke="currentColor" 
                    className="text-slate-700 dark:text-slate-300" 
                    strokeWidth="3.5" 
                    strokeLinecap="round"
                  />
                </motion.svg>
              )
            } else {
              // Open starry eye for winking
              return (
                <motion.svg 
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  width="20" height="20" viewBox="0 0 20 20" fill="none"
                >
                  <circle cx="10" cy="10" r="7" fill="currentColor" className="text-slate-700 dark:text-slate-300" />
                  <path d="M10 5L11.5 8L14.5 8.5L12 10.5L13 13.5L10 11.8L7 13.5L8 10.5L5.5 8.5L8.5 8Z" fill="white" />
                </motion.svg>
              )
            }
          }

          if (emotion === 'excited') {
            return (
              <motion.svg 
                animate={{ rotate: 360, scale: [1, 1.25, 1] }}
                transition={{ 
                  rotate: { repeat: Infinity, duration: 3.5, ease: "linear" },
                  scale: { repeat: Infinity, duration: 1.2, ease: "easeInOut" }
                }}
                width="20" height="20" viewBox="0 0 20 20" fill="none"
              >
                <path d="M10 2L12.5 7L18 7.5L14 11.5L15.5 17L10 14L4.5 17L6 11.5L2 7.5L7.5 7Z" fill="currentColor" className="text-slate-700 dark:text-slate-300" />
              </motion.svg>
            )
          }

          // Blinking animation for normal/listening/thinking/speaking
          return (
            <motion.div 
              animate={
                companionState === 'listening' 
                  ? { scaleY: 1.2, scaleX: 1.1 } 
                  : companionState === 'thinking' 
                  ? { scaleY: 0.6, y: 1 } 
                  : { scaleY: [1, 1, 0.1, 1, 1] }
              }
              transition={
                companionState === 'idle' || companionState === 'speaking'
                  ? { repeat: Infinity, duration: 4.5, times: [0, 0.9, 0.95, 1, 1] }
                  : { duration: 0.3 }
              }
              className="w-4.5 h-4.5 bg-slate-700 dark:bg-slate-300 rounded-full relative overflow-hidden"
            >
              {/* Glossy pupil highlight */}
              <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 bg-white rounded-full opacity-80" />
            </motion.div>
          )
        })()}
      </div>
    )
  }

  // --- Dynamic Mouth Renderer ---
  const renderMouth = () => {
    if (companionState === 'thinking' || emotion === 'confused') {
      return (
        <motion.div 
          animate={{ scaleX: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
          className="w-8 h-2 bg-slate-700 dark:bg-slate-300 rounded-full flex items-center justify-center overflow-hidden"
        >
          <motion.div 
            animate={{ x: [-10, 10, -10] }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="w-16 h-0.5 bg-slate-500/30"
          />
        </motion.div>
      )
    }

    if (companionState === 'listening') {
      return (
        <div className="flex items-center gap-1.5 h-6">
          <motion.div 
            animate={{ height: [4, 18, 4] }}
            transition={{ repeat: Infinity, duration: 0.5, ease: "easeInOut" }}
            className="w-1.5 bg-emerald-500 rounded-full"
          />
          <motion.div 
            animate={{ height: [6, 24, 6] }}
            transition={{ repeat: Infinity, duration: 0.4, ease: "easeInOut", delay: 0.1 }}
            className="w-1.5 bg-emerald-500 rounded-full"
          />
          <motion.div 
            animate={{ height: [4, 18, 4] }}
            transition={{ repeat: Infinity, duration: 0.5, ease: "easeInOut", delay: 0.2 }}
            className="w-1.5 bg-emerald-500 rounded-full"
          />
        </div>
      )
    }

    if (companionState === 'speaking') {
      return (
        <motion.div
          animate={{ height: [6, 16, 6], scaleX: [0.9, 1.1, 0.9] }}
          transition={{ repeat: Infinity, duration: 0.25, ease: "easeInOut" }}
          className="w-8 bg-slate-700 dark:bg-slate-300 rounded-full"
        />
      )
    }

    if (emotion === 'effort') {
      return (
        <svg width="24" height="6" viewBox="0 0 24 6" fill="none">
          <line x1="2" y1="3" x2="22" y2="3" stroke="currentColor" className="text-slate-700 dark:text-slate-300" strokeWidth="4.5" strokeLinecap="round" />
        </svg>
      )
    }

    if (emotion === 'laugh' || emotion === 'excited') {
      return (
        <motion.svg 
          animate={{ scaleY: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }}
          width="36" height="18" viewBox="0 0 36 18" fill="none"
        >
          <path d="M2 2C2 12 34 12 34 2Z" fill="currentColor" className="text-slate-700 dark:text-slate-300" />
          <path d="M11 12C14 9 22 9 25 12C22 15 14 15 11 12Z" fill="#ff7a8a" />
        </motion.svg>
      )
    }

    if (emotion === 'smile' || emotion === 'wink') {
      return (
        <svg width="32" height="12" viewBox="0 0 32 12" fill="none">
          <path d="M3 2C8 9 24 9 29 2" stroke="currentColor" className="text-slate-700 dark:text-slate-300" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      )
    }

    return (
      <svg width="24" height="8" viewBox="0 0 24 8" fill="none">
        <path d="M2 2C6 6 18 6 22 2" stroke="currentColor" className="text-slate-700 dark:text-slate-300" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <div className="min-h-screen text-slate-800 bg-[#f7f9fb] selection:bg-primary/10 overflow-hidden h-screen w-screen relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        multiple 
        accept="image/*,video/*" 
        className="hidden" 
      />
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 border ${
              toast.type === 'success' 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                : toast.type === 'error' 
                ? 'bg-rose-50 border-rose-100 text-rose-800' 
                : 'bg-indigo-50 border-indigo-100 text-indigo-800'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600" />}
            {toast.type === 'info' && <Sparkles className="w-4 h-4 text-indigo-600" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>



      {/* Top App Bar */}
      <header className="fixed top-0 w-full z-40 bg-white/40 backdrop-blur-md h-16 flex items-center justify-between px-4 border-b border-slate-200/20">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-transparent">
            <img 
              src={activeBrand?.logoUrl || "/logo.svg"} 
              onError={(e) => { e.currentTarget.src = "/logo.svg" }}
              alt="logo" 
              className="w-full h-full object-contain" 
            />
          </div>
          <span className="font-bold text-sm text-slate-800 tracking-wide">
            {activeBrand ? activeBrand.name : ''}
          </span>
        </div>

        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => setNotificationsExpanded(prev => !prev)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200/50 text-slate-650 transition-all active:scale-95 cursor-pointer relative"
            title="通知消息"
          >
            <Bell className="h-5 w-5" />
            {actionItems.length > 0 && (
              <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
            )}
          </button>

          <button 
            onClick={() => setSideMenuOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200/50 text-slate-650 transition-all active:scale-95 cursor-pointer"
            title="菜单"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Expanded Accordion list dropdown */}
          <AnimatePresence>
            {notificationsExpanded && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute right-0 top-12 w-80 bg-white/95 backdrop-blur-lg border border-slate-200/50 rounded-2xl p-4 shadow-xl space-y-3 z-50 text-left"
              >
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">通知与待办项目</span>
                  <button 
                    onClick={() => setNotificationsExpanded(false)}
                    className="text-[10px] font-bold text-primary flex items-center gap-0.5 hover:underline cursor-pointer"
                  >
                    <span>折叠</span>
                    <ChevronUp className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {actionItems.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">暂无新消息</p>
                  ) : (
                    actionItems.map(item => (
                      <div 
                        key={item.id}
                        onClick={() => {
                          if (item.type === 'sentiment_alert') {
                            handleMapsAlertClick(item.title)
                          } else if (item.type === 'content_draft' || item.type === 'content_approval') {
                            setActiveSubPage('calendar')
                          }
                          setNotificationsExpanded(false)
                        }}
                        className={`flex items-start justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
                          item.priority === 'urgent' || item.type === 'sentiment_alert'
                            ? 'border-rose-100 bg-rose-50/20 hover:bg-rose-50/40' 
                            : 'border-indigo-50 bg-indigo-50/20 hover:bg-indigo-50/40'
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`p-2 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            item.priority === 'urgent' || item.type === 'sentiment_alert'
                              ? 'bg-rose-50 text-rose-500'
                              : 'bg-indigo-50 text-primary'
                          }`}>
                            {item.type === 'sentiment_alert' ? (
                              <MapPin className="w-4 h-4" />
                            ) : (
                              <CalendarIcon className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${
                              item.priority === 'urgent' || item.type === 'sentiment_alert'
                                ? 'text-rose-500'
                                : 'text-primary'
                            }`}>
                              {item.priority === 'urgent' ? '紧急' : item.type === 'sentiment_alert' ? '警报' : '日程'}
                            </h4>
                            <p className="text-[11px] leading-snug text-slate-800 font-bold truncate">{item.title || '待办项目'}</p>
                            <p className="text-[9px] text-slate-400 font-medium leading-tight mt-0.5">{item.description}</p>
                          </div>
                        </div>
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (activeBrand?.id) {
                              await fetch(`/api/brands/${activeBrand.id}/actions/${item.id}/approve`, { 
                                method: 'PATCH', 
                                headers: { 'Content-Type': 'application/json' }, 
                                body: '{}' 
                              })
                              setActionItems(prev => prev.filter(x => x.id !== item.id))
                            }
                          }}
                          className="text-slate-450 hover:text-emerald-500 p-1 cursor-pointer flex items-center justify-center ml-2 flex-shrink-0 transition-colors"
                          title="标记为已处理"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Main Content Area - Companion Chat interface */}
      {activeSubPage === null && (
        <main className="relative z-10 h-full flex flex-col pt-16 pb-safe">
          
          {/* Top Info Banner for completed notifications */}
          {completedNotification && (
            <div className="px-4 pt-4 flex justify-center z-20 pointer-events-auto">
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm bg-indigo-50 border border-indigo-100 rounded-3xl p-3 shadow-md flex items-start gap-2.5"
              >
                <div className="bg-primary/10 text-primary p-2 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-black text-slate-800">批量内容创作已完成</h4>
                  <p className="text-[10px] text-slate-500 font-semibold leading-relaxed mt-0.5">
                    我已为您生成了所有社交平台的内容草稿，并已将其加入到您的系统发布排期中。
                  </p>
                  <button 
                    onClick={() => {
                      setActiveSubPage('calendar')
                      setCompletedNotification(false)
                    }}
                    className="text-[10px] text-primary font-extrabold hover:underline mt-2 flex items-center gap-0.5 cursor-pointer"
                  >
                    去发布日历中查看 <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <button 
                  onClick={() => setCompletedNotification(false)}
                  className="text-slate-400 hover:text-slate-650 p-1 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            </div>
          )}

          {/* Center Space: Either show the Companion Face or show the pending previews grid */}
          <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-4 overflow-y-auto no-scrollbar w-full">
            {generatedDrafts ? (
              /* Inline Swipeable Generated Draft Previews */
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-4xl flex flex-col gap-4 pointer-events-auto"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 flex-shrink-0">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                      AI 创作预览 (左右滑动查看全部)
                    </h3>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                      为您生成的多平台推文，已默认全部勾选。
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setGeneratedDrafts(null)
                      setShowSchedulePicker(false)
                    }}
                    className="text-[10px] text-rose-500 hover:text-rose-600 font-extrabold flex items-center gap-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" /> 清除重试
                  </button>
                </div>

                {/* Swipeable Viewport */}
                <div className="w-full flex gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-none px-4 py-2 scroll-smooth">
                  {generatedDrafts.map((draft, idx) => {
                    const isVid = draft.mediaUrls && draft.mediaUrls.length > 0 && /\.(mp4|mov|avi|webm|ogg|m4v|3gp)(?:\?.*)?$/i.test(draft.mediaUrls[0].split('?')[0]);
                    const isConnected = draft.isConnected !== false;
                    return (
                      <div
                        key={idx}
                        className={`flex-shrink-0 w-80 md:w-[350px] snap-center rounded-2xl bg-white border transition-all p-4 flex flex-col justify-between gap-3 shadow-md ${
                          draft.selected
                            ? 'border-emerald-500 ring-2 ring-emerald-500/10'
                            : 'border-slate-200 opacity-60'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-wide uppercase ${
                              draft.platform === 'instagram'
                                ? 'bg-pink-50 text-pink-650'
                                : draft.platform === 'xiaohongshu'
                                ? 'bg-rose-50 text-rose-600'
                                : draft.platform === 'facebook'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-slate-100 text-slate-650'
                            }`}>
                              {draft.platform === 'instagram' ? 'Instagram' : draft.platform === 'xiaohongshu' ? '小红书 / Rednote' : draft.platform === 'facebook' ? 'Facebook' : draft.platform}
                            </span>
                            
                            {/* Connection Badge */}
                            {isConnected ? (
                              <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 font-extrabold bg-emerald-50/50 px-1.5 py-0.5 rounded-md">
                                <span className="w-1 h-1 bg-emerald-500 rounded-full" /> 已连接
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-[9px] text-amber-600 font-extrabold bg-amber-50/50 px-1.5 py-0.5 rounded-md">
                                <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" /> 需手动发布
                              </span>
                            )}
                          </div>

                          <input
                            type="checkbox"
                            checked={!!draft.selected}
                            onChange={(e) => {
                              setGeneratedDrafts(prev => {
                                if (!prev) return null
                                const next = [...prev]
                                next[idx] = { ...next[idx], selected: e.target.checked }
                                return next
                              })
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </div>

                        {/* Media preview */}
                        {draft.mediaUrls && draft.mediaUrls.length > 0 && (
                          <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100 border border-slate-200/40">
                            {isVid ? (
                              <video src={draft.mediaUrls[0]} className="w-full h-full object-cover" muted controls />
                            ) : (
                              <img src={draft.mediaUrls[0]} alt="media" className="w-full h-full object-cover" />
                            )}
                            {draft.mediaUrls.length > 1 && (
                              <span className="absolute bottom-2 right-2 bg-slate-950/60 text-white text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
                                +{draft.mediaUrls.length - 1} 张图片
                              </span>
                            )}
                          </div>
                        )}

                        {/* Content description */}
                        <div className="space-y-1.5 flex-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide">
                            正文文案
                          </label>
                          <textarea
                            value={draft.caption}
                            onChange={(e) => {
                              setGeneratedDrafts(prev => {
                                if (!prev) return null
                                const next = [...prev]
                                next[idx] = { ...next[idx], caption: e.target.value }
                                return next
                              })
                            }}
                            rows={3}
                            className="w-full text-[11px] p-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-500/50 resize-none font-semibold text-slate-700 leading-relaxed scrollbar-thin"
                          />
                        </div>

                        {/* Hashtags input */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide">
                            Hashtags
                          </label>
                          <input
                            type="text"
                            value={draft.hashtags.join(', ')}
                            onChange={(e) => {
                              setGeneratedDrafts(prev => {
                                if (!prev) return null
                                const next = [...prev]
                                next[idx] = { ...next[idx], hashtags: e.target.value.split(',').map(h => h.trim()).filter(Boolean) }
                                return next
                              })
                            }}
                            className="w-full text-[11px] px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-500/50 font-semibold text-slate-650"
                            placeholder="标签以逗号分隔，例如: tag1, tag2"
                          />
                        </div>

                        {/* Manual Copy Button */}
                        {!isConnected && (
                          <div className="mt-1 flex flex-col gap-1 p-2 rounded-xl bg-amber-50/50 border border-amber-100/50">
                            <p className="text-[9px] font-bold text-amber-700 leading-snug">
                              💡 此平台尚未连接，请在发布后复制文案手动发布。
                            </p>
                            <button
                              onClick={() => {
                                const textToCopy = `${draft.caption}\n\n${draft.hashtags.map((h: string) => `#${h}`).join(' ')}`
                                navigator.clipboard.writeText(textToCopy)
                                showToast('文案与标签已复制！', 'success')
                              }}
                              className="flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black py-1 px-2.5 rounded-lg active:scale-95 transition-all cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" /> 复制手动发布文案
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Footer Buttons */}
                <div className="flex flex-col gap-3 px-4 pt-2 border-t border-slate-100 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">
                      已选: <span className="text-slate-800 font-extrabold">{generatedDrafts.filter(d => d.selected).length}</span> / {generatedDrafts.length} 个推文
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setGeneratedDrafts(null)
                        setShowSchedulePicker(false)
                      }}
                      disabled={isSubmittingFinalDrafts}
                      className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSmartSchedule}
                      disabled={isSubmittingFinalDrafts}
                      className="flex-1 py-2.5 bg-indigo-50 border border-indigo-100 text-primary hover:bg-indigo-100/50 rounded-xl text-xs font-black shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      智能排期
                    </button>
                    <button
                      onClick={handleDirectPublish}
                      disabled={isSubmittingFinalDrafts}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/10 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingFinalDrafts ? '发布中...' : '直接发布'}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : pendingPreviews.length > 0 ? (
              /* Pending Image Previews Grid + Creative Input form */
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-sm bg-white/95 border border-slate-200/50 rounded-3xl p-4 shadow-xl backdrop-blur-md space-y-4 z-20 pointer-events-auto flex flex-col max-h-[90%] overflow-y-auto"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    {pendingImages[0]?.type.startsWith('video/') ? '已选视频 (1/1)' : `已选图片 (${pendingPreviews.length}/9)`}
                  </span>
                  <button 
                    onClick={() => {
                      setPendingImages([])
                      setPendingPreviews([])
                      setPostIdea('')
                    }}
                    className="text-slate-400 hover:text-slate-650 p-1 cursor-pointer flex items-center justify-center"
                    title="清除所有媒体"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Previews thumbnail grid */}
                <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-36 p-1 scrollbar-thin">
                  {pendingPreviews.map((url, i) => {
                    const isVid = pendingImages[i]?.type.startsWith('video/')
                    return (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 bg-slate-50 shadow-sm">
                        {isVid ? (
                          <video src={url} className="w-full h-full object-cover" muted playsInline />
                        ) : (
                          <img src={url} alt={`preview-${i}`} className="w-full h-full object-cover" />
                        )}
                        <button
                          onClick={() => {
                            setPendingPreviews(prev => prev.filter((_, idx) => idx !== i))
                            setPendingImages(prev => prev.filter((_, idx) => idx !== i))
                          }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/60 text-white flex items-center justify-center hover:bg-slate-900 active:scale-95 transition-all cursor-pointer shadow-sm"
                          title="移除媒体"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* Theme/Idea creative prompt textarea */}
                <div className="space-y-1.5 flex-1 flex flex-col">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">
                    发帖主题或创意指令：
                  </label>
                  <textarea
                    value={postIdea}
                    onChange={(e) => setPostIdea(e.target.value)}
                    placeholder="输入发帖的想法（例如：‘展示新招牌牛肉汉堡，突出多汁松软’）。或直接点击下方麦克风进行语音输入！"
                    rows={3}
                    className="w-full text-xs p-3 rounded-2xl bg-slate-50 border border-slate-200/80 focus:border-primary/50 focus:outline-none resize-none leading-relaxed transition-colors font-semibold text-slate-700 flex-1 min-h-[60px]"
                  />
                </div>

                {/* Control Action Buttons */}
                <div className="flex gap-2.5">
                  <button
                    onClick={() => {
                      setPendingImages([])
                      setPendingPreviews([])
                      setPostIdea('')
                    }}
                    className="flex-1 bg-slate-100 hover:bg-slate-250/70 text-slate-650 font-extrabold py-2.5 rounded-2xl text-xs active:scale-95 transition-all cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleBulkSubmit()}
                    disabled={generatingBulk}
                    className="flex-1 bg-primary hover:bg-indigo-tint text-white font-extrabold py-2.5 rounded-2xl text-xs active:scale-95 transition-all flex items-center justify-center gap-1 shadow-md shadow-primary/20 cursor-pointer disabled:opacity-50"
                  >
                    {generatingBulk ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        正在创作...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        开始创作
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              /* Centered Voice Companion Visual Interface */
              <div className="flex flex-col items-center justify-center pointer-events-none">
                {/* Dynamic halo/aura layer */}
                <div className="relative flex items-center justify-center w-64 h-64">
                  <AnimatePresence>
                    {companionState === 'listening' && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: [0.15, 0.3, 0.15], scale: [1, 1.35, 1] }}
                        exit={{ opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl"
                      />
                    )}
                    {companionState === 'thinking' && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: [0.1, 0.25, 0.1], scale: [1, 1.2, 1] }}
                        exit={{ opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl"
                      />
                    )}
                    {emotion === 'effort' && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.3, 1] }}
                        exit={{ opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                        className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl"
                      />
                    )}
                    {companionState === 'speaking' && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: [0.15, 0.35, 0.15], scale: [1, 1.45, 1] }}
                        exit={{ opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                        className="absolute inset-0 rounded-full bg-indigo-tint/20 blur-xl"
                      />
                    )}
                  </AnimatePresence>

                  {/* Face base container */}
                  <motion.div 
                    animate={{ y: [0, -6, 0] }}
                    transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
                    onClick={triggerRandomEmotion}
                    className="w-48 h-48 flex flex-col items-center justify-center gap-5 relative z-10 cursor-pointer pointer-events-auto"
                    title="点击我试试！"
                  >
                    {/* Sweating drop for effort emotion */}
                    {emotion === 'effort' && (
                      <motion.div 
                        animate={{ y: [0, 6, 0], opacity: [1, 0, 1] }} 
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeIn" }}
                        className="absolute top-8 right-10 text-xl pointer-events-none"
                      >
                        💧
                      </motion.div>
                    )}

                    {/* Sparkles / Joy stars when laughing or excited */}
                    {(emotion === 'laugh' || emotion === 'excited') && (
                      <>
                        <motion.div 
                          animate={{ scale: [1, 1.3, 1], rotate: [0, 45, 0] }} 
                          transition={{ repeat: Infinity, duration: 1.2 }}
                          className="absolute top-6 left-8 text-amber-400 text-sm pointer-events-none"
                        >
                          ⭐
                        </motion.div>
                        <motion.div 
                          animate={{ scale: [1, 1.3, 1], rotate: [0, -45, 0] }} 
                          transition={{ repeat: Infinity, duration: 1.2, delay: 0.3 }}
                          className="absolute top-10 right-6 text-amber-400 text-xs pointer-events-none"
                        >
                          ✨
                        </motion.div>
                      </>
                    )}

                    {/* Question Marks when confused / thinking */}
                    {(companionState === 'thinking' || emotion === 'confused') && (
                      <motion.div 
                        animate={{ y: [0, -3, 0], opacity: [0.6, 1, 0.6] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        className="absolute -top-1 left-24 text-slate-400 text-sm font-extrabold pointer-events-none"
                      >
                        ❓
                      </motion.div>
                    )}

                    {/* Blush cheeks */}
                    {(emotion === 'smile' || emotion === 'laugh' || emotion === 'wink' || emotion === 'excited') && (
                      <div className="absolute top-[88px] w-24 flex justify-between px-1 pointer-events-none">
                        <motion.div 
                          animate={{ opacity: [0.4, 0.7, 0.4] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                          className="w-4 h-2 bg-rose-300/40 rounded-full filter blur-[1px]" 
                        />
                        <motion.div 
                          animate={{ opacity: [0.4, 0.7, 0.4] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 0.3 }}
                          className="w-4 h-2 bg-rose-300/40 rounded-full filter blur-[1px]" 
                        />
                      </div>
                    )}

                    {/* Eyes Row */}
                    <div className="flex justify-between w-20 px-2 mt-2">
                      {renderEye(true)}
                      {renderEye(false)}
                    </div>

                    {/* Mouth Row */}
                    <div className="h-10 flex items-center justify-center">
                      {renderMouth()}
                    </div>
                  </motion.div>
                </div>

                {/* Subtitles text display */}
                <div className="text-center mt-6 space-y-1">
                  <h3 className="text-sm font-extrabold text-slate-700">
                    {companionState === 'listening' ? '正在倾听您的意见...' :
                     companionState === 'thinking' ? '正在思考与组织语言...' :
                     companionState === 'speaking' ? '正在语音回复中...' :
                     emotion === 'effort' ? '正在努力为您生成推文...' :
                     'AI内容运营官'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-semibold px-8 leading-relaxed max-w-xs mx-auto">
                    {companionState === 'listening' ? '您可以说：“帮我做个关于周末促销的活动文案”' :
                     companionState === 'thinking' ? '正在调用平台数据与创意模型...' :
                     companionState === 'speaking' ? '正在用语音为您播报创作成果...' :
                     emotion === 'effort' ? '已开始处理！正在为您排期并发布内容...' :
                     '上传素材，点击下方麦克风说出您的创意想法，开始批量创作。'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Console (Voice button & Upload triggers) */}
          <div className="px-6 pb-10 pt-4 bg-gradient-to-t from-[#f7f9fb] via-[#f7f9fb]/90 to-transparent flex flex-col items-center z-20 pointer-events-auto">
            
            {/* Voice Assistant Panel */}
            <div className="w-full max-w-sm flex items-center justify-between gap-6 px-4">
              {/* Left Column: Upload button */}
              <button 
                type="button"
                onClick={handleUploadClick}
                disabled={uploading || generatingBulk}
                className="w-12 h-12 rounded-full bg-white border border-slate-200/80 shadow-md flex items-center justify-center text-slate-400 hover:text-slate-650 hover:bg-slate-50 transition-all active:scale-95 cursor-pointer flex-shrink-0"
                title="上传图片开始批量排期发帖"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
 
              {/* Center Column: Voice assistant mic button with green intercom design */}
              <div className="flex flex-col items-center gap-2.5 flex-1 relative">
                {/* 3D and glowing rings container */}
                <div className="relative flex items-center justify-center">
                  {/* Animated ripple sound waves (active when listening/speaking) */}
                  {companionState === 'listening' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      {[1, 2, 3].map((idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0.6, scale: 1 }}
                          animate={{ opacity: 0, scale: 2.2 }}
                          transition={{
                            repeat: Infinity,
                            duration: 1.5,
                            delay: idx * 0.4,
                            ease: "easeOut",
                          }}
                          className="absolute w-16 h-16 rounded-full border-2 border-emerald-500/30 pointer-events-none"
                        />
                      ))}
                    </div>
                  )}
                  
                  {companionState === 'speaking' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      {[1, 2].map((idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0.5, scale: 1 }}
                          animate={{ opacity: 0, scale: 1.8 }}
                          transition={{
                            repeat: Infinity,
                            duration: 1.8,
                            delay: idx * 0.6,
                            ease: "easeOut",
                          }}
                          className="absolute w-16 h-16 rounded-full border border-teal-500/25 pointer-events-none"
                        />
                      ))}
                    </div>
                  )}

                  {/* Physical Bezel ring */}
                  <div className="absolute w-[72px] h-[72px] rounded-full border border-slate-200/10 bg-slate-100/40 backdrop-blur-sm shadow-inner pointer-events-none" />

                  {/* Main tactile push button */}
                  <button 
                    type="button"
                    onClick={startVoiceAssist}
                    disabled={generatingBulk}
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl active:scale-95 active:shadow-md transition-all duration-300 cursor-pointer relative z-10 border border-emerald-400/20 ${
                      companionState === 'listening'
                        ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-emerald-500/40 scale-105'
                        : companionState === 'thinking'
                        ? 'bg-gradient-to-tr from-emerald-500 to-emerald-400 shadow-emerald-400/20 animate-pulse'
                        : companionState === 'speaking'
                        ? 'bg-gradient-to-tr from-teal-500 to-emerald-500 shadow-teal-500/30'
                        : 'bg-gradient-to-tr from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 shadow-emerald-500/20'
                    }`}
                  >
                    {companionState === 'listening' ? (
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                        className="flex items-center justify-center"
                      >
                        <Mic className="w-6 h-6 text-white drop-shadow" />
                      </motion.div>
                    ) : companionState === 'thinking' ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-white" />
                    ) : (
                      <Mic className="w-6 h-6 text-white drop-shadow" />
                    )}
                  </button>
                </div>

                {/* WeChat-style Intercom Status Pill */}
                <motion.div 
                  animate={companionState === 'listening' ? { scale: [1, 1.03, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wide uppercase text-center mt-1 border transition-all duration-300 ${
                    companionState === 'listening'
                      ? 'bg-emerald-100 border-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-800 dark:text-emerald-300 font-extrabold shadow-sm'
                      : companionState === 'thinking'
                      ? 'bg-amber-100 border-amber-200 text-amber-800 dark:bg-amber-950/80 dark:border-amber-800 dark:text-amber-300'
                      : companionState === 'speaking'
                      ? 'bg-teal-100 border-teal-200 text-teal-800 dark:bg-teal-950/80 dark:border-teal-800 dark:text-teal-300'
                      : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200/50 hover:text-slate-650'
                  }`}
                >
                  {companionState === 'listening' ? '正在对讲 (倾听中)...' : 
                   companionState === 'thinking' ? '正在对讲 (思考中)...' : 
                   companionState === 'speaking' ? '正在对讲 (回答中)...' : 
                   '按键开始对讲'}
                </motion.div>
              </div>
 
              {/* Right Column: Balanced empty space spacer */}
              <div className="w-12 h-12 flex-shrink-0" />
            </div>
 
          </div>
        </main>
      )}

      {/* Sub-page overlay views */}
      {activeSubPage !== null && (
        <div className="fixed inset-0 z-50 bg-[#f7f9fb] overflow-y-auto pb-10 flex flex-col">
          {/* Subpage Header */}
          <header className="sticky top-0 w-full z-40 bg-[#f7f9fb]/90 backdrop-blur-md shadow-sm h-16 flex items-center justify-between px-4 border-b border-slate-200/50">
            <button 
              onClick={() => setActiveSubPage(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/50 active:scale-95 transition-all"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              <span>Back to Chat</span>
            </button>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              {activeSubPage === 'calendar' && 'Campaign Calendar'}
              {activeSubPage === 'assets' && 'Media Library'}
              {activeSubPage === 'market' && 'Add-on Marketplace'}
              {activeSubPage === 'settings' && 'AI Character Settings'}
            </h2>
            <div className="w-20" /> {/* Spacer */}
          </header>

          <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-6">
            {activeSubPage === 'calendar' && (
              <>
                {/* Campaign Calendar */}
                <section className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                    {now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h3>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 mb-2">
                    <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {monthCells.map((day, idx) => {
                      if (day === null) {
                        return <div key={`empty-${idx}`} className="h-11" />
                      }

                      const cellDate = new Date(currentYear, currentMonth, day)
                      const isToday = day === now.getDate() && currentMonth === now.getMonth() && currentYear === now.getFullYear()
                      const isSelected = selectedDay.getDate() === day &&
                                         selectedDay.getMonth() === currentMonth &&
                                         selectedDay.getFullYear() === currentYear

                      const hasDraft = drafts.some(draft => {
                        if (!draft.scheduledAt) return false
                        const dDraft = new Date(draft.scheduledAt)
                        return dDraft.getDate() === day &&
                               dDraft.getMonth() === currentMonth &&
                               dDraft.getFullYear() === currentYear
                      })

                      return (
                        <button
                          key={day}
                          onClick={() => setSelectedDay(cellDate)}
                          className={`h-11 rounded-lg flex flex-col items-center justify-between p-1 text-[11px] transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-primary text-white font-bold shadow-md shadow-primary/20 scale-105'
                              : isToday
                                ? 'bg-indigo-50 border border-primary/30 text-primary font-bold'
                                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>{day}</span>
                          {hasDraft && (
                            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-400'}`} />
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <div className="pt-4 border-t border-slate-100 space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                    <p className="text-xs font-bold text-slate-400">Scheduled Posts This Month</p>
                    {monthDrafts.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-400 italic">
                        No campaign posts scheduled for this month.
                      </div>
                    ) : (
                      monthDrafts.map(draft => (
                        <div key={draft.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs mb-1.5 last:mb-0">
                          <span className="font-medium text-slate-700 truncate max-w-[200px]">{draft.caption || 'Campaign Post'}</span>
                          <span className="text-[10px] text-slate-400 font-semibold uppercase">
                            {new Date(draft.scheduledAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* Weekly Planner Feed */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">Weekly Planner</h3>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(Date.now() + 6*24*60*60*1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-4">
                    {/* Horizontal days slider */}
                    <div className="flex justify-between overflow-x-auto gap-2 no-scrollbar">
                      {weekDates.map(day => {
                        const isSelected = selectedDay.getDate() === day.fullDate.getDate() &&
                                           selectedDay.getMonth() === day.fullDate.getMonth() &&
                                           selectedDay.getFullYear() === day.fullDate.getFullYear()
                        return (
                          <button
                            key={day.dateNum}
                            onClick={() => setSelectedDay(day.fullDate)}
                            className={`flex flex-col items-center gap-1.5 px-3.5 py-2.5 rounded-xl transition-all ${
                              isSelected
                                ? 'bg-primary text-white shadow-md shadow-primary/20 scale-105'
                                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            <span className="text-[9px] font-extrabold uppercase opacity-80">{day.dayName}</span>
                            <span className="text-sm font-black">{day.dateNum}</span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Action Items List */}
                    <div className="space-y-2">
                      {selectedDayDrafts.length === 0 ? (
                        <div className="text-center py-6 text-xs text-slate-400 italic">
                          No campaign posts scheduled for this day.
                        </div>
                      ) : (
                        selectedDayDrafts.map(draft => (
                          <div 
                            key={draft.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-primary">
                                <Sparkles className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{draft.caption || 'Weekly Feast Special'}</h4>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase">{draft.platform} • Scheduled</p>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-tight ${
                              draft.status === 'published' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {draft.status === 'published' ? 'Published' : 'Pending Review'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeSubPage === 'assets' && (
              <>
                {/* Quick Assets */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">Quick Upload</h3>
                  </div>

                  {/* Upload Pill */}
                  <button 
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className="w-full bg-white border-dashed border-2 border-primary/20 hover:border-primary/40 p-4 rounded-2xl flex items-center justify-center gap-3 transition-colors active:bg-slate-50/60 cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <Plus className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-700">
                      {uploading ? 'Processing File...' : 'Upload Fresh Dish Photos'}
                    </span>
                  </button>

                  {/* Horizontally scrolling uploaded assets */}
                  <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                    {assets.length === 0 ? (
                      <div className="w-full text-center py-6 text-xs text-slate-400 italic">
                        No recent photo assets. Upload some above!
                      </div>
                    ) : (
                      assets.map(asset => (
                        <div key={asset.id} className="flex-shrink-0 w-44 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm flex flex-col justify-between">
                          <div className="relative h-40 w-full bg-slate-50">
                            <img 
                              src={asset.url} 
                              alt={asset.filename || 'Uploaded asset'} 
                              className="w-full h-full object-cover"
                            />
                            {asset.aiCategory && (
                              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[9px] bg-slate-900/70 text-white font-semibold backdrop-blur-sm">
                                {asset.aiCategory}
                              </span>
                            )}
                          </div>
                          <div className="p-2 border-t border-slate-50">
                            <button 
                              onClick={() => convertAssetToPost(asset)}
                              className="w-full bg-primary text-white py-1.5 rounded-xl text-[10px] font-bold active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3 text-amber-300" />
                              To Instagram Post
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* Media Library */}
                <section className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">Media Library Grid</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {assets.length === 0 ? (
                      <div className="col-span-2 text-center py-10 text-xs text-slate-400 italic">
                        No assets in library. Upload files.
                      </div>
                    ) : (
                      assets.map(asset => (
                        <div key={asset.id} className="border border-slate-100 rounded-xl overflow-hidden shadow-sm flex flex-col bg-slate-50 group relative">
                          <div className="h-32 w-full bg-slate-100">
                            <img 
                              src={asset.url} 
                              alt={asset.filename || 'Media Library asset'} 
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="p-2 bg-white flex flex-col justify-between flex-1">
                            <p className="text-[10px] text-slate-500 truncate mb-2">{asset.filename || 'Untitled Asset'}</p>
                            <button 
                              onClick={() => convertAssetToPost(asset)}
                              className="w-full bg-primary/10 hover:bg-primary/20 text-primary py-1.5 rounded-lg text-[9px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" /> Create Post
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </>
            )}

            {activeSubPage === 'market' && (
              <>
                {/* Standard Package Card */}
                <div className="bg-primary p-6 rounded-2xl text-white relative overflow-hidden shadow-lg shadow-primary/20">
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-full text-white uppercase tracking-wider mb-1.5 inline-block font-bold">Current Plan</span>
                        <h2 className="text-xl font-bold">Standard Package</h2>
                      </div>
                      <ShieldCheck className="w-8 h-8 opacity-75" />
                    </div>
                    
                    <div className="space-y-3 mt-6">
                      {/* Veo3 Toggle */}
                      <div className="flex items-center justify-between bg-white/10 p-3 rounded-xl backdrop-blur-md">
                        <div className="flex items-center gap-3">
                          <Video className="w-5 h-5" />
                          <div>
                            <span className="text-xs font-semibold block">Veo3 Image-to-Video</span>
                            <span className="text-[9px] text-white/60">Generate high quality marketing reels</span>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={addons.veo3} 
                            onChange={() => handleToggleAddon('veo3')}
                            className="sr-only peer" 
                            disabled={updatingAddons}
                          />
                          <div className="w-9 h-5 bg-white/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      {/* Dub.co Toggle */}
                      <div className="flex items-center justify-between bg-white/10 p-3 rounded-xl backdrop-blur-md">
                        <div className="flex items-center gap-3">
                          <Link className="w-5 h-5" />
                          <div>
                            <span className="text-xs font-semibold block">Dub.co ROI tracking</span>
                            <span className="text-[9px] text-white/60">Short-link analytics for conversions</span>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={addons.dubco} 
                            onChange={() => handleToggleAddon('dubco')}
                            className="sr-only peer" 
                            disabled={updatingAddons}
                          />
                          <div className="w-9 h-5 bg-white/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
                </div>

                {/* Marketplace Add-ons */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">Add-on Services Marketplace</h3>
                  
                  <div className="divide-y divide-slate-100">
                    <div className="py-3 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-slate-700">Custom Domain Mapping</p>
                        <p className="text-[10px] text-slate-400">Map your own custom short domains</p>
                      </div>
                      <button className="bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg font-bold cursor-pointer">
                        $9/mo
                      </button>
                    </div>
                    <div className="py-3 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-slate-700">Xiaohongshu Publisher API</p>
                        <p className="text-[10px] text-slate-400">Direct automated push publishing</p>
                      </div>
                      <button className="bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg font-bold cursor-pointer">
                        $19/mo
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeSubPage === 'settings' && (
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-800">Brand Character Settings</h3>
                <p className="text-xs text-slate-400">
                  Teach the AI companion about your store tone, menu items, and target slang dictionary.
                </p>
                
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Brand Voice Style</label>
                    <textarea 
                      value={brandTone}
                      onChange={e => setBrandTone(e.target.value)}
                      placeholder="A casual, engaging restaurant tone using local Singlish slang."
                      rows={3}
                      className="w-full text-xs p-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Local Slang Dictionary</label>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                      {Object.keys(slangDict).length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">No slang terms configured. Add one below!</p>
                      ) : (
                        Object.entries(slangDict).map(([term, definition]) => (
                          <div key={term} className="flex justify-between items-center border-b border-slate-200/60 pb-1.5 last:border-0 last:pb-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-700">"{term}"</span>
                              <span className="text-slate-400">→</span>
                              <span className="text-slate-600">{definition}</span>
                            </div>
                            <button 
                              onClick={() => {
                                const nextDict = { ...slangDict }
                                delete nextDict[term]
                                setSlangDict(nextDict)
                              }}
                              className="text-slate-400 hover:text-rose-500 transition-colors p-0.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    
                    {/* Add slang inline form */}
                    <div className="flex gap-2 mt-2">
                      <input 
                        type="text" 
                        placeholder="Slang term (e.g., Bojio)" 
                        id="new-slang-term"
                        className="flex-1 text-[11px] p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <input 
                        type="text" 
                        placeholder="Meaning (e.g., Don't invite)" 
                        id="new-slang-meaning"
                        className="flex-1 text-[11px] p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button 
                        onClick={() => {
                          const termInput = document.getElementById('new-slang-term') as HTMLInputElement
                          const meaningInput = document.getElementById('new-slang-meaning') as HTMLInputElement
                          const term = termInput?.value?.trim()
                          const meaning = meaningInput?.value?.trim()
                          if (term && meaning) {
                            setSlangDict(prev => ({ ...prev, [term]: meaning }))
                            termInput.value = ''
                            meaningInput.value = ''
                          }
                        }}
                        className="px-2 bg-primary text-white rounded-lg flex items-center justify-center hover:bg-indigo-tint transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={async () => {
                    if (!activeBrand) return
                    try {
                      const res = await fetch(`/api/brands/${activeBrand.id}/knowledge`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ brandTone, slangDict })
                      })
                      if (res.ok) {
                        showToast('Brand voice and slang settings saved!')
                        setActiveSubPage(null)
                      } else {
                        showToast('Failed to save settings', 'error')
                      }
                    } catch (err) {
                      console.error('Save knowledge settings failed:', err)
                      showToast('Network error saving settings', 'error')
                    }
                  }}
                  className="w-full bg-primary text-white py-2.5 rounded-xl text-xs font-bold shadow-md shadow-primary/20 active:scale-95 transition-all mt-4 cursor-pointer"
                >
                  Save AI Instructions
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Side Menu Drawer */}
      <AnimatePresence>
        {sideMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSideMenuOpen(false)}
              className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            />
            {/* Drawer */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-[280px] bg-[#f7f9fb] shadow-2xl z-50 flex flex-col p-8 border-l border-slate-200/50"
            >
              <div className="flex justify-between items-center mb-10">
                <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-transparent">
                  <img 
                    src={activeBrand?.logoUrl || "/logo.svg"} 
                    onError={(e) => { e.currentTarget.src = "/logo.svg" }}
                    alt="logo" 
                    className="w-full h-full object-contain" 
                  />
                </div>
                <button 
                  onClick={() => setSideMenuOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Brand Switcher / Info inside Drawer Menu */}
              <div className="mb-6 border-b border-slate-200/50 pb-6">
                <div className="relative">
                  <button 
                    onClick={() => setBrandDropdownOpen(prev => !prev)}
                    className="w-full flex items-center justify-between p-3 bg-white border border-slate-200/60 rounded-xl text-left hover:bg-slate-50 transition-all cursor-pointer outline-none"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary overflow-hidden flex items-center justify-center text-white flex-shrink-0">
                        {activeBrand?.logoUrl ? (
                          <img 
                            src={activeBrand.logoUrl} 
                            onError={(e) => { e.currentTarget.src = "/logo.svg" }}
                            alt="logo" 
                            className="w-full h-full object-contain" 
                          />
                        ) : (
                          <Utensils className="w-4.5 h-4.5 text-white" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-xs text-slate-800 truncate">
                          {activeBrand ? activeBrand.name : (loading ? 'Loading Brand...' : '暂无品牌')}
                        </span>
                        {activeBrand?.autoPilot && (
                          <span className="text-[9px] text-emerald-500 font-bold truncate">
                            AI Auto-Pilot
                          </span>
                        )}
                      </div>
                    </div>
                    {brands.length > 1 && (
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${brandDropdownOpen ? 'rotate-180' : ''}`} />
                    )}
                  </button>
 
                  {/* Dropdown Menu */}
                  <AnimatePresence>
                    {brandDropdownOpen && brands.length > 1 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-slate-200/60 overflow-hidden z-50 max-h-48 overflow-y-auto"
                      >
                        {brands.map(b => (
                          <button
                            key={b.id}
                            onClick={() => {
                              setActiveBrand(b)
                              setBrandDropdownOpen(false)
                            }}
                            className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors ${
                              activeBrand?.id === b.id ? 'bg-indigo-50/50 text-primary font-bold' : 'text-slate-600'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded bg-primary/10 overflow-hidden flex items-center justify-center text-primary flex-shrink-0">
                                {b.logoUrl ? (
                                  <img 
                                    src={b.logoUrl} 
                                    onError={(e) => { e.currentTarget.src = "/logo.svg" }}
                                    alt="logo" 
                                    className="w-full h-full object-contain" 
                                  />
                                ) : (
                                  <Utensils className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <span className="truncate">{b.name}</span>
                            </div>
                            {activeBrand?.id === b.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <nav className="space-y-6">
                <button 
                  onClick={() => {
                    setActiveSubPage('calendar')
                    setSideMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-4 text-slate-650 hover:text-primary transition-colors py-2 text-left cursor-pointer"
                >
                  <CalendarIcon className="w-5.5 h-5.5 text-slate-500" />
                  <span className="font-bold text-sm tracking-wide">发布日历</span>
                </button>
                <button 
                  onClick={() => {
                    setActiveSubPage('market')
                    setSideMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-4 text-slate-650 hover:text-primary transition-colors py-2 text-left cursor-pointer"
                >
                  <ShoppingBag className="w-5.5 h-5.5 text-slate-500" />
                  <span className="font-bold text-sm tracking-wide">店内活动</span>
                </button>
                <button 
                  onClick={() => {
                    setActiveSubPage('assets')
                    setSideMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-4 text-slate-650 hover:text-primary transition-colors py-2 text-left cursor-pointer"
                >
                  <ImageIcon className="w-5.5 h-5.5 text-slate-500" />
                  <span className="font-bold text-sm tracking-wide">素材库</span>
                </button>
                <div className="pt-6 mt-6 border-t border-slate-200/50 space-y-4">
                  <button 
                    onClick={() => {
                      setActiveSubPage('settings')
                      setSideMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-4 text-slate-650 hover:text-primary transition-colors py-2 text-left cursor-pointer"
                  >
                    <Settings className="w-5.5 h-5.5 text-slate-500" />
                    <span className="font-bold text-sm tracking-wide">系统设置</span>
                  </button>
                  <button 
                    onClick={() => {
                      // Navigate to the brand-owner's own local logout handler.
                      // This route lives in src/app/api/logout/route.ts and is
                      // NOT proxied to the main app, so it always redirects back
                      // to /login on amc-mm.immedi.ai.
                      window.location.href = '/api/logout'
                    }}
                    className="w-full flex items-center gap-4 text-rose-600 hover:text-rose-700 transition-colors py-2 text-left cursor-pointer"
                  >
                    <LogOut className="w-5.5 h-5.5 text-rose-500" />
                    <span className="font-bold text-sm tracking-wide">退出登录</span>
                  </button>
                </div>
              </nav>
              <a 
                href={activeBrand?.id ? getMainAppUrl(`/board/subscription/${activeBrand.id}`) : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/40 transition-colors block text-left cursor-pointer group"
                title="打开订阅管理"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                  <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    AI Marketing Crew:
                  </span>
                  <span className="text-[10px] font-black text-primary dark:text-indigo-400 uppercase tracking-wider truncate">
                    {subscriptionPlan}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                  <span className="font-bold group-hover:text-primary dark:group-hover:text-indigo-400 transition-colors">点击打开订阅管理</span>
                  <span className="group-hover:translate-x-0.5 transition-transform">&rarr;</span>
                </div>
              </a>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  )
}
