'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CreditCard, Loader2 } from 'lucide-react'

type Plan = {
  id: string
  name: string
  monthlyUsd: number
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
  latestSubscription?: any
  paymentEnabled: boolean
}

export default function BrandSubscriptionPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
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
      } catch (e: any) {
        setError(e.message || 'Failed to load')
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
      } catch (e: any) {
        setError(e.message || 'Payment confirmation failed')
      } finally {
        setConfirming(false)
      }
    }
    confirmPayment()
  }, [success, checkoutSessionId, subscriptionId, brandId])

  const selectedPlan = useMemo(() => data?.plans.find((p) => p.id === planId), [data?.plans, planId])
  const selectedAddons = useMemo(
    () => (data?.addons || []).filter((a) => addonIds.includes(a.id)),
    [data?.addons, addonIds]
  )

  const recurringAddons = selectedAddons.filter((a) => a.pricing === 'monthly').reduce((sum, a) => sum + a.usd, 0)
  const oneTimeAddons = selectedAddons.filter((a) => a.pricing === 'one_time').reduce((sum, a) => sum + a.usd, 0)
  const monthlyBase = selectedPlan?.monthlyUsd ?? 0
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
    } catch (e: any) {
      setError(e.message || 'Failed to create checkout')
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
    } catch (e: any) {
      setError(e.message || 'Failed to update status')
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">AMC 订阅中心</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">品牌：{data.brand.name}</p>
          </div>
          <button
            onClick={() => router.push('/board')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <ArrowLeft size={16} /> 返回看板
          </button>
        </div>

        {confirming && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 px-4 py-3 text-sm font-medium">
            正在确认支付结果，请稍候...
          </div>
        )}

        {canceled && (
          <div className="rounded-2xl border border-slate-200 bg-slate-100 text-slate-700 px-4 py-3 text-sm font-medium">
            您已取消本次支付，订单保留为待支付状态，可重新发起支付。
          </div>
        )}

        {data.latestSubscription?.status === 'ACTIVE' && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-3 text-sm font-medium flex items-center gap-2">
            <CheckCircle2 size={16} /> 当前订阅已生效：{data.latestSubscription.planName}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        {!data.paymentEnabled && paymentMode === 'ONLINE' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 px-4 py-3 text-sm">
            当前环境未配置在线支付（缺少 STRIPE_SECRET_KEY）。请先配置后再发起支付。
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-4">1) 选择套餐（竖版对比）</h2>
              <div className="overflow-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold text-slate-700 dark:text-slate-200">对比项</th>
                      {data.plans.map((p) => (
                        <th key={p.id} className="px-3 py-2 min-w-[180px]">
                          <button
                            onClick={() => setPlanId(p.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                              planId === p.id
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                            }`}
                          >
                            <p className="font-black text-slate-900 dark:text-slate-100">{p.name}</p>
                            <p className="text-xs text-blue-600 font-bold mt-0.5">USD ${p.monthlyUsd}/月</p>
                            <p className="text-[11px] text-slate-500 mt-1">{p.description}</p>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.comparisonRows.map((row) => (
                      <tr key={row.key} className="border-t border-slate-200 dark:border-slate-700 align-top">
                        <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{row.label}</td>
                        {data.plans.map((p) => (
                          <td key={`${row.key}-${p.id}`} className="px-3 py-2 text-slate-600 dark:text-slate-300">
                            {row.values[p.id]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-4">2) 合同周期</h2>
              <div className="grid grid-cols-3 gap-3">
                {data.durations.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDurationMonths(d)}
                    className={`rounded-xl border py-2 text-sm font-bold ${
                      durationMonths === d
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {d} 个月{d === 12 ? '（90%折扣）' : ''}
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-4">3) 增值服务下单</h2>
              <div className="space-y-2">
                {data.addons.map((a) => (
                  <label key={a.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addonIds.includes(a.id)}
                      onChange={() => toggleAddon(a.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{a.name}</p>
                      <p className="text-xs text-slate-500">{a.description}</p>
                      {a.details.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500 list-disc pl-4">
                          {a.details.map((d) => <li key={d}>{d}</li>)}
                        </ul>
                      )}
                    </div>
                    <p className="text-xs font-bold text-blue-600 whitespace-nowrap">
                      {a.pricing === 'monthly' ? `+USD ${a.usd}/mo` : `USD ${a.usd} one-time`}
                    </p>
                  </label>
                ))}
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-3">4) 支付方式</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => setPaymentMode('ONLINE')}
                  className={`rounded-xl border px-4 py-3 text-left ${paymentMode === 'ONLINE' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">在线支付</p>
                  <p className="text-xs text-slate-500 mt-1">立即跳转支付，支付成功后自动激活订阅。</p>
                </button>
                <button
                  onClick={() => setPaymentMode('OFFLINE')}
                  className={`rounded-xl border px-4 py-3 text-left ${paymentMode === 'OFFLINE' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">线下账单支付</p>
                  <p className="text-xs text-slate-500 mt-1">提交后生成线下账单，待 Admin / Admin AI 确认到账并更新状态。</p>
                </button>
              </div>

              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-3">5) 用户协议</h2>
              <p className="text-xs text-slate-500 mb-3">{data.termsNotice}</p>
              <button
                onClick={() => setShowTerms(true)}
                className="text-sm font-bold text-blue-600 hover:text-blue-700"
              >
                查看完整用户协议
              </button>
              <label className="mt-3 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5" />
                <span>我已阅读并同意 {data.termsTitle}（{data.termsVersion}）</span>
              </label>
            </section>

            {paymentMode === 'OFFLINE' && data.latestSubscription?.paymentProvider === 'OFFLINE' && (
              <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-3">线下账单状态</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">当前状态：<span className="font-bold">{data.latestSubscription.status}</span></p>
                {userRole === 'ADMIN' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => updateSubscriptionStatus('ACTIVE')} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white">标记已支付</button>
                    <button onClick={() => updateSubscriptionStatus('PENDING')} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-600 text-white">标记待支付</button>
                    <button onClick={() => updateSubscriptionStatus('FAILED')} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white">标记失败</button>
                    <button onClick={() => updateSubscriptionStatus('CANCELLED')} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white">标记取消</button>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sticky top-6">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-3">付款汇总</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">套餐月费</span>
                  <span>USD ${monthlyBase}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">按月加购合计</span>
                  <span>USD ${recurringAddons}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">周期原价</span>
                  <span>USD ${recurringSubtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">周期折扣</span>
                  <span>{discountPercent > 0 ? `${discountPercent}%` : '无'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">折扣减免</span>
                  <span>- USD ${discountAmount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">按次加购合计</span>
                  <span>USD ${oneTimeAddons}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">合同周期</span>
                  <span>{durationMonths} 个月</span>
                </div>
                <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-base font-black">
                  <span>应付总额</span>
                  <span className="text-blue-600">USD ${totalDue}</span>
                </div>
              </div>

              <button
                onClick={startCheckout}
                disabled={(paymentMode === 'ONLINE' && !data.paymentEnabled) || submitting || confirming || !agreedToTerms}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {submitting ? '处理中...' : paymentMode === 'ONLINE' ? '在线支付并订阅' : '创建线下账单'}
              </button>
              <p className="text-[11px] text-slate-400 mt-2">
                按 AMC 服务协议：合同费用一次性预付；12 个月按 90% 折扣计算。
              </p>
            </div>
          </aside>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">{data.termsTitle}</h3>
              <button onClick={() => setShowTerms(false)} className="text-sm text-slate-500 hover:text-slate-700">关闭</button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
              <pre className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-sans">{data.termsFullText}</pre>
              <p className="text-xs text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-700">{data.termsNotice}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
