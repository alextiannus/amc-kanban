'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PlanningPageHeader } from '@/components/planning/PlanningPageHeader'
import type { PromotionPlanItem } from '@/components/planning/types'
import { usePlanningWorkspace } from '@/components/planning/usePlanningWorkspace'

export default function PromotionPlansPage() {
  const {
    brands,
    brandId,
    selectBrand,
    data,
    busy,
    error,
    act,
    approvedLibrary,
    getPlan,
  } = usePlanningWorkspace()
  const [period, setPeriod] = useState(30)
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const plan = getPlan(period)
  const requirements = useMemo(() => (
    plan ? (data?.requirements || []).filter((item) => item.remotePlanId === plan.id) : []
  ), [data?.requirements, plan])
  const acceptedRequirements = requirements.filter((item) => item.status === 'ACCEPTED').length

  const editPlanItem = (item: PromotionPlanItem) => {
    if (!plan || ['approved', 'material_ready'].includes(plan.state)) return
    const suggestedDate = window.prompt('建议发布日期 YYYY-MM-DD', String(item.suggestedDate).slice(0, 10))
    if (!suggestedDate) return
    const platform = window.prompt('平台', item.platform)
    if (!platform) return
    const coreAngle = window.prompt('核心角度', item.coreAngle)
    if (!coreAngle) return
    void act('update_plan_item', {
      planId: plan.id,
      item: { planItemId: item.id, suggestedDate, platform, coreAngle },
    })
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PlanningPageHeader
          title="推广计划"
          description="使用已批准的品牌灵感生成独立的 30/60/90 天计划，并完成拍摄素材绑定与验收。"
          brands={brands}
          brandId={brandId}
          onBrandChange={selectBrand}
          siblingHref="/planning/inspirations"
          siblingLabel="品牌灵感"
        />

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          {[
            ['已批准灵感库', approvedLibrary ? `v${approvedLibrary.version} · ${approvedLibrary.inspirations.filter((item) => item.reviewStatus === 'approved').length} 条灵感` : '尚未批准'],
            [`${period} 天推广计划`, plan ? `v${plan.version} · ${plan.state}` : '尚未生成'],
            ['素材完成情况', requirements.length ? `${acceptedRequirements}/${requirements.length}` : '等待计划批准'],
          ].map(([title, value]) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-slate-500">{value}</p>
            </div>
          ))}
        </section>

        {!approvedLibrary && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            生成推广计划前，需要先审核并批准一版品牌灵感库。
            <Link href="/planning/inspirations" className="ml-2 font-semibold underline">前往品牌灵感</Link>
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">30 / 60 / 90 天推广计划</h2>
              <p className="text-sm text-slate-500">三个周期各自版本化，只使用已批准的品牌灵感。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[30, 60, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => setPeriod(days)}
                  className={`rounded-lg px-3 py-2 text-sm ${period === days ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800'}`}
                >{days} 天</button>
              ))}
              <input
                aria-label="计划开始日期"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="rounded-lg border border-slate-200 bg-transparent px-3 text-sm"
              />
              <button
                disabled={Boolean(busy) || !approvedLibrary || !brandId}
                onClick={() => void act('generate_plan', { periodDays: period, startDate, targetPlatforms: ['instagram', 'tiktok'], frequencyPerWeek: 2 })}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >{busy === 'generate_plan' ? '生成中…' : `生成 ${period} 天计划`}</button>
            </div>
          </div>

          {!plan && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
              当前品牌尚未生成 {period} 天推广计划。
            </div>
          )}

          <div className="mt-5 space-y-3">
            {plan?.items?.map((item) => (
              <div key={item.id} className="grid gap-2 rounded-xl border border-slate-200 p-4 text-sm md:grid-cols-[90px_120px_1fr_auto] dark:border-slate-700">
                <div><b>第 {item.weekNumber} 周</b><div className="text-slate-500">{String(item.suggestedDate).slice(0, 10)}</div></div>
                <div><b>{item.platform}</b><div className="text-slate-500">{item.contentFormat}</div></div>
                <div><b>{item.title}</b><p className="mt-1 text-slate-500">{item.coreAngle} · 素材截止 {String(item.materialDueDate || '').slice(0, 10)}</p></div>
                {plan.state !== 'approved' && plan.state !== 'material_ready' && (
                  <div className="flex gap-2">
                    <button onClick={() => editPlanItem(item)} className="text-blue-600">编辑</button>
                    <button onClick={() => void act('delete_plan_item', { planId: plan.id, planItemId: item.id })} className="text-red-600">删除</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {plan && plan.state !== 'approved' && plan.state !== 'material_ready' && (
            <div className="mt-5 flex justify-end">
              <button
                disabled={Boolean(busy)}
                onClick={() => void act('set_plan_state', { planId: plan.id, version: plan.version, state: 'approved' })}
                className="rounded-xl border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 disabled:opacity-40"
              >批准此版计划</button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">拍摄计划与素材验收</h2>
              <p className="text-sm text-slate-500">复用品牌素材库；同一素材可提交到多个要求，但每个关系都会留下记录。</p>
            </div>
            <button
              disabled={!plan || plan.state !== 'approved' || Boolean(busy)}
              onClick={() => void act('generate_materials', { planId: plan?.id })}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >{busy === 'generate_materials' ? '生成中…' : '生成拍摄清单'}</button>
          </div>

          {!requirements.length && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
              批准当前计划后，可生成并验收拍摄素材清单。
            </div>
          )}

          <div className="mt-5 space-y-3">
            {requirements.map((requirement) => (
              <div key={requirement.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex justify-between gap-3">
                  <b>{requirement.specification.subject || requirement.requirementKey}</b>
                  <span className="text-xs">{requirement.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {requirement.specification.scene} · {requirement.specification.quantity || 1} 个 · {requirement.specification.aspectRatio}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data?.assets?.slice(0, 12).map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => void act('submit_material', { requirementId: requirement.id, assetId: asset.id })}
                      className="rounded-lg bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800"
                    >绑定 {asset.filename || asset.id.slice(0, 8)}</button>
                  ))}
                  {requirement.submissions?.map((submission) => (
                    <span key={submission.id} className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">
                      {submission.asset.filename || '素材'} · {submission.status}
                      {submission.status === 'SUBMITTED' && (
                        <>
                          <button onClick={() => void act('review_material', { submissionId: submission.id, status: 'ACCEPTED' })}>通过</button>
                          <button onClick={() => void act('review_material', { submissionId: submission.id, status: 'REJECTED' })}>退回</button>
                        </>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
