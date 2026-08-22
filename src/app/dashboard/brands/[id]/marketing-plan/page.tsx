'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CalendarDays, Edit3, Loader2, Megaphone, Save, Target, TrendingUp, X } from 'lucide-react'
import MobileLayout from '@/components/dashboard/MobileLayout'

type PresentationTheme = {
  paletteName: string
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  muted: string
  decoration: string
}

type PromotionPoint = {
  name: string
  rationale: string
  targetAudience?: string
  customerAction: string
  platforms: string[]
  suggestedMonthlyPosts: number
}

type QuarterPlan = {
  quarter: string
  year?: number
  startMonth?: string
  endMonth?: string
  periodLabel?: string
  strategy: string
  focus: string
  promotionPoints: PromotionPoint[]
  campaigns: string[]
  contentThemes: string[]
  monthlyFocus: Array<{ month: string; focus: string; promotionPoints: string[] }>
}

type AnnualPlan = {
  generatedAt: string
  goal: string
  theme: string
  strategyPrinciples?: string[]
  platformStrategy?: Array<{
    platform: string
    role: string
    contentApproach: string
    customerAction: string
  }>
  contentPillars?: string[]
  quarterlyFocus: Array<{ quarter: string; focus: string; campaigns: string[]; year?: number; startMonth?: string; endMonth?: string; periodLabel?: string }>
  quarterlyPlans?: QuarterPlan[]
  metrics: string[]
  researchFocus?: string
  generationMode?: string
  llmProvider?: string
  llmModel?: string
  llmError?: string
  subscriptionStrategy?: {
    planName: string
    includedServices: string[]
    platformCoverage: string[]
    monthlyContentQuota: number
  }
}

type BrandPlanResponse = {
  ok: boolean
  brand?: { id: string; name: string; location?: string | null }
  marketingSolution?: {
    annualPlan?: AnnualPlan
    presentationTheme?: PresentationTheme
  }
}

const fallbackTheme: PresentationTheme = {
  paletteName: '清晰策划感',
  primary: '#2563eb',
  secondary: '#059669',
  accent: '#d97706',
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  decoration: 'editorial',
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.map(item => item.trim()).filter(Boolean)))
}

function formatDate(value?: string) {
  if (!value) return '未生成'
  return new Date(value).toLocaleString('zh-SG', { dateStyle: 'medium', timeStyle: 'short' })
}

function decorationLabel(value: string) {
  const labels: Record<string, string> = {
    editorial: '清晰策划',
    service: '温暖服务',
    festival: '活动推广',
    fresh: '清爽本地',
    premium: '精致质感',
  }
  return labels[value] || '品牌风格'
}

function quarterDisplayLabel(quarter: { quarter: string; periodLabel?: string; startMonth?: string; endMonth?: string }) {
  if (quarter.periodLabel) return quarter.periodLabel
  if (quarter.startMonth && quarter.endMonth) return `${quarter.quarter} · ${quarter.startMonth} 至 ${quarter.endMonth}`
  return quarter.quarter
}

function arrayOrEmpty<T>(value: T[] | undefined | null) {
  return Array.isArray(value) ? value : []
}

export default function BrandMarketingPlanPresentationPage() {
  const params = useParams<{ id: string }>()
  const brandId = params?.id
  const [data, setData] = useState<BrandPlanResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editingJson, setEditingJson] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!brandId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const initial = await fetch(`/api/brands/${brandId}/brand-plan`, { cache: 'no-store' })
        const initialData = await initial.json().catch(() => ({}))
        if (!initial.ok) throw new Error(initialData?.error || 'brand_plan_load_failed')
        let nextData = initialData as BrandPlanResponse
        if (nextData.marketingSolution?.annualPlan) {
          const themed = await fetch(`/api/brands/${brandId}/brand-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ensure_presentation_theme' }),
          })
          const themedData = await themed.json().catch(() => ({}))
          if (themed.ok) nextData = themedData as BrandPlanResponse
        }
        if (!cancelled) setData(nextData)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'brand_plan_load_failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [brandId])

  const plan = data?.marketingSolution?.annualPlan
  const theme = data?.marketingSolution?.presentationTheme || fallbackTheme
  const quarterPlans = plan?.quarterlyPlans?.length ? plan.quarterlyPlans : []
  const platforms = useMemo(() => {
    const fromPlan = quarterPlans.flatMap(q => q.promotionPoints.flatMap(point => point.platforms || []))
    const fromSubscription = plan?.subscriptionStrategy?.platformCoverage || []
    return uniqueList([...fromSubscription, ...fromPlan])
  }, [plan?.subscriptionStrategy?.platformCoverage, quarterPlans])

  const startEditing = () => {
    if (!plan) return
    setEditingJson(JSON.stringify(plan, null, 2))
    setSaveError('')
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setSaveError('')
  }

  const savePlan = async () => {
    if (!brandId) return
    setSaving(true)
    setSaveError('')
    try {
      const parsed = JSON.parse(editingJson)
      const response = await fetch(`/api/brands/${brandId}/brand-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_workspace_patch',
          target: 'annual_plan',
          value: parsed,
        }),
      })
      const nextData = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(nextData?.error || 'brand_plan_save_failed')
      setData(nextData as BrandPlanResponse)
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof SyntaxError ? 'JSON 格式不正确，请检查括号、逗号和引号。' : err instanceof Error ? err.message : 'brand_plan_save_failed')
    } finally {
      setSaving(false)
    }
  }

  const cssVars = {
    '--brand-primary': theme.primary,
    '--brand-secondary': theme.secondary,
    '--brand-accent': theme.accent,
    '--brand-bg': theme.background,
    '--brand-surface': theme.surface,
    '--brand-text': theme.text,
    '--brand-muted': theme.muted,
  } as React.CSSProperties

  const openEditorFromSurface = () => {
    if (!editing) startEditing()
  }

  const editableSurfaceClass = editing
    ? ''
    : 'cursor-pointer transition hover:ring-2 hover:ring-[var(--brand-primary)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/25'

  return (
    <MobileLayout>
      <main style={cssVars} className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)]">
        <div className="border-b border-black/5 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
              <ArrowLeft className="h-3.5 w-3.5" /> 返回工作台
            </Link>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--brand-muted)]">Brand Marketing Plan</p>
              <p className="text-xs font-bold text-[var(--brand-primary)]">{theme.paletteName}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[70vh] items-center justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" /> 正在打开品牌营销方案
            </div>
          </div>
        ) : error ? (
          <div className="mx-auto max-w-3xl px-5 py-16">
            <div className="rounded-xl border border-rose-200 bg-white p-6 text-sm font-bold text-rose-600">{error}</div>
          </div>
        ) : !plan ? (
          <div className="mx-auto max-w-3xl px-5 py-16">
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Target className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-black text-slate-700">尚未生成品牌营销方案</p>
              <p className="mt-2 text-xs text-slate-500">请先回到品牌计划页生成方案，再打开 presentation view。</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl px-5 py-8">
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" /> 取消
                  </button>
                  <button
                    type="button"
                    onClick={savePlan}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-black text-white shadow-sm disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 保存方案
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startEditing}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  <Edit3 className="h-3.5 w-3.5" /> 编辑完整方案
                </button>
              )}
            </div>

            {editing ? (
              <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-[var(--brand-primary)]">Editable Source</p>
                    <h2 className="mt-1 text-lg font-black">品牌营销方案详细内容</h2>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500">保存后立即回写</span>
                </div>
                <textarea
                  value={editingJson}
                  onChange={(event) => setEditingJson(event.target.value)}
                  className="min-h-[520px] w-full resize-y rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20"
                  spellCheck={false}
                />
                {saveError && <p className="mt-3 text-xs font-bold text-rose-600">{saveError}</p>}
              </section>
            ) : null}

            <section
              role="button"
              tabIndex={editing ? -1 : 0}
              onClick={openEditorFromSurface}
              onKeyDown={(event) => {
                if (editing) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  startEditing()
                }
              }}
              title="点击编辑并保存品牌营销方案"
              className={`relative overflow-hidden rounded-2xl bg-[var(--brand-surface)] p-8 shadow-sm ring-1 ring-black/5 ${editableSurfaceClass}`}
            >
              <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary}, ${theme.accent})` }} />
              <div className="absolute right-0 top-0 h-40 w-40 opacity-10" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`, clipPath: 'polygon(35% 0, 100% 0, 100% 100%, 0 65%)' }} />
              <div className="relative grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--brand-primary)]">{data?.brand?.name || '品牌'}</p>
                  <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-normal md:text-5xl">{plan.theme}</h1>
                  <p className="mt-5 max-w-3xl text-sm leading-7 text-[var(--brand-muted)]">{plan.goal}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {platforms.map(platform => (
                      <span key={platform} className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-bold text-[var(--brand-text)]">{platform}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 bg-slate-50 p-5">
                  <p className="text-xs font-black text-[var(--brand-muted)]">方案信息</p>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div><dt className="text-xs font-bold text-[var(--brand-muted)]">生成时间</dt><dd className="mt-1 font-black">{formatDate(plan.generatedAt)}</dd></div>
                    <div><dt className="text-xs font-bold text-[var(--brand-muted)]">套餐约束</dt><dd className="mt-1 font-black">{plan.subscriptionStrategy?.planName || '未配置'}</dd></div>
                    <div><dt className="text-xs font-bold text-[var(--brand-muted)]">月度内容量</dt><dd className="mt-1 font-black">{plan.subscriptionStrategy?.monthlyContentQuota || 0} 次/月</dd></div>
                    <div><dt className="text-xs font-bold text-[var(--brand-muted)]">生成模型</dt><dd className="mt-1 font-black">{plan.llmModel || plan.generationMode || '未记录'}</dd></div>
                    <div><dt className="text-xs font-bold text-[var(--brand-muted)]">展示风格</dt><dd className="mt-1 font-black">{decorationLabel(theme.decoration)}</dd></div>
                  </dl>
                  {plan.llmError ? (
                    <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-700">
                      LLM 未返回有效 JSON，本次已使用规则兜底方案。错误：{plan.llmError}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {(arrayOrEmpty(plan.strategyPrinciples).length || arrayOrEmpty(plan.platformStrategy).length || arrayOrEmpty(plan.contentPillars).length) ? (
              <section
                role="button"
                tabIndex={editing ? -1 : 0}
                onClick={openEditorFromSurface}
                onKeyDown={(event) => {
                  if (editing) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    startEditing()
                  }
                }}
                title="点击编辑并保存品牌营销方案"
                className={`mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 ${editableSurfaceClass}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--brand-primary)]">AMC Strategy Logic</p>
                    <h2 className="mt-1 text-2xl font-black">AMC 策略判断</h2>
                  </div>
                  <p className="max-w-xl text-xs leading-6 text-[var(--brand-muted)]">这部分是方案的顶层判断：先看品牌状态，再决定平台分工、内容支柱和顾客下一步动作。</p>
                </div>

                {arrayOrEmpty(plan.strategyPrinciples).length ? (
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {arrayOrEmpty(plan.strategyPrinciples).slice(0, 6).map((principle, index) => (
                      <div key={`${principle}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <Target className="mb-3 h-4 w-4 text-[var(--brand-primary)]" />
                        <p className="text-sm font-black leading-6">{principle}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {arrayOrEmpty(plan.platformStrategy).length ? (
                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    {arrayOrEmpty(plan.platformStrategy).map((item) => (
                      <div key={item.platform} className="rounded-xl border border-slate-100 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[var(--brand-primary)] px-2.5 py-1 text-[11px] font-black text-white">{item.platform}</span>
                          <h3 className="text-sm font-black">{item.role}</h3>
                        </div>
                        <p className="mt-2 text-xs leading-6 text-[var(--brand-muted)]">{item.contentApproach}</p>
                        <p className="mt-2 text-xs font-bold text-[var(--brand-secondary)]">顾客动作：{item.customerAction}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {arrayOrEmpty(plan.contentPillars).length ? (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {arrayOrEmpty(plan.contentPillars).map((pillar) => (
                      <span key={pillar} className="rounded-full border border-black/10 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[var(--brand-text)]">{pillar}</span>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="mt-6 grid gap-3 md:grid-cols-3">
              {(plan.metrics || []).slice(0, 6).map(metric => (
                <button
                  key={metric}
                  type="button"
                  onClick={startEditing}
                  disabled={editing}
                  title="点击编辑并保存品牌营销方案"
                  className={`rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-black/5 disabled:cursor-default ${editableSurfaceClass}`}
                >
                  <TrendingUp className="mb-3 h-4 w-4 text-[var(--brand-secondary)]" />
                  <p className="text-sm font-black">{metric}</p>
                </button>
              ))}
            </section>

            <section className="mt-8 space-y-5">
              {quarterPlans.map((quarter, index) => (
                <article
                  key={quarter.periodLabel || quarter.quarter}
                  role="button"
                  tabIndex={editing ? -1 : 0}
                  onClick={openEditorFromSurface}
                  onKeyDown={(event) => {
                    if (editing) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      startEditing()
                    }
                  }}
                  title="点击编辑并保存品牌营销方案"
                  className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 ${editableSurfaceClass}`}
                >
                  <div className="grid gap-5 border-b border-slate-100 p-6 lg:grid-cols-[0.55fr_1fr]">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-[var(--brand-primary)]">{quarterDisplayLabel(quarter)}</p>
                      <h2 className="mt-2 text-2xl font-black">{quarter.focus}</h2>
                      <p className="mt-3 text-sm leading-6 text-[var(--brand-muted)]">{quarter.strategy}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {arrayOrEmpty(quarter.campaigns).map(campaign => (
                        <div key={campaign} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <Megaphone className="mb-2 h-4 w-4" style={{ color: index % 2 ? theme.secondary : theme.accent }} />
                          <p className="text-sm font-black">{campaign}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-5 p-6 lg:grid-cols-[1fr_0.85fr]">
                    <div>
                      <p className="mb-3 text-xs font-black uppercase tracking-widest text-[var(--brand-muted)]">重点推广点</p>
                      <div className="grid gap-3">
                        {arrayOrEmpty(quarter.promotionPoints).map(point => (
                          <div key={`${quarter.quarter}-${point.name}`} className="rounded-xl border border-slate-100 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-black">{point.name}</h3>
                              <span className="rounded-full px-2 py-0.5 text-[11px] font-black text-white" style={{ backgroundColor: theme.primary }}>{point.suggestedMonthlyPosts} 次/月</span>
                              {arrayOrEmpty(point.platforms).map(platform => (
                                <span key={platform} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{platform}</span>
                              ))}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--brand-muted)]">{point.rationale}</p>
                            <p className="mt-2 text-xs font-bold text-[var(--brand-secondary)]">目标行动：{point.customerAction}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-3 text-xs font-black uppercase tracking-widest text-[var(--brand-muted)]">月度拆解</p>
                      <div className="space-y-3">
                        {arrayOrEmpty(quarter.monthlyFocus).map(month => (
                          <div key={`${quarter.quarter}-${month.month}`} className="rounded-xl bg-slate-50 p-4">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-4 w-4 text-[var(--brand-primary)]" />
                              <p className="text-sm font-black">{month.month}</p>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--brand-muted)]">{month.focus}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {arrayOrEmpty(month.promotionPoints).map(point => (
                                <span key={point} className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-500">{point}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </div>
        )}
      </main>
    </MobileLayout>
  )
}
