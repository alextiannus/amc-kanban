'use client'

import { PlanningPageHeader } from '@/components/planning/PlanningPageHeader'
import type { Inspiration } from '@/components/planning/types'
import { usePlanningWorkspace } from '@/components/planning/usePlanningWorkspace'

export default function BrandInspirationsPage() {
  const {
    brands,
    brandId,
    selectBrand,
    data,
    busy,
    error,
    act,
    currentLibrary: library,
  } = usePlanningWorkspace()

  const reviseInspiration = (item: Inspiration) => {
    const title = window.prompt('品牌化灵感标题', item.title)
    if (!title) return
    const coreAngle = window.prompt('核心内容角度', item.brief?.coreAngle || item.directionName)
    if (!coreAngle) return
    void act('revise_inspiration', { itemId: item.id, title, coreAngle })
  }

  const approvedCount = library?.inspirations?.filter((item) => item.reviewStatus === 'approved').length || 0

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PlanningPageHeader
          title="品牌灵感"
          description="从真实品牌事实筛选并生成可执行 Content Brief；本页不会生成正式发布文案。"
          brands={brands}
          brandId={brandId}
          onBrandChange={selectBrand}
          siblingHref="/planning/promotion-plans"
          siblingLabel="推广计划"
        />

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          {[
            ['品牌资料完整度', data?.completeness?.score != null ? `${data.completeness.score}%` : '查看资料缺口'],
            ['当前灵感库', library ? `v${library.version} · ${library.state}` : '尚未生成'],
            ['已批准灵感', library ? `${approvedCount}/${library.inspirations.length}` : '等待生成'],
          ].map(([title, value]) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-slate-500">{value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">品牌专属灵感</h2>
              <p className="text-sm text-slate-500">默认筛选 12 条；缺少真实套餐、折扣或历史事实时只列为资料缺口。</p>
            </div>
            <button
              disabled={Boolean(busy) || !brandId}
              onClick={() => void act('generate_inspiration', { limit: 12, targetPlatforms: ['instagram', 'tiktok'] })}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === 'generate_inspiration' ? '生成中…' : library ? '手动刷新新版本' : '生成品牌灵感'}
            </button>
          </div>

          {library?.refreshAvailable && (
            <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              品牌资料或通用库已变化，存在可刷新内容；旧版本及已入计划内容不会被覆盖。
            </div>
          )}

          {!!library?.gaps?.length && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-amber-700">{library.gaps.length} 个资料缺口</summary>
              <ul className="mt-2 list-disc pl-6 text-slate-500">
                {library.gaps.slice(0, 10).map((gap, index) => (
                  <li key={`${gap.directionName}-${index}`}>{gap.directionName}：缺少 {gap.missingFactKeys.join('、')}</li>
                ))}
              </ul>
            </details>
          )}

          {!library && !error && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
              选择品牌后生成第一版品牌专属灵感。
            </div>
          )}

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {library?.inspirations?.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex justify-between gap-3">
                  <div>
                    <span className="text-xs text-blue-600">{item.largeScene} / {item.smallScene}</span>
                    <h3 className="mt-1 font-semibold">{item.title}</h3>
                  </div>
                  <span className="text-xs text-slate-500">{item.score.toFixed(0)} 分</span>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.brief?.fitReason}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => void act('review_inspiration', { itemId: item.id, libraryVersion: library.version, status: 'approved' })}
                    className={`rounded-lg px-3 py-1.5 text-xs ${item.reviewStatus === 'approved' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}
                  >批准</button>
                  <button
                    onClick={() => void act('review_inspiration', { itemId: item.id, libraryVersion: library.version, status: 'rejected' })}
                    className={`rounded-lg px-3 py-1.5 text-xs ${item.reviewStatus === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
                  >拒绝</button>
                  <button onClick={() => reviseInspiration(item)} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
                    编辑为新版本
                  </button>
                </div>
              </article>
            ))}
          </div>

          {library && (
            <div className="mt-5 flex justify-end">
              <button
                disabled={approvedCount === 0 || Boolean(busy)}
                onClick={() => void act('set_library_state', { libraryId: library.id, version: library.version, state: 'approved' })}
                className="rounded-xl border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 disabled:opacity-40"
              >批准此版灵感库</button>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
