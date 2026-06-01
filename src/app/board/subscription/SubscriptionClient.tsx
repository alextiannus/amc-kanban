'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Copy, CreditCard, Loader2 } from 'lucide-react'
import { buildLaunchInstruction } from '@/lib/agentInitPrompt'

const AI_CREW_CREATION_DURATION_MS = 30_000

type AgentCreationMode = 'create' | 'update'

type Plan = {
  id: string
  name: string
  monthlyUsd: number
  promoMonthlyUsd?: number
  description: string
  includes: string[]
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
  latestSubscription?: { id?: string; status?: string; planName?: string; paymentProvider?: string }
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

function resolveCurrentPlanId(payload: SubscriptionPayload | null): string | null {
  if (!payload) return null
  const fromContext = payload.instructionContext?.subscription?.planId
  if (fromContext) return fromContext

  const activePlanName = payload.latestSubscription?.planName
  if (!activePlanName) return null
  return payload.plans.find((p) => p.name === activePlanName)?.id || null
}

export default function BrandSubscriptionPage() {
  const router = useRouter()
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

  const success = searchParams?.get('success') === '1'
  const canceled = searchParams?.get('canceled') === '1'
  const checkoutSessionId = searchParams?.get('sid') || ''
  const subscriptionId = searchParams?.get('sub') || ''

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/subscription')
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
  }, [])

  useEffect(() => {
    const confirmPayment = async () => {
      if (!success || !checkoutSessionId || !subscriptionId) return
      setConfirming(true)
      setError(null)
      try {
        const res = await fetch('/api/subscription/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkoutSessionId, subscriptionId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Payment confirmation failed')

        const fresh = await fetch('/api/subscription')
        const freshJson = await fresh.json()
        if (fresh.ok) {
          setData(freshJson)
          const currentPlanId = resolveCurrentPlanId(freshJson)
          if (currentPlanId) setPlanId(currentPlanId)
          beginAgentCreationExperience(currentPlanId && currentPlanId !== resolveCurrentPlanId(freshJson) ? 'update' : 'create')
        }
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Payment confirmation failed'))
      } finally {
        setConfirming(false)
      }
    }
    confirmPayment()
  }, [success, checkoutSessionId, subscriptionId])

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

  const toggleAddon = (id: string) => {
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
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
          planId: selectedPlan.id,
          durationMonths,
          addonIds,
          paymentMode,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          agreedToTerms,
          termsVersion: data.termsVersion,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create checkout session')

      if (json.paymentMode === 'BILLING') {
        const fresh = await fetch('/api/subscription')
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-rose-600">
        {error || 'Failed to load subscription module'}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 shadow-sm">
          <div className="space-y-3">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <ArrowLeft size={14} /> 返回上一页
            </button>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white">AI Marketing Crew (AMC) Plan</h1>
            <p className="max-w-3xl text-sm md:text-base text-slate-600 dark:text-slate-300 leading-7">
              为品牌提供持续的 AI 营销执行能力，一站式覆盖内容策划、发布协同与运营闭环。
            </p>
          </div>
        </div>

        {confirming && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-200 px-4 py-3 text-sm font-medium">
            正在确认支付结果，请稍候...
          </div>
        )}

        {canceled && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-4 py-3 text-sm font-medium shadow-sm">
            您已取消本次支付，订单保留为待支付状态，可重新发起支付。
          </div>
        )}

        {((success || data.latestSubscription?.status === 'ACTIVE') && instructionText && (!activationJustCompleted || agentCreationDone)) && (
          <section ref={instructionCardRef} className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30 p-4 md:p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-200">
                <CheckCircle2 size={16} /> {(data.brand?.name || '当前账号')} · 当前订阅已生效：{data.latestSubscription?.planName || '套餐已生效'}
              </div>
              <button
                onClick={copyInstruction}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Copy size={14} /> {copiedInstruction ? '已复制初始化指令' : '复制 Agent 初始化指令'}
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-200 px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
                <div>
                  <h2 className="text-sm font-black tracking-[0.18em] text-slate-700 dark:text-slate-200">1) AI Marketing Crew (AMC) Plan</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">订阅 AMC 后即可获得持续的 AI 营销协作能力。</p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">* Prices in USD, excluding tax</p>
              </div>

              <div className="mb-6 flex justify-center">
                <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-1.5">
                  <button
                    onClick={() => setDurationMonths(3)}
                    className={`rounded-full px-6 py-2 text-sm font-bold transition ${
                      billingCycle === 'quarterly' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    季度订阅
                  </button>
                  <button
                    onClick={() => setDurationMonths(12)}
                    className={`relative rounded-full px-6 py-2 text-sm font-bold transition ${
                      billingCycle === 'yearly' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    年度订阅
                    <span className="absolute -top-2.5 -right-2.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-white leading-none shadow-sm">-10%</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto -mx-1 px-1">
              <div className="mx-auto flex w-full max-w-[1120px] gap-5 pb-1">
                {data.plans.map((p) => {
                  const isSelected = planId === p.id
                  const isCurrentPlan = currentPlanId === p.id
                  const isRecommended = p.id === recommendedPlanId
                  const baseMonthly = p.promoMonthlyUsd ?? p.monthlyUsd
                  const cycleMonthly = billingCycle === 'yearly' ? Math.round(baseMonthly * 0.9) : baseMonthly
                  const cycleTotal = cycleMonthly * (billingCycle === 'yearly' ? 12 : 3)

                  return (
                    <button
                      key={p.id}
                      onClick={() => setPlanId(p.id)}
                      className={`group relative min-w-[380px] max-w-[380px] flex-1 overflow-hidden text-left rounded-2xl border p-0 shadow-sm transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20'
                          : isCurrentPlan
                            ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className={`px-4 py-2 text-center text-[11px] font-black tracking-[0.15em] ${
                        isSelected
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white'
                          : isCurrentPlan
                            ? 'bg-emerald-500 text-white'
                          : isRecommended
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                      }`}>
                        {isSelected ? '当前选择' : isCurrentPlan ? '当前套餐' : isRecommended ? '推荐' : '可选'}
                      </div>
                      <div className="p-5">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white">{p.name}</h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-6">{p.description}</p>
                          </div>
                        </div>

                        <div className="mb-4">
                          <div className="flex items-end gap-2">
                            <span className="text-5xl font-black leading-none text-slate-900 dark:text-white">${cycleMonthly}</span>
                            <span className="pb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">/ month</span>
                          </div>
                          {billingCycle === 'yearly' && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-semibold">年付 USD ${cycleTotal} · 已享 9 折</p>
                          )}
                          {billingCycle === 'quarterly' && (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">季度付 USD ${cycleTotal} / 3 个月</p>
                          )}
                        </div>

                        <div className={`mb-4 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition ${
                          isSelected
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200'
                            : isRecommended
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900'
                        }`}>
                          {isSelected ? '已选择' : '选择此套餐'}
                        </div>

                        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                          {p.includes.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </button>
                  )
                })}
              </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black tracking-[0.18em] text-slate-700 dark:text-slate-200">2) 增值服务</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">可按月或按次选择额外服务。</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-black tracking-[0.18em] text-slate-500 dark:text-slate-300">按月加购</h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Recurring</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {monthlyAddons.map((a) => (
                      <label
                        key={a.id}
                        className={`group cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                          addonIds.includes(a.id)
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={addonIds.includes(a.id)}
                            onChange={() => toggleAddon(a.id)}
                            className="mt-1 accent-cyan-400"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-bold text-slate-900 dark:text-white">{a.name}</p>
                              <p className="text-xs font-black text-blue-700 dark:text-blue-300 whitespace-nowrap">+USD {a.usd}/mo</p>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{a.description}</p>
                            <ul className="mt-2 space-y-1">
                              {a.details.slice(0, 2).map((d) => (
                                <li key={d} className="text-[11px] text-slate-500 dark:text-slate-400">• {d}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-black tracking-[0.18em] text-slate-500 dark:text-slate-300">按次服务</h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Single payment</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {oneTimeAddonItems.map((a) => (
                      <label
                        key={a.id}
                        className={`group cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                          addonIds.includes(a.id)
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={addonIds.includes(a.id)}
                            onChange={() => toggleAddon(a.id)}
                            className="mt-1 accent-indigo-400"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-bold text-slate-900 dark:text-white">{a.name}</p>
                              <p className="text-xs font-black text-blue-700 dark:text-blue-300 whitespace-nowrap">USD {a.usd} one-time</p>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{a.description}</p>
                            <ul className="mt-2 space-y-1">
                              {a.details.slice(0, 2).map((d) => (
                                <li key={d} className="text-[11px] text-slate-500 dark:text-slate-400">• {d}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <h2 className="text-sm font-black tracking-[0.18em] text-slate-700 dark:text-slate-200 mb-3">3) 支付方式</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => setPaymentMode('ONLINE')}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${paymentMode === 'ONLINE' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  <p className="text-sm font-bold text-slate-900 dark:text-white">在线支付</p>
                  <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">立即跳转支付，支付成功后自动激活订阅。</p>
                </button>
                <button
                  onClick={() => setPaymentMode('BILLING')}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${paymentMode === 'BILLING' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  <p className="text-sm font-bold text-slate-900 dark:text-white">账单模式 🇸🇬</p>
                  <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">新加坡本地用户适用。确认账单后视为已付款，订阅立即激活。</p>
                </button>
              </div>

              <h2 className="text-sm font-black tracking-[0.18em] text-slate-700 dark:text-slate-200 mb-3">用户协议</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{data.termsNotice}</p>
              <button
                onClick={() => setShowTerms(true)}
                className="text-sm font-bold text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200"
              >
                查看完整用户协议
              </button>
              <label className="mt-3 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5 accent-cyan-400" />
                <span>我已阅读并同意 {data.termsTitle}（{data.termsVersion}）</span>
              </label>

              <button
                onClick={startCheckout}
                disabled={(paymentMode === 'ONLINE' && !data.paymentEnabled) || submitting || confirming || !agreedToTerms}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {paymentMode === 'ONLINE' ? '立即在线支付' : submitting ? '正在激活订阅计划...' : '确认并激活订阅计划'}
              </button>

              {activationNotice && (
                <div className="mt-3 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-200">
                  {activationNotice}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">{data.termsTitle}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{data.termsVersion}</p>
              </div>
              <button onClick={() => setShowTerms(false)} className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">关闭</button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
                <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-sans">{data.termsFullText}</pre>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">{data.termsNotice}</p>
            </div>
          </div>
        </div>
      )}

      {showAgentCreationModal && (
        <div className="fixed inset-0 z-[70] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {agentCreationMode === 'update' ? '正在更新你的 AI 员工使命' : '正在创建你的 AI 员工'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">
                {agentCreationMode === 'update'
                  ? '正在同步新的订阅计划、工作边界与执行重点。'
                  : '正在生成连接身份、初始化工作档案并准备接入环境。'}
              </p>
            </div>

            <div className="px-6 py-6 space-y-5">
              <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${agentCreationProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-300">
                <span>创建进度</span>
                <span>{agentCreationProgress}%</span>
              </div>

              <div className="space-y-2 text-sm">
                <p className={`${agentCreationProgress >= 20 ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {agentCreationProgress >= 20 ? '✓' : '•'} {agentCreationMode === 'update' ? '同步新的套餐权限与目标范围' : '分配 AI 员工连接身份（API Key）'}
                </p>
                <p className={`${agentCreationProgress >= 50 ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {agentCreationProgress >= 50 ? '✓' : '•'} {agentCreationMode === 'update' ? '重载协作档案与执行策略' : '初始化协作档案与基础权限'}
                </p>
                <p className={`${agentCreationProgress >= 80 ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {agentCreationProgress >= 80 ? '✓' : '•'} {agentCreationMode === 'update' ? '刷新初始化指令与接入流程' : '预热接入流程并准备初始化指令'}
                </p>
                <p className={`${agentCreationProgress >= 100 ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {agentCreationProgress >= 100 ? '✓' : '•'} {agentCreationMode === 'update' ? '完成，可按新使命继续执行' : '完成，可开始连接平台'}
                </p>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {agentCreationDone
                  ? 'AI 员工创建完成，正在打开初始化入口...'
                  : '预计耗时约 30 秒，请勿关闭当前页面。'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
