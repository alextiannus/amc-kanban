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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 md:p-7 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-slate-600 dark:text-slate-300">
                AMC Subscription
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white">订阅计划</h1>
                <p className="mt-3 max-w-2xl text-sm md:text-base text-slate-600 dark:text-slate-300 leading-7">
                  品牌：<span className="font-bold text-slate-900 dark:text-white">{data.brand.name}</span>。在这里查看套餐、加购服务、合同周期和付款信息。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Google Map included</span>
                <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">3 / 6 / 12 months</span>
                <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Online + offline billing</span>
                {selectedPlan?.promoMonthlyUsd ? (
                  <span className="rounded-full border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    当前选中 {selectedPlan.name} 促销价 USD ${selectedPlanMonthly}/月
                  </span>
                ) : (
                  <span className="rounded-full border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    当前选中 {selectedPlan?.name || 'PLAN'} USD ${selectedPlanMonthly}/月
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">starter</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">USD ${data.plans.find((p) => p.id === 'starter')?.promoMonthlyUsd ?? '108'}/mo</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">coverage</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">All packages include Google Map</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">agreement</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">Terms and billing are shown below</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:min-w-[340px]">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">selected plan</p>
                <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">{selectedPlan?.name || 'Starter'}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-5">{selectedPlan?.description || '请选择一个套餐进行对比'}</p>
              </div>
              <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">estimated total</p>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">USD ${totalDue}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-5">当前周期 {durationMonths} 个月，含已选增值服务。</p>
              </div>
            </div>
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

        {data.latestSubscription?.status === 'ACTIVE' && (
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-200 px-4 py-3 text-sm font-medium flex items-center gap-2">
            <CheckCircle2 size={16} /> 当前订阅已生效：{data.latestSubscription.planName}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-200 px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        {!data.paymentEnabled && paymentMode === 'ONLINE' && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-200 px-4 py-3 text-sm">
            当前环境未配置在线支付（缺少 STRIPE_SECRET_KEY）。请先配置后再发起支付。
          </div>
        )}

        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">subscription overview</p>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">确认套餐后即可发起订阅。</h2>
              <p className="text-sm md:text-base leading-7 text-slate-600 dark:text-slate-300">
                页面包含套餐选择、加购、付款方式和协议确认，便于统一处理品牌订阅。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 lg:min-w-[320px]">
              <button
                onClick={startCheckout}
                disabled={(paymentMode === 'ONLINE' && !data.paymentEnabled) || submitting || confirming || !agreedToTerms}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {paymentMode === 'ONLINE' ? '立即在线支付' : '创建线下账单'}
              </button>
              <button
                onClick={() => setShowTerms(true)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                先看完整协议
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">plans</p>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200 leading-6">支持对比不同套餐并查看对应服务范围。</p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">addons</p>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200 leading-6">可按月或按次选择额外服务。</p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">billing</p>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200 leading-6">支持在线支付和线下账单两种方式。</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200">1) Price Plans</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">选择按月或按年查看套餐价格。</p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">* Prices in USD, excluding tax</p>
              </div>

              <div className="mb-6 flex justify-center">
                <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-1.5">
                  <button
                    onClick={() => {
                      setDurationMonths(3)
                    }}
                    className={`rounded-full px-6 py-2 text-sm font-bold transition ${
                      billingCycle === 'monthly' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => {
                      setDurationMonths(12)
                    }}
                    className={`rounded-full px-6 py-2 text-sm font-bold transition ${
                      billingCycle === 'yearly' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Yearly
                  </button>
                  <span className="rounded-full bg-blue-50 dark:bg-blue-950/30 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">Save 10%</span>
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
                      className={`group relative overflow-hidden text-left rounded-2xl border p-0 shadow-sm transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className={`px-4 py-2 text-center text-[11px] font-black tracking-[0.15em] ${
                        isSelected
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white'
                          : isRecommended
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                      }`}>
                        {isSelected ? 'CURRENT PLAN' : isRecommended ? 'RECOMMENDED FOR YOU' : 'AVAILABLE PLAN'}
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
                            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300 font-semibold">Billed yearly at USD ${cycleTotal} (10% off)</p>
                          )}
                          {billingCycle === 'monthly' && (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">3-month contract billing cycle</p>
                          )}
                        </div>

                        <div className={`mb-4 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition ${
                          isSelected
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200'
                            : isRecommended
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900'
                        }`}>
                          {isSelected ? 'Current plan' : 'Upgrade now'}
                        </div>

                        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
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

            <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200 mb-4">2) 合同周期</h2>
              <div className="grid grid-cols-3 gap-3">
                {data.durations.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDurationMonths(d)}
                    className={`rounded-2xl border py-3 text-sm font-bold transition-all duration-200 ${
                      durationMonths === d
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {d} 个月{d === 12 ? '（10%折扣）' : ''}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200">3) Add-on Services</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">可按月或按次选择额外服务。</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">Monthly add-ons</h3>
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
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">One-time services</h3>
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
              <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200 mb-3">4) 支付方式</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => setPaymentMode('ONLINE')}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${paymentMode === 'ONLINE' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  <p className="text-sm font-bold text-slate-900 dark:text-white">在线支付</p>
                  <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">立即跳转支付，支付成功后自动激活订阅。</p>
                </button>
                <button
                  onClick={() => setPaymentMode('OFFLINE')}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${paymentMode === 'OFFLINE' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  <p className="text-sm font-bold text-slate-900 dark:text-white">线下账单支付</p>
                  <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">提交后生成线下账单，待 Admin / Admin AI 确认到账并更新状态。</p>
                </button>
              </div>

              <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200 mb-3">5) 用户协议</h2>
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
            </section>

            {paymentMode === 'OFFLINE' && data.latestSubscription?.paymentProvider === 'OFFLINE' && (
              <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200 mb-3">线下账单状态</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">当前状态：<span className="font-bold text-slate-900 dark:text-white">{data.latestSubscription.status}</span></p>
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
            <div className="sticky top-6 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200">付款汇总</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">实时更新选中的套餐、周期和加购。</p>
                </div>
                <div className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  summary
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">selected total</p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-black text-slate-900 dark:text-white">USD ${totalDue}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{durationMonths} 个月周期 + 选中加购</p>
                  </div>
                  <div className="rounded-full border border-blue-200 dark:border-blue-900/40 bg-white dark:bg-slate-900 px-3 py-1 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                    current total
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">套餐月费</span>
                  <span className="text-right">
                    {selectedPlan?.promoMonthlyUsd ? (
                      <>
                        <span className="block text-[11px] text-slate-400 line-through">USD ${selectedPlanOriginalMonthly}</span>
                        <span className="block font-bold text-blue-700 dark:text-blue-300">USD ${monthlyBase}</span>
                      </>
                    ) : (
                      <span className="text-slate-900 dark:text-white">USD ${monthlyBase}</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">按月加购合计</span>
                  <span className="text-slate-900 dark:text-white">USD ${recurringAddons}</span>
                </div>
                <div className="flex justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">周期原价</span>
                  <span className="text-slate-900 dark:text-white">USD ${recurringSubtotal}</span>
                </div>
                <div className="flex justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">周期折扣</span>
                  <span className="text-slate-900 dark:text-white">{discountPercent > 0 ? `${discountPercent}%` : '无'}</span>
                </div>
                <div className="flex justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">折扣减免</span>
                  <span className="text-slate-900 dark:text-white">- USD ${discountAmount}</span>
                </div>
                <div className="flex justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">按次加购合计</span>
                  <span className="text-slate-900 dark:text-white">USD ${oneTimeAddons}</span>
                </div>
                <div className="flex justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">合同周期</span>
                  <span className="text-slate-900 dark:text-white">{durationMonths} 个月</span>
                </div>
                <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-base font-black text-slate-900 dark:text-white">
                  <span>应付总额</span>
                  <span>USD ${totalDue}</span>
                </div>
              </div>

              <button
                onClick={startCheckout}
                disabled={(paymentMode === 'ONLINE' && !data.paymentEnabled) || submitting || confirming || !agreedToTerms}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {submitting ? '处理中...' : paymentMode === 'ONLINE' ? '在线支付并订阅' : '创建线下账单'}
              </button>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-5">
                按 AMC 服务协议：合同费用一次性预付；12 个月提供 10% 折扣。
              </p>
            </div>
          </aside>
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
    </div>
  )
}
