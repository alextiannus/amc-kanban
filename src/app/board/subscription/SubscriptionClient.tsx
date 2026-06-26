'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  Sparkles,
  User,
  Users,
  PenTool,
  Search,
  UserCheck,
  Compass,
  MessageSquare,
  Headphones,
  ShieldCheck,
  Check,
  AlertCircle,
  HelpCircle,
  Building,
  MapPin,
  Clock,
  Mail,
  ChevronRight,
  Info,
  Calendar,
  Layers,
  ChevronLeft,
  Lock
} from 'lucide-react'
import { buildLaunchInstruction } from '@/lib/agentInitPrompt'
import { calculatePricing } from '@/lib/subscription/catalog'

const AI_CREW_CREATION_DURATION_MS = 30_000

type AgentCreationMode = 'create' | 'update'

type Plan = {
  id: string
  name: string
  monthlyUsd: number
  promoMonthlyUsd?: number
  description: string
  includes: string[]
  teamConfig: string
  suitableFor: string
  services: string[]
  baseline: string
  commissionNote?: string
}

type Addon = {
  id: string
  name: string
  pricing: 'monthly' | 'one_time'
  usd: number
  description: string
  details: string[]
}

type SubscriptionPayload = {
  brand: { id: string; name: string } | null
  plans: Plan[]
  comparisonRows: { key: string; label: string; values: Record<string, string> }[]
  addons: Addon[]
  durations: number[]
  termsVersion: string
  termsTitle: string
  termsNotice: string
  termsFullText: string
  latestSubscription?: { id?: string; status?: string; planName?: string; paymentProvider?: string; contractEndDate?: string | null }
  paymentEnabled: boolean
  instructionContext?: {
    subscription: {
      planId: string | null
      planName: string | null
      platforms: string | null
    }
    user: {
      id: string
      email: string | null
      role: string
      nickname: string | null
      timezone: string | null
    }
    brand: {
      id: string
      name: string
      location: string | null
      timezone: string | null
      website: string | null
      phone: string | null
      address: string | null
    }
    stores: Array<{
      storeId: string
      name: string
      isPrimary: boolean
      timezone: string | null
      address: string | null
      location: string | null
    }>
    socialAccounts: Array<{
      platformId: string
      handle: string
      displayName: string | null
      profileUrl: string | null
    }>
    ownedBrands: Array<{
      id: string
      name: string
      location: string | null
    }>
    agent: {
      id: string | null
      apiKey: string | null
    }
  } | null
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

function isValidCheckoutSessionId(value: string): boolean {
  if (!value) return false
  if (value.includes('{') || value.includes('}')) return false
  return /^cs_[A-Za-z0-9_]+$/.test(value)
}

function isValidSubscriptionId(value: string): boolean {
  if (!value) return false
  if (value.includes('{') || value.includes('}')) return false
  return /^[A-Za-z0-9_-]{8,}$/.test(value)
}

function resolveCurrentPlanId(payload: SubscriptionPayload | null): string | null {
  if (!payload) return null
  const fromContext = payload.instructionContext?.subscription?.planId
  if (fromContext) return fromContext

  if (!isEffectiveActiveSubscription(payload.latestSubscription)) return null

  const activePlanName = payload.latestSubscription?.planName
  if (!activePlanName) return null
  return payload.plans.find((p) => p.name === activePlanName)?.id || null
}

function isEffectiveActiveSubscription(subscription?: { status?: string; contractEndDate?: string | null } | null) {
  if (subscription?.status !== 'ACTIVE') return false
  if (!subscription.contractEndDate) return true
  return new Date(subscription.contractEndDate).getTime() > Date.now()
}

function WebGLBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const canvasEl = canvas

    let animationFrameId: number
    const gl = (canvasEl.getContext('webgl') || canvasEl.getContext('experimental-webgl')) as any
    if (!gl) return

    const vs = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `
    const fs = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform float u_time;
      uniform vec2 u_resolution;

      void main() {
          vec2 uv = v_texCoord;
          
          // Create a sophisticated, slow-moving atmospheric glow
          // Using Digital Employee Console Primary Indigo #4648d4
          vec3 primaryColor = vec3(0.275, 0.282, 0.831); 
          // Surface Bright #f7f9fb
          vec3 bgColor = vec3(0.969, 0.976, 0.984);
          // Subtle secondary accent
          vec3 accentColor = vec3(0.376, 0.388, 0.933);
          
          float t = u_time * 0.15;
          
          // Smooth noise/flow pattern
          float n = sin(uv.x * 3.0 + t) * 0.5 + 0.5;
          n += cos(uv.y * 2.0 - t * 1.2) * 0.4;
          n += sin((uv.x - uv.y) * 2.5 + t * 0.7) * 0.3;
          
          // Map to a very subtle, high-end "aura" effect
          float mask = smoothstep(0.3, 0.7, n * 0.4);
          vec3 finalColor = mix(bgColor, primaryColor, mask * 0.12);
          
          // Add a secondary shifting highlight for depth
          float highlight = sin(t + uv.x * 4.0 + uv.y * 2.0) * 0.5 + 0.5;
          finalColor = mix(finalColor, accentColor, highlight * 0.05);
          
          // Vignette for focus
          float dist = distance(uv, vec2(0.5));
          finalColor *= 1.0 - smoothstep(0.5, 1.5, dist) * 0.1;
          
          gl_FragColor = vec4(finalColor, 1.0);
      }
    `

    function syncSize() {
      const w = canvasEl.clientWidth || 1280
      const h = canvasEl.clientHeight || 720
      if (canvasEl.width !== w || canvasEl.height !== h) {
        canvasEl.width = w
        canvasEl.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      syncSize()
    })
    resizeObserver.observe(canvasEl)
    syncSize()

    function compileShader(type: number, src: string) {
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(s))
        gl.deleteShader(s)
        return null
      }
      return s
    }

    const vsShader = compileShader(gl.VERTEX_SHADER, vs)
    const fsShader = compileShader(gl.FRAGMENT_SHADER, fs)
    if (!vsShader || !fsShader) return

    const prog = gl.createProgram()
    if (!prog) return
    gl.attachShader(prog, vsShader)
    gl.attachShader(prog, fsShader)
    gl.linkProgram(prog)

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog))
      return
    }

    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    const pos = gl.getAttribLocation(prog, 'a_position')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uRes = gl.getUniformLocation(prog, 'u_resolution')

    function render(t: number) {
      gl.viewport(0, 0, canvasEl.width, canvasEl.height)
      if (uTime) gl.uniform1f(uTime, t * 0.001)
      if (uRes) gl.uniform2f(uRes, canvasEl.width, canvasEl.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationFrameId)
      resizeObserver.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full block z-0"
      style={{ display: 'block' }}
    />
  )
}

export default function BrandSubscriptionPage() {
  const router = useRouter()
  const params = useParams<{ brandId?: string }>()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SubscriptionPayload | null>(null)
  const [planId, setPlanId] = useState<string>('starter')
  const [durationMonths, setDurationMonths] = useState<number>(3)
  const [addonIds, setAddonIds] = useState<string[]>([])
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [paymentMode, setPaymentMode] = useState<'ONLINE' | 'BILLING'>('BILLING')
  const [copiedInstruction, setCopiedInstruction] = useState(false)
  const [activationNotice, setActivationNotice] = useState<string | null>(null)
  const [showAgentCreationModal, setShowAgentCreationModal] = useState(false)
  const [activationJustCompleted, setActivationJustCompleted] = useState(false)
  const [agentCreationProgress, setAgentCreationProgress] = useState(0)
  const [agentCreationDone, setAgentCreationDone] = useState(false)
  const [agentCreationStartedAt, setAgentCreationStartedAt] = useState<number | null>(null)
  const [agentCreationMode, setAgentCreationMode] = useState<AgentCreationMode>('create')
  const instructionCardRef = useRef<HTMLElement | null>(null)

  const success = searchParams?.get('success') === '1'
  const canceled = searchParams?.get('canceled') === '1'
  const checkoutSessionId = searchParams?.get('sid') || ''
  const subscriptionId = searchParams?.get('sub') || ''
  const queryBrandId = searchParams?.get('brandId') || ''
  const pendingBrandName = (searchParams?.get('newBrandName') || '').trim()
  const pendingBrandLocation = (searchParams?.get('newBrandLocation') || '').trim()
  const pendingBrandAddress = (searchParams?.get('newBrandAddress') || '').trim()
  const pendingBrandOwnerEmail = (searchParams?.get('newBrandOwnerEmail') || '').trim()
  const returnToRaw = searchParams?.get('returnTo') || ''
  const returnTo = returnToRaw.startsWith('/') ? returnToRaw : ''
  const routeBrandId = typeof params?.brandId === 'string' ? params.brandId : ''
  const effectiveBrandId = routeBrandId || queryBrandId
  const subscriptionApiPath = effectiveBrandId
    ? `/api/subscription?brandId=${encodeURIComponent(effectiveBrandId)}`
    : '/api/subscription'

  // Step state: 1 for brand/store onboarding setup, 2 for plan choosing and payment
  // If managing an existing brand, start straight at Step 2
  const [step, setStep] = useState<1 | 2>(effectiveBrandId ? 2 : 1)

  // Onboarding Brand Form states
  const [brandName, setBrandName] = useState(pendingBrandName || '')
  const [brandLocation, setBrandLocation] = useState(pendingBrandLocation || '')
  const [brandTimezone, setBrandTimezone] = useState(
    typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Singapore' : 'Asia/Singapore'
  )
  const [brandOwnerEmail, setBrandOwnerEmail] = useState(pendingBrandOwnerEmail || '')

  // Onboarding Store Form states (Optional)
  const [storeName, setStoreName] = useState('')
  const [storeAddress, setStoreAddress] = useState(pendingBrandAddress || '')
  const [storeTimezone, setStoreTimezone] = useState(
    typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Singapore' : 'Asia/Singapore'
  )
  const [storeGoogleMaps, setStoreGoogleMaps] = useState('')

  const scrollToInstructionCard = () => {
    window.setTimeout(() => {
      instructionCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
  }

  const beginAgentCreationExperience = (mode: AgentCreationMode) => {
    setActivationJustCompleted(true)
    setAgentCreationDone(false)
    setAgentCreationProgress(0)
    setAgentCreationStartedAt(Date.now())
    setAgentCreationMode(mode)
    setShowAgentCreationModal(true)
    setActivationNotice(
      mode === 'update'
        ? '订阅计划已更新。正在同步你的 AI 员工使命，请稍候...'
        : '订阅计划已激活。正在为你创建 AI 员工，请稍候...'
    )
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(subscriptionApiPath)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load subscription data')
        setData(json)
        const currentPlanId = resolveCurrentPlanId(json)
        if (currentPlanId) {
          setPlanId(currentPlanId)
        } else if (json.plans?.[0]?.id) {
          setPlanId(json.plans[0].id)
        }
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Failed to load'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [subscriptionApiPath])

  useEffect(() => {
    if (data?.instructionContext?.user?.email && !brandOwnerEmail) {
      setBrandOwnerEmail(data.instructionContext.user.email)
    }
  }, [data, brandOwnerEmail])

  useEffect(() => {
    const confirmPayment = async () => {
      if (!success || !checkoutSessionId || !subscriptionId) return

      if (!isValidCheckoutSessionId(checkoutSessionId) || !isValidSubscriptionId(subscriptionId)) {
        setError('支付回调参数无效，请返回订阅页重新发起支付。')
        router.replace('/board/subscription')
        return
      }

      setConfirming(true)
      setError(null)
      try {
        const res = await fetch('/api/subscription/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkoutSessionId, subscriptionId, brandId: effectiveBrandId || undefined }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Payment confirmation failed')

        const fresh = await fetch(subscriptionApiPath)
        const freshJson = await fresh.json()
        if (fresh.ok) {
          setData(freshJson)
          const currentPlanId = resolveCurrentPlanId(freshJson)
          if (currentPlanId) setPlanId(currentPlanId)
          beginAgentCreationExperience(currentPlanId && currentPlanId !== resolveCurrentPlanId(freshJson) ? 'update' : 'create')
        }
        if (json.brand && returnTo) {
          router.replace(returnTo)
        }
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Payment confirmation failed'))
      } finally {
        setConfirming(false)
      }
    }
    confirmPayment()
  }, [success, checkoutSessionId, subscriptionId, router, effectiveBrandId, subscriptionApiPath, returnTo])

  useEffect(() => {
    if (!showAgentCreationModal || !agentCreationStartedAt) return

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - agentCreationStartedAt
      const progress = Math.min(100, Math.round((elapsed / AI_CREW_CREATION_DURATION_MS) * 100))
      setAgentCreationProgress(progress)

      if (progress >= 100) {
        window.clearInterval(timer)
        setAgentCreationDone(true)
        setActivationNotice(
          agentCreationMode === 'update'
            ? 'AI 员工使命更新完成。现在可以复制初始化指令并继续连接平台。'
            : 'AI 员工创建流程已完成。现在可以复制初始化指令并连接平台。'
        )
      }
    }, 200)

    return () => window.clearInterval(timer)
  }, [showAgentCreationModal, agentCreationStartedAt, agentCreationMode])

  useEffect(() => {
    if (!agentCreationDone) return
    const closeTimer = window.setTimeout(() => {
      setShowAgentCreationModal(false)
      scrollToInstructionCard()
    }, 900)
    return () => window.clearTimeout(closeTimer)
  }, [agentCreationDone])

  const billingCycle: 'quarterly' | 'yearly' = durationMonths === 12 ? 'yearly' : 'quarterly'

  const selectedPlan = useMemo(() => data?.plans.find((p) => p.id === planId), [data?.plans, planId])
  const currentPlanId = useMemo(() => resolveCurrentPlanId(data), [data])
  const recommendedPlanId = !data?.plans?.length
    ? ''
    : data.plans.find((p) => p.id === 'essential')?.id || data.plans[0].id

  const monthlyAddons = (data?.addons || []).filter((a) => a.pricing === 'monthly')
  const oneTimeAddonItems = (data?.addons || []).filter((a) => a.pricing === 'one_time')

  const instructionText = useMemo(() => {
    const ctx = data?.instructionContext
    if (!ctx) return ''
    const baseHost =
      typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_KANBAN_HOST || 'https://amc-kanban.immedi.ai'

    return buildLaunchInstruction({
      apiBaseUrl: `${baseHost}/api`,
      context: ctx,
    })
  }, [data?.instructionContext])

  const [multiStoreQty, setMultiStoreQty] = useState<number>(0)

  const toggleAddon = (id: string) => {
    setAddonIds((prev) => {
      const exists = prev.includes(id)
      if (id === 'multi_store') {
        if (exists) {
          setMultiStoreQty(0)
          return prev.filter((v) => v !== id)
        } else {
          setMultiStoreQty(1)
          return [...prev, id]
        }
      }
      return exists ? prev.filter((v) => v !== id) : [...prev, id]
    })
  }

  const handleMultiStoreQtyChange = (q: number) => {
    const qty = Math.max(0, q)
    setMultiStoreQty(qty)
    setAddonIds((prev) => {
      const exists = prev.includes('multi_store')
      if (qty > 0 && !exists) {
        return [...prev, 'multi_store']
      } else if (qty === 0 && exists) {
        return prev.filter((v) => v !== 'multi_store')
      }
      return prev
    })
  }

  const copyInstruction = async () => {
    if (!instructionText) return
    try {
      await navigator.clipboard.writeText(instructionText)
      setCopiedInstruction(true)
      window.setTimeout(() => setCopiedInstruction(false), 1800)
    } catch {
      setError('复制失败，请手动复制 instruction 内容。')
    }
  }

  const startCheckout = async () => {
    if (!selectedPlan || !data) return
    setSubmitting(true)
    setError(null)
    setActivationNotice(null)
    try {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: effectiveBrandId || undefined,
          pendingBrandName: effectiveBrandId ? undefined : brandName.trim() || undefined,
          pendingBrandLocation: effectiveBrandId ? undefined : brandLocation.trim() || undefined,
          pendingBrandAddress: effectiveBrandId ? undefined : storeAddress.trim() || undefined,
          pendingBrandOwnerEmail: effectiveBrandId ? undefined : brandOwnerEmail.trim().toLowerCase() || undefined,
          returnTo: returnTo || undefined,
          planId: selectedPlan.id,
          durationMonths,
          addonIds,
          addonQuantities: { multi_store: multiStoreQty },
          paymentMode,
          timezone: brandTimezone,
          agreedToTerms,
          termsVersion: data.termsVersion,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create checkout session')

      if (json.paymentMode === 'BILLING') {
        if (json.brand && returnTo) {
          router.push(returnTo)
          return
        }
        const fresh = await fetch(subscriptionApiPath)
        const freshJson = await fresh.json()
        if (fresh.ok) {
          setData(freshJson)
          const newCurrentPlanId = resolveCurrentPlanId(freshJson)
          if (newCurrentPlanId) setPlanId(newCurrentPlanId)
        } else if (json.subscription) {
          setData((prev) => (prev ? { ...prev, latestSubscription: json.subscription } : prev))
          setPlanId(selectedPlan.id)
        }
        beginAgentCreationExperience(currentPlanId && currentPlanId !== selectedPlan.id ? 'update' : 'create')
      } else if (json.checkoutUrl) {
        window.location.href = json.checkoutUrl
      } else {
        throw new Error('Checkout URL is missing')
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create checkout'))
    } finally {
      setSubmitting(false)
    }
  }

  // Real-time Pricing Summary Calculator
  const pricingSummary = useMemo(() => {
    if (!data || !selectedPlan) return null
    try {
      return calculatePricing(planId, durationMonths, addonIds, { multi_store: multiStoreQty })
    } catch {
      return null
    }
  }, [data, selectedPlan, planId, durationMonths, addonIds, multiStoreQty])

  // Stepper Header
  const renderStepper = () => {
    // If we're modifying an existing brand subscription, do not display step 1.
    if (effectiveBrandId) return null

    return (
      <div className="flex justify-between items-center max-w-xl mx-auto mb-10 pt-4 px-4">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setStep(1)}
            disabled={step === 1}
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
              step === 1
                ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-950/50'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer'
            }`}
          >
            {step > 1 ? <Check size={16} /> : '1'}
          </button>
          <span className={`text-xs font-bold ${step === 1 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>品牌与门店配置</span>
        </div>
        <div className="flex-1 h-0.5 mx-4 bg-slate-200 dark:bg-slate-800" />
        <div className="flex flex-col items-center gap-2">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
            step === 2
              ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-950/50'
              : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          }`}>
            2
          </div>
          <span className={`text-xs font-bold ${step === 2 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>选择套餐与支付</span>
        </div>
        <div className="flex-1 h-0.5 mx-4 bg-slate-200 dark:bg-slate-800" />
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            3
          </div>
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">AI 团队激活部署</span>
        </div>
      </div>
    )
  }

  // AI Crew Roster Configuration definitions
  const crewRoles = [
    {
      name: 'AI 内容创作官',
      desc: '负责全平台内容的策划、创作与发布。图文、短视频、营销活动帖子，每月持续产出，风格统一，从不缺席。',
      icon: PenTool,
      activeIn: ['starter', 'essential', 'advanced'],
      color: 'from-blue-500/20 to-indigo-500/20 text-indigo-600 dark:text-indigo-400',
    },
    {
      name: 'AI 市场调研官',
      desc: '实时监控各平台评论、评分变化与竞品动态，将市场信号转化为可执行的运营建议，让你的团队始终掌握先机。',
      icon: Search,
      activeIn: ['starter', 'essential', 'advanced'],
      color: 'from-cyan-500/20 to-blue-500/20 text-cyan-600 dark:text-cyan-400',
    },
    {
      name: '品牌主理人',
      desc: '你的专属人工对接人。负责统筹AI团队的日常工作，确保所有内容和策略符合你的品牌方向，是你与AI团队之间的桥梁。',
      icon: UserCheck,
      activeIn: ['starter', 'essential', 'advanced'],
      color: 'from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400',
    },
    {
      name: 'AI 品牌策略师',
      desc: '负责目标客群定位、差异化卖点提炼与品牌调性确立，制定每月营销主题与团购转化方案，驱动品牌从“被看见”到“被记住”。',
      icon: Compass,
      activeIn: ['essential', 'advanced'],
      color: 'from-purple-500/20 to-violet-500/20 text-purple-600 dark:text-purple-400',
    },
    {
      name: 'AI 私域运营官',
      desc: '搭建并运营你的专属顾客社群（WhatsApp / 微信群），将一次性到店客人转化为长期忠实顾客，让每一分获客成本产生复利。',
      icon: MessageSquare,
      activeIn: ['advanced'],
      color: 'from-amber-500/20 to-orange-500/20 text-amber-600 dark:text-amber-400',
    },
    {
      name: 'AI 客服',
      desc: '全平台评论回复、差评处理与粉丝互动，工作日24小时响应，维护口碑，培养顾客好感。',
      icon: Headphones,
      activeIn: ['advanced'],
      color: 'from-rose-500/20 to-pink-500/20 text-rose-600 dark:text-rose-400',
    },
  ]

  const isStep1Valid = brandName.trim() !== '' && brandLocation.trim() !== '' && brandOwnerEmail.trim() !== ''

  const commonTimezones = [
    { value: 'Asia/Singapore', label: '新加坡时区 (UTC+8) - Asia/Singapore' },
    { value: 'Asia/Shanghai', label: '北京时区 (UTC+8) - Asia/Shanghai' },
    { value: 'Asia/Hong_Kong', label: '香港时区 (UTC+8) - Asia/Hong_Kong' },
    { value: 'America/New_York', label: '纽约时区 (UTC-5) - America/New_York' },
    { value: 'America/Los_Angeles', label: '洛杉矶时区 (UTC-8) - America/Los_Angeles' },
    { value: 'Europe/London', label: '伦敦时区 (UTC+0) - Europe/London' },
    { value: 'Australia/Sydney', label: '悉尼时区 (UTC+11) - Australia/Sydney' }
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-rose-600 font-bold">
        {error || 'Failed to load subscription module'}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f9fb] dark:bg-slate-950 p-4 md:p-8 text-slate-900 dark:text-slate-100 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Navigation Bar */}
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (step === 2 && !effectiveBrandId) {
                  setStep(1)
                } else {
                  router.push('/board')
                }
              }}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft size={16} className="text-slate-600 dark:text-slate-300" />
            </button>
            <div>
              <span className="text-xs font-black tracking-widest text-indigo-600 dark:text-indigo-400 uppercase">AI Marketing Crew</span>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                {step === 1 ? '新品牌入驻与设置' : '选择团队订阅套餐'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.brand && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                <Building size={12} /> {data.brand.name}
              </span>
            )}
          </div>
        </div>

        {/* Horizontal Progress Stepper */}
        {renderStepper()}

        {/* Global Notices */}
        {confirming && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 px-5 py-4 text-sm font-semibold flex items-center gap-2 shadow-sm">
            <Loader2 className="w-4 h-4 animate-spin text-amber-500" /> 正在确认您的支付结果，请稍候...
          </div>
        )}

        {canceled && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 px-5 py-4 text-sm font-semibold flex items-center gap-2 shadow-sm animate-pulse">
            <AlertCircle size={16} className="text-rose-500 shrink-0" />
            您已取消本次支付。订单已保留为待支付状态，您可以重新发起。
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 px-5 py-4 text-sm font-semibold flex items-center gap-2 shadow-sm">
            <AlertCircle size={16} className="text-rose-500 shrink-0" />
            {error}
          </div>
        )}

        {/* Active subscription instructions box */}
        {((success || isEffectiveActiveSubscription(data.latestSubscription)) && instructionText && (!activationJustCompleted || agentCreationDone)) && (
          <section ref={instructionCardRef} className="rounded-2xl border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/30 dark:bg-emerald-950/20 p-5 md:p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 size={18} className="text-emerald-500" /> 
                  「{data.brand?.name || '当前账号'}」的订阅已生效：{data.latestSubscription?.planName || 'AI 营销团队上岗中'}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">您的专属 AI 营销团队已就绪，请复制下方初始化指令并进行接入。</p>
              </div>
              <button
                onClick={copyInstruction}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-xs font-bold transition-all shadow-md active:scale-95"
              >
                <Copy size={14} /> {copiedInstruction ? '已复制指令！' : '复制 Agent 初始化指令'}
              </button>
            </div>
          </section>
        )}

        {/* MAIN BODY CONTENT COMPONENT STACK */}
        
        {/* STEP 1: BRAND AND STORE CONFIGURATION */}
        {step === 1 && !effectiveBrandId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Form Section */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Brand Profile Fields */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <User size={18} className="text-indigo-600 dark:text-indigo-400" /> 新品牌基本信息
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    配置您要推广的新品牌信息。AI 团队将根据这些数据定制专属的品牌语言与风格。
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      品牌名称 <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        placeholder="例如：大渔铁板烧 / Little Shanghai"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      品牌所在地 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={brandLocation}
                      onChange={(e) => setBrandLocation(e.target.value)}
                      placeholder="例如：新加坡 / Singapore"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      品牌时区 <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={brandTimezone}
                      onChange={(e) => {
                        setBrandTimezone(e.target.value)
                        setStoreTimezone(e.target.value)
                      }}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none"
                    >
                      {commonTimezones.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      主理人联络邮箱 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={brandOwnerEmail}
                      onChange={(e) => setBrandOwnerEmail(e.target.value)}
                      placeholder="owner@example.com"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Store Profile Fields (Optional) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Building size={18} className="text-indigo-600 dark:text-indigo-400" /> 主门店配置 (选填)
                  </h2>
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    可稍后设置
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  如果您目前有正在运营的实体店铺，配置该选项将能让 AI 市场调研官为您监控 Google Business 评分与平台口碑。
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      门店名称 (Outlet Name)
                    </label>
                    <input
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="例如：乌节路旗舰店 / Orchard Road Outlet"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      门店具体地址
                    </label>
                    <input
                      type="text"
                      value={storeAddress}
                      onChange={(e) => setStoreAddress(e.target.value)}
                      placeholder="例如：350 Orchard Rd, Singapore 238868"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      门店时区
                    </label>
                    <select
                      value={storeTimezone}
                      onChange={(e) => setStoreTimezone(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none"
                    >
                      {commonTimezones.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      谷歌商家链接 (Google Business Link)
                    </label>
                    <input
                      type="url"
                      value={storeGoogleMaps}
                      onChange={(e) => setStoreGoogleMaps(e.target.value)}
                      placeholder="https://maps.google.com/?cid=..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => router.push('/board')}
                  className="text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  返回看板
                </button>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => {
                      if (isStep1Valid) {
                        setStep(2)
                      }
                    }}
                    disabled={!isStep1Valid}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:from-slate-200 disabled:to-slate-200 dark:disabled:from-slate-800 dark:disabled:to-slate-800 text-white disabled:text-slate-400 dark:disabled:text-slate-600 px-6 py-3 text-sm font-black transition-all shadow-md cursor-pointer disabled:cursor-not-allowed active:scale-95"
                  >
                    下一步：选择订阅计划 <ChevronRight size={16} />
                  </button>
                  {!isStep1Valid && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      * 请填写品牌名称、所在地与联络邮箱以继续。
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar Promo Section */}
            <div className="space-y-6">
              <div className="rounded-3xl border border-indigo-100 dark:border-indigo-950 bg-gradient-to-br from-indigo-50/50 via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 p-6 shadow-sm space-y-6">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-600" /> AI Marketing Crew
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 font-bold leading-relaxed">
                    订阅即上岗，全托管你的自媒体增长。
                  </p>
                </div>

                <div className="space-y-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-4">
                  <p>
                    AMC 是一支专为本地生活商家打造的 AI 营销团队。
                  </p>
                  <p>
                    <strong className="text-indigo-600 dark:text-indigo-400">AMC 不是工具软件，不是模板。</strong>
                    您无需花费时间学习复杂的系统操作或繁琐的配置。
                  </p>
                  <p>
                    内容策划、评论监控、竞品情报、私域运营等任务全部由 AI 营销小组成员分工协同执行，并由真人品牌主理人作为人工纽带为您统筹把关。
                  </p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    “ 你只管做菜，增长交给我们。 ”
                  </p>
                </div>

                <div className="rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 p-4 border border-indigo-100/50 dark:border-indigo-900/30 text-[11px] text-slate-600 dark:text-slate-400">
                  <p className="font-bold text-indigo-800 dark:text-indigo-300">💡 为什么需要配置时区？</p>
                  <p className="mt-1">
                    AI 团队将根据您的时区来规划每日内容发布策略、达人联络配合以及工作日的客服响应周期，以确保达到最佳的本地社群互动率。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: PLANS AND PAYMENT DETAILS */}
        {step === 2 && (
          <div className="space-y-8">
            
            {/* Branding Hero Intro Banner with WebGL Background and Glassmorphism */}
            <section className="relative overflow-hidden rounded-3xl border border-slate-200/60 dark:border-slate-800 bg-[#f7f9fb] dark:bg-slate-950 shadow-lg min-h-[480px] flex items-center">
              <WebGLBackground />
              
              {/* Hero Content with Glassmorphism */}
              <div className="relative z-10 w-full h-full p-6 md:p-12 lg:p-20">
                <div className="glass ai-presence-bg p-8 md:p-16 max-w-4xl rounded-2xl border border-white/60 dark:border-slate-800/60 shadow-2xl overflow-hidden">
                  <div className="relative">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-6">
                      ★ AI Marketing Crew
                    </span>
                    <h2 className="font-sans font-black text-[32px] md:text-5xl text-indigo-600 dark:text-indigo-400 mb-6 reveal-text delay-reveal-1 leading-tight tracking-tight">
                      订阅即上岗，全托管你的自媒体增长
                    </h2>
                    <div className="w-16 h-1 bg-indigo-500/20 rounded-full mb-6 reveal-text delay-reveal-1"></div>
                    <p className="font-sans text-sm md:text-lg text-slate-700 dark:text-slate-300 leading-relaxed reveal-text delay-reveal-2 max-w-2xl">
                      不再只是单一的工具。AI Marketing Crew (AMC) 为您提供一支完整的、全天候待命的数字营销团队。从内容创作、市场洞察到客户维护，我们的“数字员工”像真实人类一样协作，并在真人主理人的统筹把关下，帮助您的店铺在数字化浪潮中实现持续增长。你只管做菜，增长交给我们。
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* AI Team Roster Grid (The Crew Members) */}
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-black tracking-widest text-slate-700 dark:text-slate-300 uppercase flex items-center gap-2">
                  <Users size={16} className="text-indigo-600" /> 1) 您的专属 AI 营销团队成员
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  您的套餐配置将包含以下 AI 岗位成员，分工协助，从不缺席。当前选择套餐已激活的 AI 成员将亮起。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                {crewRoles.map((role) => {
                  const isActive = role.activeIn.includes(planId)
                  const RoleIcon = role.icon
                  return (
                    <div
                      key={role.name}
                      className={`rounded-2xl border p-4 transition-all duration-300 flex flex-col justify-between shadow-sm relative overflow-hidden ${
                        isActive
                          ? 'border-indigo-500/30 bg-white dark:bg-slate-900 ring-2 ring-indigo-500/10'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 opacity-55'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${role.color}`}>
                          <RoleIcon size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-black text-slate-900 dark:text-white">{role.name}</h4>
                            {!isActive && <Lock size={10} className="text-slate-400" />}
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal mt-1">
                            {role.desc}
                          </p>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 mt-3 flex items-center justify-between text-[10px] font-bold">
                        <span className={isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}>
                          {isActive ? '已上岗 Onboarded' : '未解锁'}
                        </span>
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Choose Package & Billing Period Selector */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-black tracking-widest text-slate-700 dark:text-slate-300 uppercase flex items-center gap-2">
                    <Layers size={16} className="text-indigo-600" /> 2) 选择团队配置与套餐
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    订阅支持随时升级，所有套餐均提供中英双语服务，专为海外本地生活商家打造。
                  </p>
                </div>
                
                {/* Duration Toggle */}
                <div className="flex justify-center">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/80 p-1">
                    <button
                      onClick={() => setDurationMonths(3)}
                      className={`rounded-full px-5 py-2 text-xs font-bold transition-all ${
                        billingCycle === 'quarterly'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      季度订阅
                    </button>
                    <button
                      onClick={() => setDurationMonths(12)}
                      className={`relative rounded-full px-5 py-2 text-xs font-bold transition-all ${
                        billingCycle === 'yearly'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      年度订阅
                      <span className="absolute -top-2 -right-3 rounded-full bg-amber-400 px-1.5 py-0.5 text-[8px] font-black text-white leading-none shadow-sm uppercase">
                        -10%
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Package cards list */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {data.plans.map((p) => {
                  const isSelected = planId === p.id
                  const isCurrentPlan = currentPlanId === p.id
                  const isRecommended = p.id === recommendedPlanId
                  const baseMonthly = p.promoMonthlyUsd ?? p.monthlyUsd
                  const cycleMonthly = billingCycle === 'yearly' ? Math.round(baseMonthly * 0.9) : baseMonthly
                  const cycleTotal = cycleMonthly * (billingCycle === 'yearly' ? 12 : 3)

                  // Render active crew icons for this specific plan in cards
                  const activeRolesPills = crewRoles.filter((r) => r.activeIn.includes(p.id))

                  return (
                    <button
                      key={p.id}
                      onClick={() => setPlanId(p.id)}
                      className={`group relative text-left rounded-2xl border transition-all flex flex-col justify-between overflow-hidden shadow-sm ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/20 dark:bg-indigo-950/10 shadow-md ring-2 ring-indigo-600/10'
                          : isCurrentPlan
                            ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-md'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {/* Top Header Tag */}
                      <div className={`px-4 py-1.5 text-center text-[10px] font-black tracking-widest uppercase ${
                        isSelected
                          ? 'bg-indigo-600 text-white'
                          : isCurrentPlan
                            ? 'bg-emerald-500 text-white'
                            : isRecommended
                              ? 'bg-slate-900 text-white dark:bg-slate-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        {isSelected ? '当前选择 (Selected)' : isCurrentPlan ? '当前在使用' : isRecommended ? '最佳性价比 (Recommended)' : '团队配置套餐'}
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-5">
                        
                        {/* Name and Slogan */}
                        <div className="space-y-1">
                          <h4 className="text-xl font-black text-slate-900 dark:text-white">{p.name}</h4>
                          <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">{p.description}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{p.suitableFor}</p>
                        </div>

                        {/* Pricing */}
                        <div className="border-t border-slate-100 dark:border-slate-800/50 pt-4">
                          <div className="flex items-end gap-1.5">
                            <span className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
                              ${cycleMonthly}
                            </span>
                            <span className="pb-1 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                              / 月 (USD)
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                            {billingCycle === 'yearly' 
                              ? `年付 $${cycleTotal} / 12 个月 (省 $${Math.round(baseMonthly * 1.2 * 10)} USD)` 
                              : `季度付 $${cycleTotal} / 3 个月`}
                          </p>
                        </div>

                        {/* Onboarded Staff List Icons */}
                        <div className="border-t border-slate-100 dark:border-slate-800/50 pt-4 space-y-2">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            上岗团队配置 ({activeRolesPills.length} 位成员):
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {activeRolesPills.map((role) => (
                              <span 
                                key={role.name}
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-600 dark:text-slate-300"
                              >
                                <span className="w-1 h-1 rounded-full bg-indigo-500" />
                                {role.name.replace('AI ', '')}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Services List Bullet Points */}
                        <div className="border-t border-slate-100 dark:border-slate-800/50 pt-4 space-y-2">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            服务内容：
                          </p>
                          <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                            {p.services.map((item) => (
                              <li key={item} className="flex items-start gap-2 leading-relaxed">
                                <CheckCircle2 size={13} className="text-indigo-500 shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Commission Note */}
                        {p.commissionNote && (
                          <div className="rounded-xl bg-amber-50/60 dark:bg-amber-950/20 p-3 border border-amber-100 dark:border-amber-900/30 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
                            <span className="font-black text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                              💰 佣金分成说明 (Commission Terms):
                            </span>
                            {p.commissionNote}
                          </div>
                        )}

                        {/* Baseline Results reference card */}
                        {p.baseline && (
                          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3 border border-slate-200/40 dark:border-slate-800/50 mt-4 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
                            <span className="font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                              🎯 成果参考 (Results Baseline):
                            </span>
                            {p.baseline}
                          </div>
                        )}
                      </div>

                      {/* Select state button */}
                      <div className="p-5 pt-0 mt-auto w-full">
                        <div className={`w-full py-2.5 rounded-xl text-center text-xs font-black transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 group-hover:bg-slate-100 dark:group-hover:bg-slate-800'
                        }`}>
                          {isSelected ? '已选择 (Selected)' : '选择此团队配置'}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Addons Grid */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-black tracking-widest text-slate-700 dark:text-slate-300 uppercase flex items-center gap-2">
                  <Sparkles size={16} className="text-indigo-600" /> 3) 增值增效加购服务
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  根据店铺特定的营销节点，可选择按月代运营或单次执行的服务。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Monthly Addons */}
                {monthlyAddons.map((a) => {
                  const isChecked = addonIds.includes(a.id)
                  return (
                    <div
                      key={a.id}
                      onClick={() => toggleAddon(a.id)}
                      className={`group cursor-pointer rounded-2xl border p-4 transition-all duration-200 flex flex-col justify-between ${
                        isChecked
                          ? 'border-indigo-600 bg-indigo-50/20 dark:bg-indigo-950/10 shadow-sm ring-2 ring-indigo-600/10'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/10 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-black text-slate-950 dark:text-white leading-snug">{a.name}</p>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleAddon(a.id)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 accent-indigo-600 w-4 h-4 cursor-pointer"
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">{a.description}</p>
                        
                        {a.id === 'multi_store' && (
                          <div className="flex items-center gap-3 mt-2 mb-2" onClick={(e) => e.stopPropagation()}>
                            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">增加门店数量</label>
                            <input
                              type="number"
                              min="0"
                              value={multiStoreQty}
                              onChange={(e) => handleMultiStoreQtyChange(parseInt(e.target.value) || 0)}
                              className="w-20 px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                            />
                          </div>
                        )}

                        <ul className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/40">
                          {a.details.map((d) => (
                            <li key={d} className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">• {d}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="pt-3 text-right">
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                          {a.id === 'multi_store'
                            ? `每个新增门店$${a.usd}`
                            : `+$${a.usd} / 月`
                          }
                        </span>
                      </div>
                    </div>
                  )
                })}

                {/* One Time Addons */}
                {oneTimeAddonItems.map((a) => {
                  const isChecked = addonIds.includes(a.id)
                  return (
                    <div
                      key={a.id}
                      onClick={() => toggleAddon(a.id)}
                      className={`group cursor-pointer rounded-2xl border p-4 transition-all duration-200 flex flex-col justify-between ${
                        isChecked
                          ? 'border-indigo-600 bg-indigo-50/20 dark:bg-indigo-950/10 shadow-sm ring-2 ring-indigo-600/10'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/10 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-black text-slate-950 dark:text-white leading-snug">{a.name}</p>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleAddon(a.id)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 accent-indigo-600 w-4 h-4 cursor-pointer"
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">{a.description}</p>
                        <ul className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/40">
                          {a.details.map((d) => (
                            <li key={d} className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">• {d}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="pt-3 text-right">
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                          {a.id === 'onsite_photo'
                            ? `+$${a.usd} / 次 (含后期)`
                            : a.id === 'influencer_visit'
                              ? `+$${a.usd} / 季 (保曝光)`
                              : a.id === 'dianping_ops'
                                ? `+$${a.usd} / 年`
                                : `+$${a.usd} / 单次`
                          }
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Split Grid: Left side details check, Right side Billing receipt summary calculator */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Payment Mode & User Agreement */}
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
                <div>
                  <h3 className="text-sm font-black tracking-widest text-slate-700 dark:text-slate-300 uppercase flex items-center gap-2">
                    <CreditCard size={16} className="text-indigo-600" /> 4) 支付与激活方式
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    新加坡本地商家可直接使用本地 Billing 账单激活；非本地商家支持 Stripe 在线国际借记卡。
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setPaymentMode('ONLINE')}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      paymentMode === 'ONLINE'
                        ? 'border-indigo-600 bg-indigo-50/20 dark:bg-indigo-950/10 shadow-sm ring-2 ring-indigo-600/10'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <p className="text-sm font-black text-slate-950 dark:text-white">在线支付 / International Card</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">跳转至 Stripe 安全网关付款，支持 Visa / MasterCard 等，付款后系统自动创建品牌与 AI。</p>
                  </button>

                  <button
                    onClick={() => setPaymentMode('BILLING')}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      paymentMode === 'BILLING'
                        ? 'border-emerald-600 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-sm ring-2 ring-emerald-600/10'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-black text-slate-950 dark:text-white">账单模式 / SG local Billing 🇸🇬</p>
                      <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[8px] font-bold text-white uppercase leading-none shadow-sm">
                        推荐
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">确认账单后视为付款，后台团队将线下提供发票支票。订阅将立即可用。</p>
                  </button>
                </div>

                {/* Terms and Agreement */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{data.termsNotice}</p>
                    <button
                      onClick={() => setShowTerms(true)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      阅读完整协议全文
                    </button>
                  </div>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-0.5 accent-indigo-600 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                      我已仔细阅读并同意 《{data.termsTitle}》 ({data.termsVersion}) 全部条款内容
                    </span>
                  </label>
                </div>

                {/* Confirm Active Button Bar */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                  {!effectiveBrandId ? (
                    <button
                      onClick={() => setStep(1)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      <ChevronLeft size={14} /> 返回上一步修改品牌信息
                    </button>
                  ) : (
                    <div />
                  )}

                  <button
                    onClick={startCheckout}
                    disabled={(paymentMode === 'ONLINE' && !data.paymentEnabled) || submitting || confirming || !agreedToTerms}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 text-sm font-black transition-all shadow-md active:scale-95"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                    {paymentMode === 'ONLINE' ? '发起 Stripe 在线安全支付' : submitting ? '正在为您配置 AI 团队上岗...' : '确认并激活 AMC 订阅计划'}
                  </button>
                </div>

                {activationNotice && (
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/30 dark:bg-emerald-950/20 px-4 py-3 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    {activationNotice}
                  </div>
                )}
              </div>

              {/* Dynamic Invoice Breakdown Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <h4 className="text-xs font-black tracking-widest text-slate-400 dark:text-slate-500 uppercase">
                    实时账单明细 / Invoice Summary
                  </h4>
                  
                  {selectedPlan && pricingSummary ? (
                    <div className="space-y-3.5 text-xs">
                      
                      {/* Plan Row */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">AMC {selectedPlan.name}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            基础套餐价: ${pricingSummary.monthlyBaseUsd} / 月
                          </p>
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white">
                          ${pricingSummary.monthlyBaseUsd * pricingSummary.durationMonths}
                        </span>
                      </div>

                      {/* Addon details in breakdown */}
                      {addonIds.length > 0 && (
                        <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                            加购服务明细:
                          </p>
                          {addonIds.map((id) => {
                            const add = data.addons.find((a) => a.id === id)
                            if (!add) return null
                            const qty = id === 'multi_store' ? multiStoreQty : 1
                            const totalAddon = add.pricing === 'monthly' ? add.usd * durationMonths * qty : add.usd * qty
                            return (
                              <div key={id} className="flex items-start justify-between text-[11px]">
                                <div>
                                  <p className="font-medium text-slate-600 dark:text-slate-400">{add.name}</p>
                                  <p className="text-[9px] text-slate-400">
                                    {add.id === 'dianping_ops'
                                      ? `按年计费 (一次性): $${add.usd} / 年`
                                      : add.pricing === 'monthly'
                                        ? `按月 recurring: $${add.usd} × ${durationMonths}月${id === 'multi_store' ? ` × ${qty}店` : ''}`
                                        : `按次一次性结算`}
                                  </p>
                                </div>
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  ${totalAddon}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* contract duration details */}
                      <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1">
                        <div className="flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
                          <span>合同签约周期:</span>
                          <span>{durationMonths} 个月 ({billingCycle === 'yearly' ? '年付' : '季付'})</span>
                        </div>
                        {pricingSummary.discountPercent > 0 && (
                          <div className="flex justify-between text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            <span>签约折扣 (-{pricingSummary.discountPercent}%):</span>
                            <span>- ${pricingSummary.discountUsd}</span>
                          </div>
                        )}
                      </div>

                      {/* Total Pay summary box */}
                      <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-4 flex items-end justify-between">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">实付总额 / Total Due</p>
                          <p className="text-[9px] text-slate-400">Prices in USD, excl. tax</p>
                        </div>
                        <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 leading-none">
                          ${pricingSummary.totalDueUsd}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">请选择您的订阅计划</div>
                  )}
                </div>

                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 p-3.5 border border-slate-100 dark:border-slate-800/60 text-[10px] text-slate-500 space-y-2 leading-relaxed">
                  <p className="font-bold text-slate-700 dark:text-slate-300">📌 订阅后如何创建 AI 角色？</p>
                  <p>
                    支付完成后，系统将在后台自动部署分配专属的 API 身份，生成包含您时区、品牌、门店配置的工作上下文指令。您可以把指令导入客户端即可让 Crew 自动上岗代为管理内容、策略与口碑监控。
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* MODAL SHEET: FULL TERMS SCREEN */}
      {showTerms && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white leading-none">{data.termsTitle}</h3>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 block font-bold uppercase tracking-wider">
                  版本: {data.termsVersion}
                </span>
              </div>
              <button
                onClick={() => setShowTerms(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                关闭
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 md:p-5">
                <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans font-medium">{data.termsFullText}</pre>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-800 leading-relaxed">{data.termsNotice}</p>
            </div>
          </div>
        </div>
      )}

      {/* PROGRESS MODAL: AI CREW GENERATION TIMER */}
      {showAgentCreationModal && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200/50 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 md:p-8 space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="text-indigo-600 animate-pulse" />
                {agentCreationMode === 'update' ? '正在重载您的 AI 营销小组使命' : '正在为您激活专属 AI 营销小组成员'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                {agentCreationMode === 'update'
                  ? '正在同步最新的套餐权限、门店工作重点与品牌执行策略...'
                  : '正在分配安全连接密钥（API API Key）、初始化背景档案并装载执行环境...'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${agentCreationProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>部署进度</span>
                <span>{agentCreationProgress}%</span>
              </div>
            </div>

            <div className="space-y-2 text-xs border-t border-slate-100 dark:border-slate-800 pt-4">
              <p className={`flex items-center gap-2 ${agentCreationProgress >= 20 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                {agentCreationProgress >= 20 ? '✓' : '•'} {agentCreationMode === 'update' ? '已读取新套餐权限与目标设定' : '已分配专属 AI 员工 API 身份令牌'}
              </p>
              <p className={`flex items-center gap-2 ${agentCreationProgress >= 50 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                {agentCreationProgress >= 50 ? '✓' : '•'} {agentCreationMode === 'update' ? '已刷新品牌与门店运营上下文环境' : '已初始化并挂载主门店运营档案'}
              </p>
              <p className={`flex items-center gap-2 ${agentCreationProgress >= 80 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                {agentCreationProgress >= 80 ? '✓' : '•'} {agentCreationMode === 'update' ? '已重新打包 AI 初始化连接指令' : '已预备生成 AI 员工初始化连接指令'}
              </p>
              <p className={`flex items-center gap-2 ${agentCreationProgress >= 100 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                {agentCreationProgress >= 100 ? '✓' : '•'} {agentCreationMode === 'update' ? 'AI 员工重部署全部完成！' : 'AI 员工团队已全部就绪并准备上岗！'}
              </p>
            </div>

            <p className="text-[10px] text-slate-400 text-center">
              {agentCreationDone
                ? '重定向至激活结果，正在开启连接入口...'
                : '预计耗时约 30 秒，请勿关闭或刷新该页面。'}
            </p>
          </div>
        </div>
      )}

    </div>
  )
}
