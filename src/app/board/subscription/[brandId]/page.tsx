'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { CheckCircle2, CreditCard, Loader2 } from 'lucide-react'

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
  brand: { id: string; name: string }
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
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

export default function BrandSubscriptionPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const brandId = String(params.brandId)

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
  const [paymentMode, setPaymentMode] = useState<'ONLINE' | 'OFFLINE'>('ONLINE')
  const [userRole, setUserRole] = useState<string>('USER')

  const success = searchParams?.get('success') === '1'
  const canceled = searchParams?.get('canceled') === '1'
  const checkoutSessionId = searchParams?.get('sid') || ''
  const subscriptionId = searchParams?.get('sub') || ''

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/brands/${brandId}/subscription`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load subscription data')
        setData(json)
        if (json.plans?.[0]?.id) setPlanId(json.plans[0].id)
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Failed to load'))
      } finally {
        setLoading(false)
      }
    }
    if (brandId) load()
  }, [brandId])

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const me = await res.json()
          setUserRole(me.role || 'USER')
        }
      } catch {
        // noop
      }
    }
    fetchMe()

    const confirmPayment = async () => {
      if (!success || !checkoutSessionId || !subscriptionId || !brandId) return
      setConfirming(true)
      setError(null)
      try {
        const res = await fetch(`/api/brands/${brandId}/subscription/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkoutSessionId, subscriptionId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Payment confirmation failed')

        const fresh = await fetch(`/api/brands/${brandId}/subscription`)
        const freshJson = await fresh.json()
        if (fresh.ok) setData(freshJson)
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Payment confirmation failed'))
      } finally {
        setConfirming(false)
      }
    }
    confirmPayment()
  }, [success, checkoutSessionId, subscriptionId, brandId])

  const billingCycle: 'monthly' | 'yearly' = durationMonths === 12 ? 'yearly' : 'monthly'

  const selectedPlan = useMemo(() => data?.plans.find((p) => p.id === planId), [data?.plans, planId])
  const selectedPlanMonthly = selectedPlan?.promoMonthlyUsd ?? selectedPlan?.monthlyUsd ?? 0
  const selectedPlanOriginalMonthly = selectedPlan?.monthlyUsd ?? 0
  const selectedPlanAccent =
    selectedPlan?.id === 'starter'
      ? 'from-teal-400 via-cyan-500 to-sky-600'
      : selectedPlan?.id === 'essential'
        ? 'from-cyan-400 via-sky-500 to-blue-600'
        : selectedPlan?.id === 'premium'
          ? 'from-sky-400 via-cyan-500 to-blue-700'
          : 'from-emerald-400 via-teal-500 to-cyan-600'
  const selectedAddons = useMemo(
    () => (data?.addons || []).filter((a) => addonIds.includes(a.id)),
    [data, addonIds]
  )
  const recommendedPlanId = !data?.plans?.length
    ? ''
    : data.plans.find((p) => p.id === 'premium')?.id || data.plans[Math.min(2, data.plans.length - 1)].id

  const monthlyAddons = (data?.addons || []).filter((a) => a.pricing === 'monthly')
  const oneTimeAddonItems = (data?.addons || []).filter((a) => a.pricing === 'one_time')

  const recurringAddons = selectedAddons.filter((a) => a.pricing === 'monthly').reduce((sum, a) => sum + a.usd, 0)
  const oneTimeAddons = selectedAddons.filter((a) => a.pricing === 'one_time').reduce((sum, a) => sum + a.usd, 0)
  const monthlyBase = selectedPlanMonthly
  const recurringSubtotal = (monthlyBase + recurringAddons) * durationMonths
  const discountPercent = durationMonths === 12 ? 10 : 0
  const recurringAfterDiscount = Math.round(recurringSubtotal * (1 - discountPercent / 100))
  const discountAmount = recurringSubtotal - recurringAfterDiscount
  const totalDue = recurringAfterDiscount + oneTimeAddons

  const toggleAddon = (id: string) => {
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  const startCheckout = async () => {
    if (!selectedPlan || !data) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan.id,
          durationMonths,
          addonIds,
          paymentMode,
          agreedToTerms,
          termsVersion: data.termsVersion,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create checkout session')

      if (json.paymentMode === 'OFFLINE') {
        const fresh = await fetch(`/api/brands/${brandId}/subscription`)
        const freshJson = await fresh.json()
        if (fresh.ok) setData(freshJson)
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

  const updateSubscriptionStatus = async (status: 'PENDING' | 'ACTIVE' | 'FAILED' | 'CANCELLED') => {
    if (!data?.latestSubscription?.id) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/subscriptions/${data.latestSubscription.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update status')

      const fresh = await fetch(`/api/brands/${brandId}/subscription`)
      const freshJson = await fresh.json()
      if (fresh.ok) setData(freshJson)
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update status'))
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
    <div className="min-h-screen relative overflow-hidden bg-[#0f172a] p-4 md:p-8 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(34,211,238,0.14),_transparent_30%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(17,24,39,1),_rgba(11,18,32,1))]" />
      <div className="absolute -top-32 -left-24 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" />
      <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />

      <div className="relative max-w-7xl mx-auto space-y-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 md:p-7 shadow-2xl backdrop-blur-xl">
          <div className={`absolute inset-0 bg-gradient-to-br ${selectedPlanAccent} opacity-12`} />
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-12 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-100">
                AMC Subscription Center
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                live pricing
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">AMC 订阅中心</h1>
                <p className="mt-3 max-w-2xl text-sm md:text-base text-slate-300 leading-7">
                  品牌：<span className="font-bold text-white">{data.brand.name}</span>。套餐、增值服务、合同周期与协议统一在一个页面完成对比、选择和支付。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-semibold text-slate-200">Google Map included</span>
                <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-semibold text-slate-200">3 / 6 / 12 months</span>
                <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-semibold text-slate-200">Online + offline billing</span>
                {selectedPlan?.promoMonthlyUsd ? (
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
                    当前选中 {selectedPlan.name} 促销价 USD ${selectedPlanMonthly}/月
                  </span>
                ) : (
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
                    当前选中 {selectedPlan?.name || 'PLAN'} USD ${selectedPlanMonthly}/月
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">entry offer</p>
                  <p className="mt-1 text-sm font-bold text-white">Starter promo USD ${data.plans.find((p) => p.id === 'starter')?.promoMonthlyUsd ?? '108'}/mo</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">brand coverage</p>
                  <p className="mt-1 text-sm font-bold text-white">All packages include Google Map</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">contract ready</p>
                  <p className="mt-1 text-sm font-bold text-white">Full agreement, no blanks</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:min-w-[340px]">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">selected plan</p>
                <p className="mt-2 text-lg font-black text-white">{selectedPlan?.name || 'Starter'}</p>
                <p className="mt-1 text-xs text-slate-300 leading-5">{selectedPlan?.description || '请选择一个套餐进行对比'}</p>
              </div>
              <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${selectedPlanAccent} p-4 backdrop-blur-sm shadow-[0_18px_50px_rgba(2,132,199,0.22)]`}>
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">estimated total</p>
                <p className="mt-2 text-2xl font-black text-white">USD ${totalDue}</p>
                <p className="mt-1 text-xs text-slate-100/90 leading-5">当前周期 {durationMonths} 个月，含已选增值服务。</p>
              </div>
            </div>
          </div>
        </div>

        {confirming && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-100 px-4 py-3 text-sm font-medium backdrop-blur-sm">
            正在确认支付结果，请稍候...
          </div>
        )}

        {canceled && (
          <div className="rounded-2xl border border-white/10 bg-white/8 text-slate-200 px-4 py-3 text-sm font-medium backdrop-blur-sm">
            您已取消本次支付，订单保留为待支付状态，可重新发起支付。
          </div>
        )}

        {data.latestSubscription?.status === 'ACTIVE' && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-100 px-4 py-3 text-sm font-medium flex items-center gap-2 backdrop-blur-sm">
            <CheckCircle2 size={16} /> 当前订阅已生效：{data.latestSubscription.planName}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 text-rose-100 px-4 py-3 text-sm font-medium backdrop-blur-sm">
            {error}
          </div>
        )}

        {!data.paymentEnabled && paymentMode === 'ONLINE' && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-100 px-4 py-3 text-sm backdrop-blur-sm">
            当前环境未配置在线支付（缺少 STRIPE_SECRET_KEY）。请先配置后再发起支付。
          </div>
        )}

        <section className="rounded-[1.75rem] border border-white/10 bg-gradient-to-r from-teal-500/18 via-cyan-500/12 to-sky-700/18 p-5 md:p-6 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200">conversion ready</p>
              <h2 className="text-2xl md:text-3xl font-black text-white">选好套餐后，直接开始上线。</h2>
              <p className="text-sm md:text-base leading-7 text-slate-300">
                当前方案已经把价格、权益、协议和支付路径放在同一个页面里，减少来回沟通。你只需要确认套餐和周期，剩下的交给 AMC。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 lg:min-w-[320px]">
              <button
                onClick={startCheckout}
                disabled={(paymentMode === 'ONLINE' && !data.paymentEnabled) || submitting || confirming || !agreedToTerms}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-black text-slate-950 shadow-[0_20px_50px_rgba(255,255,255,0.18)] transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {paymentMode === 'ONLINE' ? '立即在线支付' : '创建线下账单'}
              </button>
              <button
                onClick={() => setShowTerms(true)}
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/8 px-5 py-3.5 text-sm font-bold text-white hover:bg-white/12"
              >
                先看完整协议
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">fast start</p>
              <p className="mt-2 text-sm text-slate-200 leading-6">套餐、合同周期和加购在一个页面完成，减少反复确认。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">built-in trust</p>
              <p className="mt-2 text-sm text-slate-200 leading-6">所有套餐包含 Google Map，协议内容已完整补齐，可直接签署。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">clear value</p>
              <p className="mt-2 text-sm text-slate-200 leading-6">Starter 促销价 USD ${selectedPlanOriginalMonthly ? selectedPlanMonthly : 108}/月，适合快速试跑。</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-[1.75rem] border border-white/10 bg-white/7 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-200">1) Price Plans</h2>
                  <p className="text-xs text-slate-400 mt-1">参考 SaaS pricing 结构：先切换计费周期，再横向比较 plan。</p>
                </div>
                <p className="text-xs text-slate-400">* Prices in USD, excluding tax</p>
              </div>

              <div className="mb-6 flex justify-center">
                <div className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 p-1.5">
                  <button
                    onClick={() => {
                      setDurationMonths(3)
                    }}
                    className={`rounded-full px-6 py-2 text-sm font-bold transition ${
                      billingCycle === 'monthly' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => {
                      setDurationMonths(12)
                    }}
                    className={`rounded-full px-6 py-2 text-sm font-bold transition ${
                      billingCycle === 'yearly' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Yearly
                  </button>
                  <span className="rounded-full bg-blue-500/15 px-3 py-1.5 text-xs font-bold text-blue-200">Save 10%</span>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
                {data.plans.map((p) => {
                  const isSelected = planId === p.id
                  const isRecommended = p.id === recommendedPlanId
                  const baseMonthly = p.promoMonthlyUsd ?? p.monthlyUsd
                  const cycleMonthly = billingCycle === 'yearly' ? Math.round(baseMonthly * 0.9) : baseMonthly
                  const cycleTotal = cycleMonthly * (billingCycle === 'yearly' ? 12 : 3)

                  return (
                    <button
                      key={p.id}
                      onClick={() => setPlanId(p.id)}
                      className={`group relative overflow-hidden text-left rounded-[1.25rem] border bg-white/95 p-0 shadow-sm transition-all duration-300 hover:-translate-y-1 ${
                        isSelected
                          ? 'border-blue-500 ring-2 ring-blue-400/40 shadow-[0_20px_45px_rgba(37,99,235,0.25)]'
                          : 'border-slate-200/70 hover:border-blue-300'
                      }`}
                    >
                      <div className={`px-4 py-2 text-center text-[11px] font-black tracking-[0.15em] ${
                        isSelected
                          ? 'bg-slate-800 text-white'
                          : isRecommended
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-500'
                      }`}>
                        {isSelected ? 'CURRENT PLAN' : isRecommended ? 'RECOMMENDED FOR YOU' : 'AVAILABLE PLAN'}
                      </div>
                      <div className="p-5">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-2xl font-black text-slate-900">{p.name}</h3>
                            <p className="mt-1 text-sm text-slate-500 leading-6">{p.description}</p>
                          </div>
                        </div>

                        <div className="mb-4">
                          <div className="flex items-end gap-2">
                            <span className="text-5xl font-black leading-none text-slate-900">${cycleMonthly}</span>
                            <span className="pb-1 text-sm font-semibold text-slate-700">/ month</span>
                          </div>
                          {billingCycle === 'yearly' && (
                            <p className="mt-1 text-xs text-blue-700 font-semibold">Billed yearly at USD ${cycleTotal} (10% off)</p>
                          )}
                          {billingCycle === 'monthly' && (
                            <p className="mt-1 text-xs text-slate-500">3-month contract billing cycle</p>
                          )}
                        </div>

                        <div className={`mb-4 rounded-full px-4 py-2 text-center text-base font-black transition ${
                          isSelected
                            ? 'bg-slate-200 text-slate-600'
                            : isRecommended
                              ? 'bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)]'
                              : 'border border-blue-500 text-blue-600 bg-white'
                        }`}>
                          {isSelected ? 'Current plan' : 'Upgrade now'}
                        </div>

                        <ul className="space-y-2 text-sm text-slate-700">
                          {p.includes.slice(0, 4).map((item) => (
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
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl">
              <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-200 mb-4">2) 合同周期</h2>
              <div className="grid grid-cols-3 gap-3">
                {data.durations.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDurationMonths(d)}
                    className={`rounded-2xl border py-3 text-sm font-bold transition-all duration-200 ${
                      durationMonths === d
                        ? 'border-white/25 bg-white/12 text-white shadow-[0_14px_30px_rgba(59,130,246,0.18)]'
                        : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/8'
                    }`}
                  >
                    {d} 个月{d === 12 ? '（10%折扣）' : ''}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-200">3) Add-on Services</h2>
                  <p className="text-xs text-slate-400 mt-1">分为 Monthly add-ons 与 One-time services，结构更清晰。</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">Monthly add-ons</h3>
                    <span className="text-xs text-slate-400">Recurring</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {monthlyAddons.map((a) => (
                      <label
                        key={a.id}
                        className={`group cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                          addonIds.includes(a.id)
                            ? 'border-cyan-300/50 bg-cyan-400/10 shadow-[0_12px_28px_rgba(34,211,238,0.2)]'
                            : 'border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20'
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
                              <p className="text-sm font-bold text-white">{a.name}</p>
                              <p className="text-xs font-black text-cyan-200 whitespace-nowrap">+USD {a.usd}/mo</p>
                            </div>
                            <p className="mt-1 text-xs text-slate-300">{a.description}</p>
                            <ul className="mt-2 space-y-1">
                              {a.details.slice(0, 2).map((d) => (
                                <li key={d} className="text-[11px] text-slate-400">• {d}</li>
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
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">One-time services</h3>
                    <span className="text-xs text-slate-400">Single payment</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {oneTimeAddonItems.map((a) => (
                      <label
                        key={a.id}
                        className={`group cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                          addonIds.includes(a.id)
                            ? 'border-indigo-300/50 bg-indigo-400/10 shadow-[0_12px_28px_rgba(99,102,241,0.2)]'
                            : 'border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20'
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
                              <p className="text-sm font-bold text-white">{a.name}</p>
                              <p className="text-xs font-black text-indigo-200 whitespace-nowrap">USD {a.usd} one-time</p>
                            </div>
                            <p className="mt-1 text-xs text-slate-300">{a.description}</p>
                            <ul className="mt-2 space-y-1">
                              {a.details.slice(0, 2).map((d) => (
                                <li key={d} className="text-[11px] text-slate-400">• {d}</li>
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

            <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl">
              <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-200 mb-3">4) 支付方式</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => setPaymentMode('ONLINE')}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${paymentMode === 'ONLINE' ? 'border-white/25 bg-white/10 shadow-[0_12px_30px_rgba(56,189,248,0.18)]' : 'border-white/10 bg-white/5 hover:bg-white/8'}`}
                >
                  <p className="text-sm font-bold text-white">在线支付</p>
                  <p className="text-xs text-slate-300 mt-1">立即跳转支付，支付成功后自动激活订阅。</p>
                </button>
                <button
                  onClick={() => setPaymentMode('OFFLINE')}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${paymentMode === 'OFFLINE' ? 'border-white/25 bg-white/10 shadow-[0_12px_30px_rgba(56,189,248,0.18)]' : 'border-white/10 bg-white/5 hover:bg-white/8'}`}
                >
                  <p className="text-sm font-bold text-white">线下账单支付</p>
                  <p className="text-xs text-slate-300 mt-1">提交后生成线下账单，待 Admin / Admin AI 确认到账并更新状态。</p>
                </button>
              </div>

              <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-200 mb-3">5) 用户协议</h2>
              <p className="text-xs text-slate-400 mb-3">{data.termsNotice}</p>
              <button
                onClick={() => setShowTerms(true)}
                className="text-sm font-bold text-cyan-200 hover:text-white"
              >
                查看完整用户协议
              </button>
              <label className="mt-3 flex items-start gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5 accent-cyan-400" />
                <span>我已阅读并同意 {data.termsTitle}（{data.termsVersion}）</span>
              </label>
            </section>

            {paymentMode === 'OFFLINE' && data.latestSubscription?.paymentProvider === 'OFFLINE' && (
              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-200 mb-3">线下账单状态</h2>
                <p className="text-sm text-slate-300">当前状态：<span className="font-bold text-white">{data.latestSubscription.status}</span></p>
                {userRole === 'ADMIN' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => updateSubscriptionStatus('ACTIVE')} className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">标记已支付</button>
                    <button onClick={() => updateSubscriptionStatus('PENDING')} className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-700 text-white border border-white/10">标记待支付</button>
                    <button onClick={() => updateSubscriptionStatus('FAILED')} className="px-3 py-1.5 rounded-full text-xs font-bold bg-rose-500 text-white shadow-lg shadow-rose-500/20">标记失败</button>
                    <button onClick={() => updateSubscriptionStatus('CANCELLED')} className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500 text-white shadow-lg shadow-amber-500/20">标记取消</button>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <div className="sticky top-6 rounded-[1.75rem] border border-white/10 bg-white/8 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.22em] text-slate-200">付款汇总</h3>
                  <p className="text-xs text-slate-400 mt-1">实时更新选中的套餐、周期和加购。</p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-bold text-slate-200">
                  secure summary
                </div>
              </div>

              <div className="mb-4 rounded-[1.25rem] border border-white/10 bg-gradient-to-br from-cyan-400/20 via-blue-500/15 to-indigo-600/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">selected total</p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-black text-white">USD ${totalDue}</p>
                    <p className="text-xs text-slate-200/90 mt-1">{durationMonths} 个月周期 + 选中加购</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-bold text-white">
                    ready to checkout
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between rounded-2xl border border-white/8 bg-black/15 px-3 py-2.5">
                  <span className="text-slate-500">套餐月费</span>
                  <span className="text-right">
                    {selectedPlan?.promoMonthlyUsd ? (
                      <>
                        <span className="block text-[11px] text-slate-400 line-through">USD ${selectedPlanOriginalMonthly}</span>
                        <span className="block font-bold text-cyan-200">USD ${monthlyBase}</span>
                      </>
                    ) : (
                      <span>USD ${monthlyBase}</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between rounded-2xl border border-white/8 bg-black/15 px-3 py-2.5">
                  <span className="text-slate-500">按月加购合计</span>
                  <span className="text-slate-100">USD ${recurringAddons}</span>
                </div>
                <div className="flex justify-between rounded-2xl border border-white/8 bg-black/15 px-3 py-2.5">
                  <span className="text-slate-500">周期原价</span>
                  <span className="text-slate-100">USD ${recurringSubtotal}</span>
                </div>
                <div className="flex justify-between rounded-2xl border border-white/8 bg-black/15 px-3 py-2.5">
                  <span className="text-slate-500">周期折扣</span>
                  <span className="text-slate-100">{discountPercent > 0 ? `${discountPercent}%` : '无'}</span>
                </div>
                <div className="flex justify-between rounded-2xl border border-white/8 bg-black/15 px-3 py-2.5">
                  <span className="text-slate-500">折扣减免</span>
                  <span className="text-slate-100">- USD ${discountAmount}</span>
                </div>
                <div className="flex justify-between rounded-2xl border border-white/8 bg-black/15 px-3 py-2.5">
                  <span className="text-slate-500">按次加购合计</span>
                  <span className="text-slate-100">USD ${oneTimeAddons}</span>
                </div>
                <div className="flex justify-between rounded-2xl border border-white/8 bg-black/15 px-3 py-2.5">
                  <span className="text-slate-500">合同周期</span>
                  <span className="text-slate-100">{durationMonths} 个月</span>
                </div>
                <div className="pt-2 mt-2 border-t border-white/10 flex justify-between text-base font-black">
                  <span>应付总额</span>
                  <span className="text-white">USD ${totalDue}</span>
                </div>
              </div>

              <button
                onClick={startCheckout}
                disabled={(paymentMode === 'ONLINE' && !data.paymentEnabled) || submitting || confirming || !agreedToTerms}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white font-bold shadow-[0_18px_50px_rgba(37,99,235,0.35)] transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {submitting ? '处理中...' : paymentMode === 'ONLINE' ? '在线支付并订阅' : '创建线下账单'}
              </button>
              <p className="text-[11px] text-slate-400 mt-2 leading-5">
                按 AMC 服务协议：合同费用一次性预付；12 个月按 90% 折扣计算。
              </p>
            </div>
          </aside>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-[1.75rem] border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white">{data.termsTitle}</h3>
                <p className="text-xs text-slate-400 mt-1">{data.termsVersion}</p>
              </div>
              <button onClick={() => setShowTerms(false)} className="text-sm font-semibold text-slate-300 hover:text-white">关闭</button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <pre className="whitespace-pre-wrap text-sm text-slate-200 leading-relaxed font-sans">{data.termsFullText}</pre>
              </div>
              <p className="text-xs text-slate-400 pt-2 border-t border-white/10">{data.termsNotice}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
