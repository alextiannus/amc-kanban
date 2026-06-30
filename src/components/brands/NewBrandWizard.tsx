'use client'

import React, { useState, useEffect } from 'react'
import {
  X, ChevronRight, ChevronLeft, Store, Mail, Phone, MapPin,
  Check, Loader2, Sparkles, Building2, Zap, Crown,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanOption {
  id: string
  name: string
  monthlyUsd: number
  description: string
  highlights: string[]
  icon: React.ReactNode
  color: string
  badge?: string
}

interface WizardState {
  // Step 1
  brandName: string
  ownerEmail: string
  ownerPhone: string
  location: string
  // Step 2
  planId: string
  planName: string
  monthlyBaseUsd: number
  durationMonths: number
  // Promo code
  promoCode: string
  promoDiscountType: 'PERCENT' | 'FIXED_AMOUNT' | null
  promoDiscountValue: number
  promoValid: boolean
  promoValidationMsg: string | null
  // Computed
  totalDueUsd: number
}

interface NewBrandWizardProps {
  onClose: () => void
  onSuccess: (brandId: string, brandName: string) => void
}

// ─── Plan Data ────────────────────────────────────────────────────────────────

const PLANS: PlanOption[] = [
  {
    id: 'starter',
    name: '自媒体基础运营',
    monthlyUsd: 600,
    description: '消灭宣传真空，建立基础数字存在',
    highlights: [
      '30-36条/月图文内容创作',
      'Google / FB / IG / TikTok',
      '评论监控',
      '每月≥4位博主探店',
      '账号风格统一化设计',
    ],
    icon: <Zap className="w-5 h-5" />,
    color: 'blue',
  },
  {
    id: 'essential',
    name: 'Tier 2 · 品牌建设版',
    monthlyUsd: 2800,
    description: '全平台覆盖 + 视频内容 + 博主矩阵',
    highlights: [
      '≥20条图文 + 8条短视频/月',
      '5大平台全覆盖（含小红书）',
      '评论监控与回复',
      '每月最多30位博主探店',
      '月度营销活动策划',
    ],
    icon: <Building2 className="w-5 h-5" />,
    color: 'indigo',
    badge: '最受欢迎',
  },
]

const DURATIONS = [
  { months: 1,  label: '1 个月',  discount: 0 },
  { months: 3,  label: '3 个月',  discount: 5 },
  { months: 6,  label: '6 个月',  discount: 10 },
  { months: 12, label: '12 个月', discount: 15, badge: '最优惠' },
]

const PLAN_COLOR: Record<string, { bg: string; border: string; text: string; badge: string; ring: string }> = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-950/30',   border: 'border-blue-200 dark:border-blue-800',   text: 'text-blue-700 dark:text-blue-300',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',   ring: 'ring-blue-500' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-300', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300', ring: 'ring-indigo-500' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200 dark:border-violet-800', text: 'text-violet-700 dark:text-violet-300', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300', ring: 'ring-violet-500' },
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  const steps = ['商户信息', '套餐选择', '确认提交']
  return (
    <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100 dark:border-slate-800">
      {steps.map((label, i) => {
        const idx = i + 1
        const done = idx < current
        const active = idx === current
        return (
          <React.Fragment key={idx}>
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                done    ? 'bg-green-500 text-white' :
                active  ? 'bg-indigo-600 text-white' :
                          'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : idx}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${
                active ? 'text-indigo-600 dark:text-indigo-400' :
                done   ? 'text-green-600 dark:text-green-400' :
                         'text-slate-400'
              }`}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px transition-all ${done ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Step 1: 商户信息 ─────────────────────────────────────────────────────────

function Step1({ state, onChange }: {
  state: WizardState
  onChange: (k: keyof WizardState, v: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Store className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">品牌基本信息</span>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
          品牌 / 餐厅名称 <span className="text-red-400">*</span>
        </label>
        <input
          id="wizard-brand-name"
          type="text"
          value={state.brandName}
          onChange={e => onChange('brandName', e.target.value)}
          placeholder="例：成都滋味烤鱼"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
          品牌主邮箱 <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="wizard-owner-email"
            type="email"
            value={state.ownerEmail}
            onChange={e => onChange('ownerEmail', e.target.value)}
            placeholder="owner@restaurant.com"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">Welcome 邮件及账号凭证将发送到此邮箱</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
            联系电话
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="wizard-phone"
              type="tel"
              value={state.ownerPhone}
              onChange={e => onChange('ownerPhone', e.target.value)}
              placeholder="+65 9xxx xxxx"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
            所在城市
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="wizard-location"
              type="text"
              value={state.location}
              onChange={e => onChange('location', e.target.value)}
              placeholder="Singapore"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Step 2: 套餐选择 ─────────────────────────────────────────────────────────

function Step2({ state, onPlan, onDuration, currentUser, onChange, onValidatePromo, validatingPromo }: {
  state: WizardState
  onPlan: (planId: string, planName: string, monthlyUsd: number) => void
  onDuration: (months: number) => void
  currentUser: any
  onChange: (k: keyof WizardState, v: string) => void
  onValidatePromo: () => void
  validatingPromo: boolean
}) {
  const userRoles = currentUser?.userRoles || []
  const isPrincipalOrBDOrAdmin = userRoles.includes('AMC_PRINCIPAL') || userRoles.includes('BD') || currentUser?.role === 'ADMIN'

  return (
    <div className="space-y-5">
      {/* Plan cards */}
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">选择服务套餐</p>
        <div className="space-y-2.5">
          {PLANS.map(plan => {
            const selected = state.planId === plan.id
            const c = PLAN_COLOR[plan.color]
            return (
              <button
                key={plan.id}
                id={`wizard-plan-${plan.id}`}
                onClick={() => onPlan(plan.id, plan.name, plan.monthlyUsd)}
                className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                  selected
                    ? `${c.bg} ${c.border} ring-2 ${c.ring}`
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 p-1.5 rounded-lg ${selected ? c.bg : 'bg-slate-100 dark:bg-slate-800'} ${selected ? c.text : 'text-slate-500'}`}>
                      {plan.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${selected ? c.text : 'text-slate-800 dark:text-slate-100'}`}>
                          {plan.name}
                        </span>
                        {plan.badge && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.badge}`}>
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{plan.description}</p>
                      <ul className="mt-2 space-y-0.5">
                        {plan.highlights.map((h, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                            <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <div className={`font-bold text-base ${selected ? c.text : 'text-slate-700 dark:text-slate-200'}`}>
                      ${plan.monthlyUsd.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-400">/月</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Duration */}
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">合同时长</p>
        <div className="grid grid-cols-4 gap-2">
          {DURATIONS.map(d => (
            <button
              key={d.months}
              id={`wizard-duration-${d.months}`}
              onClick={() => onDuration(d.months)}
              className={`relative rounded-xl border-2 py-2.5 px-1 text-center transition-all ${
                state.durationMonths === d.months
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'
              }`}
            >
              {d.badge && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  {d.badge}
                </span>
              )}
              <div className={`text-xs font-bold ${state.durationMonths === d.months ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}`}>
                {d.label}
              </div>
              {d.discount > 0 && (
                <div className="text-[10px] text-green-600 dark:text-green-400 font-semibold">
                  -{d.discount}%
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Promo Code Option (Only for principal & BD) */}
      {isPrincipalOrBDOrAdmin && (
        <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            邀请码 / 优惠码
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="请输入优惠码或主理人/BD邀请码"
              value={state.promoCode}
              onChange={e => onChange('promoCode', e.target.value)}
              className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 font-semibold uppercase"
            />
            <button
              type="button"
              onClick={onValidatePromo}
              disabled={validatingPromo}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black transition-all disabled:opacity-50"
            >
              {validatingPromo ? '验证中...' : '核销优惠'}
            </button>
          </div>
          {state.promoValidationMsg && (
            <p className={`text-xs font-bold ${state.promoValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
              {state.promoValidationMsg}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Step 3: 确认提交 ─────────────────────────────────────────────────────────

function Step3({ state }: { state: WizardState }) {
  const plan = PLANS.find(p => p.id === state.planId)
  const duration = DURATIONS.find(d => d.months === state.durationMonths)
  const discountPct = duration?.discount ?? 0
  const baseDiscountedMonthly = state.monthlyBaseUsd * (1 - discountPct / 100)
  
  let promoDiscountVal = 0
  if (state.promoValid && state.promoDiscountType === 'PERCENT') {
    promoDiscountVal = baseDiscountedMonthly * (state.promoDiscountValue / 100)
  } else if (state.promoValid && state.promoDiscountType === 'FIXED_AMOUNT') {
    promoDiscountVal = state.promoDiscountValue
  }

  const discountedMonthly = Math.max(0, Math.round(baseDiscountedMonthly - promoDiscountVal))
  const totalDue = discountedMonthly * state.durationMonths

  const rows = [
    { label: '品牌名称',  value: state.brandName },
    { label: '品牌主邮箱', value: state.ownerEmail },
    { label: '所在城市',  value: state.location || '—' },
    { label: '套餐',     value: plan?.name ?? '—' },
    { label: '合同时长',  value: duration?.label ?? '—' },
    { 
      label: '月费',     
      value: state.promoValid 
        ? `$${discountedMonthly.toLocaleString()} USD (折上折: 已应用优惠)`
        : `$${discountedMonthly.toLocaleString()} USD${discountPct ? ` (${discountPct}% 折)` : ''}` 
    },
    { label: '合同总额',  value: `$${totalDue.toLocaleString()} USD` },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 space-y-3">
        {rows.map(r => (
          <div key={r.label} className="flex items-start justify-between gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.label}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-100 text-right">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          ⚠️ 订阅状态为 <strong>待付款（PENDING）</strong>，需在线下完成收款后由 Admin 后台激活为 ACTIVE，AI 团队方可开始工作。
        </p>
      </div>
      <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 px-4 py-3">
        <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
          📧 系统将自动发送 Welcome 邮件至品牌主邮箱，邮件内含临时密码和 AMC 商家端链接，品牌主点击即可完成首次登录。
        </p>
      </div>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function NewBrandWizard({ onClose, onSuccess }: NewBrandWizardProps) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [validatingPromo, setValidatingPromo] = useState(false)

  const [state, setState] = useState<WizardState>({
    brandName: '',
    ownerEmail: '',
    ownerPhone: '',
    location: '',
    planId: 'essential',
    planName: '品牌建设版',
    monthlyBaseUsd: 2800,
    durationMonths: 3,
    promoCode: '',
    promoDiscountType: null,
    promoDiscountValue: 0,
    promoValid: false,
    promoValidationMsg: null,
    totalDueUsd: 0,
  })

  useEffect(() => {
    fetch('/api/profile')
      .then(res => res.json())
      .then(data => setCurrentUser(data))
      .catch(err => console.error('Fetch profile err:', err))
  }, [])

  function onChange(k: keyof WizardState, v: string) {
    setState(prev => ({ ...prev, [k]: v }))
  }

  function onPlan(planId: string, planName: string, monthlyUsd: number) {
    setState(prev => ({ ...prev, planId, planName, monthlyBaseUsd: monthlyUsd }))
  }

  function onDuration(months: number) {
    setState(prev => ({ ...prev, durationMonths: months }))
  }

  // Compute derived totals
  const duration = DURATIONS.find(d => d.months === state.durationMonths)
  const discountPct = duration?.discount ?? 0
  const baseDiscountedMonthly = state.monthlyBaseUsd * (1 - discountPct / 100)
  
  let promoDiscountVal = 0
  if (state.promoValid && state.promoDiscountType === 'PERCENT') {
    promoDiscountVal = baseDiscountedMonthly * (state.promoDiscountValue / 100)
  } else if (state.promoValid && state.promoDiscountType === 'FIXED_AMOUNT') {
    promoDiscountVal = state.promoDiscountValue
  }

  const discountedMonthly = Math.max(0, Math.round(baseDiscountedMonthly - promoDiscountVal))
  const totalDue = discountedMonthly * state.durationMonths

  async function handleValidatePromoCode() {
    if (!state.promoCode.trim()) {
      setState(prev => ({
        ...prev,
        promoValid: false,
        promoDiscountType: null,
        promoDiscountValue: 0,
        promoValidationMsg: '请输入邀请码/优惠码'
      }))
      return
    }

    setValidatingPromo(true)
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: state.promoCode })
      })
      const data = await res.json()
      if (res.ok && data.valid) {
        setState(prev => ({
          ...prev,
          promoValid: true,
          promoDiscountType: data.discountType,
          promoDiscountValue: data.discountValue,
          promoValidationMsg: `✅ 已应用：${data.description}`
        }))
      } else {
        setState(prev => ({
          ...prev,
          promoValid: false,
          promoDiscountType: null,
          promoDiscountValue: 0,
          promoValidationMsg: `❌ ${data.error || '验证失败'}`
        }))
      }
    } catch {
      setState(prev => ({
        ...prev,
        promoValid: false,
        promoDiscountType: null,
        promoDiscountValue: 0,
        promoValidationMsg: '❌ 网络错误，请重新验证'
      }))
    } finally {
      setValidatingPromo(false)
    }
  }

  function validateStep1(): string | null {
    if (!state.brandName.trim()) return '请填写品牌名称'
    if (!state.ownerEmail.trim()) return '请填写品牌主邮箱'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.ownerEmail)) return '邮箱格式不正确'
    return null
  }

  function next() {
    if (step === 1) {
      const err = validateStep1()
      if (err) { setError(err); return }
    }
    setError(null)
    setStep(s => Math.min(s + 1, 3))
  }

  function back() {
    setError(null)
    setStep(s => Math.max(s - 1, 1))
  }

  async function submit() {
    setSubmitting(true)
    setError(null)

    // Generate a temp password to embed in the invite link
    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(18)))
      .map(b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(b % 62))
      .join('')

    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: state.brandName.trim(),
          ownerEmail: state.ownerEmail.trim().toLowerCase(),
          location: state.location.trim() || undefined,
          planId: state.planId,
          planName: state.planName,
          durationMonths: state.durationMonths,
          monthlyBaseUsd: state.monthlyBaseUsd, // Pass base monthly fee
          totalDueUsd: baseDiscountedMonthly * state.durationMonths, // Pass un-promo due amount
          promoCode: state.promoValid ? state.promoCode.trim().toUpperCase() : undefined,
          _tempPassword: tempPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '创建失败，请重试')
        setSubmitting(false)
        return
      }

      onSuccess(data.id, data.name)
    } catch {
      setError('网络错误，请重试')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-slate-950 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-slate-50 text-base leading-tight">新建品牌</h2>
              <p className="text-xs text-slate-400">为商户创建 AMC 账号并完成订阅</p>
            </div>
          </div>
          <button
            id="wizard-close"
            onClick={onClose}
            className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <StepIndicator current={step} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && <Step1 state={state} onChange={onChange} />}
          {step === 2 && (
            <Step2 
              state={state} 
              onPlan={onPlan} 
              onDuration={onDuration} 
              currentUser={currentUser}
              onChange={onChange}
              onValidatePromo={handleValidatePromoCode}
              validatingPromo={validatingPromo}
            />
          )}
          {step === 3 && <Step3 state={{ ...state, totalDueUsd: totalDue }} />}

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3">
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
          <button
            id="wizard-back"
            onClick={step === 1 ? onClose : back}
            disabled={submitting}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-40 transition-colors px-2 py-1.5"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? '取消' : '上一步'}
          </button>

          <div className="flex items-center gap-2">
            {step === 2 && (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">
                合计 <span className="text-slate-800 dark:text-slate-100">${totalDue.toLocaleString()}</span> USD
              </span>
            )}

            {step < 3 ? (
              <button
                id="wizard-next"
                onClick={next}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                下一步
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                id="wizard-submit"
                onClick={submit}
                disabled={submitting}
                className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60 transition-all"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />创建中…</>
                ) : (
                  <><Sparkles className="w-4 h-4" />创建品牌并发送欢迎邮件</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
