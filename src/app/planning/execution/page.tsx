'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Brand = { id: string; name: string }
type Asset = { id: string; filename?: string | null }
type Submission = { id: string; status: string; asset: Asset }
type Requirement = { id: string; status: string; requirementKey: string; specification: { subject?: string; scene?: string; quantity?: number; aspectRatio?: string }; submissions: Submission[] }
type Plan = { id: string; version: number; periodDays: number; startDate: string; state: string; items: Array<{ id: string; suggestedDate: string; platform: string; contentFormat: string; title: string; coreAngle: string }> }
type ExecutionData = { plan: Plan | null; requirements: Requirement[]; assets: Asset[] }

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : '操作失败')
  return payload
}

export default function PromotionExecutionPage() {
  return <Suspense fallback={<ExecutionLoading />}><PromotionExecutionContent /></Suspense>
}

function PromotionExecutionContent() {
  const searchParams = useSearchParams()
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [data, setData] = useState<ExecutionData | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/brands', { cache: 'no-store' }).then(readJson).then((items) => {
      if (cancelled) return
      const available = Array.isArray(items) ? items as Brand[] : []
      setBrands(available)
      const requested = searchParams.get('brandId') || localStorage.getItem('dashboard.activeBrandId') || ''
      setBrandId(available.find((item) => item.id === requested)?.id || available[0]?.id || '')
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '品牌加载失败') })
    return () => { cancelled = true }
  }, [searchParams])

  const load = useCallback(async () => {
    if (!brandId) return
    const result = await fetch(`/api/brands/${encodeURIComponent(brandId)}/promotion-execution`, { cache: 'no-store' }).then(readJson)
    setData(result as ExecutionData)
  }, [brandId])

  useEffect(() => {
    if (!brandId) return
    let cancelled = false
    fetch(`/api/brands/${encodeURIComponent(brandId)}/promotion-execution`, { cache: 'no-store' })
      .then(readJson)
      .then((result) => { if (!cancelled) setData(result as ExecutionData) })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '加载失败') })
    return () => { cancelled = true }
  }, [brandId])

  const selectBrand = (id: string) => {
    setBrandId(id); setData(null); setError('')
    localStorage.setItem('dashboard.activeBrandId', id)
    window.history.replaceState(null, '', `/planning/execution?brandId=${encodeURIComponent(id)}`)
  }
  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!brandId) return
    setBusy(action); setError('')
    try {
      await fetch(`/api/brands/${encodeURIComponent(brandId)}/promotion-execution`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) }).then(readJson)
      await load()
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : '操作失败') }
    finally { setBusy('') }
  }
  const plan = data?.plan
  const accepted = data?.requirements.filter((item) => item.status === 'ACCEPTED').length || 0
  const growthPlanUrl = brandId ? `/api/integrations/amc-growth/sso/start?destination=promotion-plans&brandId=${encodeURIComponent(brandId)}` : '#'

  return <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[.18em] text-blue-600">KANBAN EXECUTION</p><h1 className="mt-1 text-3xl font-black">素材执行</h1><p className="mt-1 text-sm text-slate-500">只执行 Growth 当前推广计划：生成拍摄清单、绑定素材并完成验收。</p></div>
        <div className="flex flex-wrap gap-2"><select aria-label="当前品牌" value={brandId} onChange={(event) => selectBrand(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select><a href={growthPlanUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">在 Growth 查看计划 ↗</a></div>
      </header>
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!data && !error && <div className="rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center text-sm text-slate-500">正在加载当前推广计划…</div>}
      {data && !plan && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-12 text-center text-sm text-amber-800">Growth 尚未指定当前推广计划。请先批准计划并设为当前执行版本。</div>}
      {plan && <>
        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <Summary title="当前计划" value={`${plan.periodDays} 天 · v${plan.version}`} />
          <Summary title="计划状态" value={plan.state === 'material_ready' ? '素材已就绪' : '已批准'} />
          <Summary title="素材完成" value={`${accepted}/${data?.requirements.length || 0}`} />
        </section>
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">当前推广排期</h2><p className="text-sm text-slate-500">策略内容只读；需要调整请回到 Growth 创建并激活新版本。</p></div><button disabled={plan.state !== 'approved' || Boolean(busy)} onClick={() => void act('generate_materials')} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy === 'generate_materials' ? '生成中…' : '生成/刷新拍摄清单'}</button></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">{plan.items.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700"><div className="flex justify-between gap-3"><b>{item.title}</b><span className="text-slate-500">{String(item.suggestedDate).slice(0, 10)}</span></div><p className="mt-1 text-slate-500">{item.platform} · {item.contentFormat} · {item.coreAngle}</p></div>)}</div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div><h2 className="text-xl font-semibold">拍摄清单与素材验收</h2><p className="text-sm text-slate-500">全部必需素材通过后，当前 Growth 计划自动进入 material_ready。</p></div>
          {!data?.requirements.length && <div className="mt-5 rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">尚无拍摄要求。点击上方按钮生成清单。</div>}
          <div className="mt-5 space-y-3">{data?.requirements.map((requirement) => <div key={requirement.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex justify-between gap-3"><b>{requirement.specification.subject || requirement.requirementKey}</b><span className="text-xs">{requirement.status}</span></div><p className="mt-1 text-sm text-slate-500">{requirement.specification.scene || '待确定场景'} · {requirement.specification.quantity || 1} 个 · {requirement.specification.aspectRatio || '比例不限'}</p><div className="mt-3 flex flex-wrap gap-2">{data.assets.slice(0, 12).map((asset) => <button key={asset.id} disabled={Boolean(busy)} onClick={() => void act('submit_material', { requirementId: requirement.id, assetId: asset.id })} className="rounded-lg bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">绑定 {asset.filename || asset.id.slice(0, 8)}</button>)}{requirement.submissions.map((submission) => <span key={submission.id} className="flex items-center gap-2 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">{submission.asset.filename || '素材'} · {submission.status}{submission.status === 'SUBMITTED' && <><button className="font-semibold" onClick={() => void act('review_material', { submissionId: submission.id, status: 'ACCEPTED' })}>通过</button><button className="font-semibold text-red-600" onClick={() => void act('review_material', { submissionId: submission.id, status: 'REJECTED' })}>退回</button></>}</span>)}</div></div>)}</div>
        </section>
      </>}
    </div>
  </main>
}

function ExecutionLoading() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">正在加载素材执行工作台…</main>
}

function Summary({ title, value }: { title: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{value}</p></div>
}
