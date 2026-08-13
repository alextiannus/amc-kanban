'use client'
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Brand = { id: string; name: string }
type Inspiration = { id: string; title: string; largeScene: string; smallScene: string; directionName: string; reviewStatus: string; score: number; brief: any }
type Library = { id: string; version: number; state: string; refreshAvailable: boolean; gaps: any[]; inspirations: Inspiration[] }
type Plan = { id: string; version: number; periodDays: number; startDate: string; state: string; items: any[] }

export default function PlanningPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [data, setData] = useState<any>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [period, setPeriod] = useState(30)
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const load = useCallback(async (id = brandId) => {
    if (!id) return
    const response = await fetch(`/api/brands/${id}/planning`, { cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || '加载失败')
    setData(payload)
  }, [brandId])
  useEffect(() => { fetch('/api/brands').then((res) => res.json()).then((items) => { setBrands(Array.isArray(items) ? items : []); const saved = localStorage.getItem('dashboard.activeBrandId'); const selected = items.find((item: Brand) => item.id === saved)?.id || items[0]?.id || ''; setBrandId(selected) }).catch((reason) => setError(reason.message)) }, [])
  useEffect(() => { if (brandId) load(brandId).catch((reason) => setError(reason.message)) }, [brandId, load])
  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(action); setError('')
    try {
      const response = await fetch(`/api/brands/${brandId}/planning`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '操作失败')
      await load()
    } catch (reason: any) { setError(reason.message) } finally { setBusy('') }
  }
  const reviseInspiration = (item: Inspiration) => {
    const title = window.prompt('品牌化灵感标题', item.title)
    if (!title) return
    const coreAngle = window.prompt('核心内容角度', item.brief?.coreAngle || item.directionName)
    if (!coreAngle) return
    act('revise_inspiration', { itemId: item.id, title, coreAngle })
  }
  const editPlanItem = (item: any) => {
    if (!plan || ['approved', 'material_ready'].includes(plan.state)) return
    const suggestedDate = window.prompt('建议发布日期 YYYY-MM-DD', String(item.suggestedDate).slice(0, 10))
    if (!suggestedDate) return
    const platform = window.prompt('平台', item.platform)
    const coreAngle = window.prompt('核心角度', item.coreAngle)
    act('update_plan_item', { planId: plan.id, item: { planItemId: item.id, suggestedDate, platform, coreAngle } })
  }
  const library: Library | undefined = data?.libraries?.find((item: Library) => item.state !== 'superseded') || data?.libraries?.[0]
  const plan: Plan | undefined = data?.plans?.find((item: Plan) => item.periodDays === period && item.state !== 'superseded') || data?.plans?.find((item: Plan) => item.periodDays === period)
  const requirements = (data?.requirements || []).filter((item: any) => !plan || item.remotePlanId === plan.id)
  return <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><Link href="/dashboard" className="text-sm text-blue-600">← 返回工作台</Link><h1 className="mt-3 text-3xl font-bold">品牌灵感与推广计划</h1><p className="mt-2 text-sm text-slate-500">从品牌事实生成 Content Brief，审核后编排计划并完成拍摄素材验收；流程不会创建发布文案或排期。</p></div><select className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900" value={brandId} onChange={(event) => setBrandId(event.target.value)}>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></header>
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <section className="mb-6 grid gap-4 md:grid-cols-4">{[['1','品牌资料完整度', data?.completeness?.score != null ? `${data.completeness.score}%` : '查看缺口'],['2','品牌专属灵感',library ? `v${library.version} · ${library.state}` : '尚未生成'],['3',`${period} 天推广计划`,plan ? `v${plan.version} · ${plan.state}` : '尚未生成'],['4','素材完成情况',requirements.length ? `${requirements.filter((item: any) => item.status === 'ACCEPTED').length}/${requirements.length}` : '等待计划批准']].map(([step,title,value]) => <div key={step} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><span className="text-xs font-semibold text-blue-600">STEP {step}</span><h2 className="mt-2 font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{value}</p></div>)}</section>
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">品牌专属灵感</h2><p className="text-sm text-slate-500">默认筛选 12 条；缺少真实套餐、折扣或历史事实时只列为资料缺口。</p></div><button disabled={!!busy} onClick={() => act('generate_inspiration', { limit: 12, targetPlatforms: ['instagram','tiktok'] })} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === 'generate_inspiration' ? '生成中…' : library ? '手动刷新新版本' : '生成品牌灵感'}</button></div>
        {library?.refreshAvailable && <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">品牌资料或通用库已变化，存在可刷新内容；旧版本及已入计划内容不会被覆盖。</div>}
        {!!library?.gaps?.length && <details className="mt-4 text-sm"><summary className="cursor-pointer text-amber-700">{library.gaps.length} 个资料缺口</summary><ul className="mt-2 list-disc pl-6 text-slate-500">{library.gaps.slice(0,10).map((gap, index) => <li key={index}>{gap.directionName}：缺少 {gap.missingFactKeys.join('、')}</li>)}</ul></details>}
        <div className="mt-5 grid gap-3 lg:grid-cols-2">{library?.inspirations?.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex justify-between gap-3"><div><span className="text-xs text-blue-600">{item.largeScene} / {item.smallScene}</span><h3 className="mt-1 font-semibold">{item.title}</h3></div><span className="text-xs text-slate-500">{item.score.toFixed(0)} 分</span></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.brief?.fitReason}</p><div className="mt-3 flex gap-2"><button onClick={() => act('review_inspiration',{ itemId:item.id,libraryVersion:library.version,status:'approved' })} className={`rounded-lg px-3 py-1.5 text-xs ${item.reviewStatus === 'approved' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>批准</button><button onClick={() => act('review_inspiration',{ itemId:item.id,libraryVersion:library.version,status:'rejected' })} className={`rounded-lg px-3 py-1.5 text-xs ${item.reviewStatus === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}>拒绝</button><button onClick={() => reviseInspiration(item)} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-700">编辑为新版本</button></div></article>)}</div>
        {library && <div className="mt-5 flex justify-end"><button disabled={!library.inspirations.some((item) => item.reviewStatus === 'approved') || !!busy} onClick={() => act('set_library_state',{ libraryId:library.id,version:library.version,state:'approved' })} className="rounded-xl border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 disabled:opacity-40">批准此版灵感库</button></div>}
      </section>
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">30 / 60 / 90 天推广计划</h2><p className="text-sm text-slate-500">三个周期各自版本化，只使用已批准的品牌灵感。</p></div><div className="flex flex-wrap gap-2">{[30,60,90].map((days) => <button key={days} onClick={() => setPeriod(days)} className={`rounded-lg px-3 py-2 text-sm ${period === days ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800'}`}>{days} 天</button>)}<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-lg border border-slate-200 bg-transparent px-3 text-sm"/><button disabled={!!busy || library?.state !== 'approved'} onClick={() => act('generate_plan',{ periodDays:period,startDate,targetPlatforms:['instagram','tiktok'],frequencyPerWeek:2 })} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">生成 {period} 天计划</button></div></div>
        <div className="mt-5 space-y-3">{plan?.items?.map((item) => <div key={item.id} className="grid gap-2 rounded-xl border border-slate-200 p-4 text-sm md:grid-cols-[90px_120px_1fr_auto] dark:border-slate-700"><div><b>第 {item.weekNumber} 周</b><div className="text-slate-500">{String(item.suggestedDate).slice(0,10)}</div></div><div><b>{item.platform}</b><div className="text-slate-500">{item.contentFormat}</div></div><div><b>{item.title}</b><p className="mt-1 text-slate-500">{item.coreAngle} · 素材截止 {String(item.materialDueDate || '').slice(0,10)}</p></div>{plan.state !== 'approved' && plan.state !== 'material_ready' && <div className="flex gap-2"><button onClick={() => editPlanItem(item)} className="text-blue-600">编辑</button><button onClick={() => act('delete_plan_item',{ planId:plan.id,planItemId:item.id })} className="text-red-600">删除</button></div>}</div>)}</div>
        {plan && plan.state !== 'approved' && <div className="mt-5 flex justify-end"><button onClick={() => act('set_plan_state',{ planId:plan.id,version:plan.version,state:'approved' })} className="rounded-xl border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600">批准此版计划</button></div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex justify-between gap-4"><div><h2 className="text-xl font-semibold">拍摄计划与素材验收</h2><p className="text-sm text-slate-500">复用品牌素材库；同一素材可提交到多个要求，但每个关系都会留下记录。</p></div><button disabled={!plan || plan.state !== 'approved' || !!busy} onClick={() => act('generate_materials',{ planId:plan?.id })} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">生成拍摄清单</button></div>
        <div className="mt-5 space-y-3">{requirements.map((requirement: any) => <div key={requirement.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex justify-between"><b>{requirement.specification.subject || requirement.requirementKey}</b><span className="text-xs">{requirement.status}</span></div><p className="mt-1 text-sm text-slate-500">{requirement.specification.scene} · {requirement.specification.quantity || 1} 个 · {requirement.specification.aspectRatio}</p><div className="mt-3 flex flex-wrap gap-2">{data.assets?.slice(0,12).map((asset: any) => <button key={asset.id} onClick={() => act('submit_material',{ requirementId:requirement.id,assetId:asset.id })} className="rounded-lg bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">绑定 {asset.filename || asset.id.slice(0,8)}</button>)}{requirement.submissions?.map((submission: any) => <span key={submission.id} className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">{submission.asset.filename || '素材'} · {submission.status}{submission.status === 'SUBMITTED' && <><button onClick={() => act('review_material',{ submissionId:submission.id,status:'ACCEPTED' })}>通过</button><button onClick={() => act('review_material',{ submissionId:submission.id,status:'REJECTED' })}>退回</button></>}</span>)}</div></div>)}</div>
      </section>
    </div>
  </main>
}
