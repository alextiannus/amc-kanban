'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, CheckCircle2, FileText, Loader2, RefreshCw, Search, Sparkles, Video } from 'lucide-react'

type Brand = { id: string; name: string }

type ReferenceSource = {
  title?: string
  copySummary?: string
  referenceReason?: string
  sourceUrl?: string
  rightsNote?: string
}

type ScriptShot = { label: string; instruction?: string }
type ScriptSlide = { label: string; copy?: string }

type ScriptContent = {
  opening?: string
  title?: string
  shots?: ScriptShot[]
  slides?: ScriptSlide[]
  body?: string
  cta?: string
}

type PublicationDraft = {
  publicationId: string
  plannedPublishDate?: string
  platform?: string
  ownerReviewStatus?: string
  contentAngle?: string
  kanbanSelectionReason?: string
  matchedTags?: string[]
  selectedCreativeCandidateId?: string
  promotionPointId?: string
  sourceVideo?: ReferenceSource
  sourcePost?: ReferenceSource
  scriptContent?: ScriptContent
  assetNeeds?: string[]
  storeVisitNeeds?: string[]
  materialNeeds?: string[]
}

type Plan = {
  state?: string
  monthlyPublicationPlanDrafts?: PublicationDraft[]
  contentLibraryGaps?: unknown[]
}

const ACTIVE_BRAND_KEY = 'dashboard.activeBrandId'

type PromotionStrategyWorkspaceProps = {
  initialBrandId?: string
  embedded?: boolean
  showBrandSelector?: boolean
}

export function PromotionStrategyWorkspace({
  initialBrandId = '',
  embedded = false,
  showBrandSelector = true,
}: PromotionStrategyWorkspaceProps) {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState(initialBrandId)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [market, setMarket] = useState('Singapore')
  const [servicePlanId, setServicePlanId] = useState('essential')
  const [goal, setGoal] = useState('本月提升到店咨询和预约转化，让顾客看懂为什么现在值得来。')
  const [sellingPoints, setSellingPoints] = useState('招牌产品或核心服务\n真实环境和服务过程\n本月活动或优惠套餐\n顾客评价和信任内容')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [selectedPublicationId, setSelectedPublicationId] = useState('')

  useEffect(() => {
    if (initialBrandId && !showBrandSelector) {
      return
    }
    let cancelled = false
    fetch('/api/brands', { cache: 'no-store' })
      .then(readJson)
      .then((items: Brand[]) => {
        if (cancelled) return
        const list = Array.isArray(items) ? items : []
        setBrands(list)
        const active = localStorage.getItem(ACTIVE_BRAND_KEY) || new URLSearchParams(window.location.search).get('brandId') || ''
        const next = initialBrandId || list.find((brand: Brand) => brand.id === active)?.id || list[0]?.id || ''
        setBrandId(next)
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '品牌加载失败'))
    return () => { cancelled = true }
  }, [initialBrandId, showBrandSelector])

  const publications = useMemo(() => plan?.monthlyPublicationPlanDrafts || [], [plan])
  const selectedPublication = publications.find((item) => item.publicationId === selectedPublicationId) || publications[0] || null

  async function generate(refreshPromotionPointId?: string) {
    if (!brandId) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/brands/${encodeURIComponent(brandId)}/promotion-strategy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          month,
          market,
          servicePlanId,
          goal,
          sellingPoints,
          refreshPromotionPointId,
          platforms: ['tiktok', 'instagram', 'google_business'],
        }),
      })
      const data = await readJson(response)
      setPlan(data.plan)
      const first = data.plan?.monthlyPublicationPlanDrafts?.[0]?.publicationId || ''
      setSelectedPublicationId(first)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '推广策略生成失败')
    } finally {
      setLoading(false)
    }
  }

  const content = (
      <div className={embedded ? 'flex flex-col gap-5' : 'mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6'}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Marketing Plan</p>
            <h1 className={embedded ? 'mt-1 text-lg font-bold' : 'mt-1 text-2xl font-bold'}>{embedded ? '月度营销工作区' : '营销方案'}</h1>
            <p className="mt-1 text-sm text-slate-500">按月度目标和推广点，生成可 review 的发布计划与素材配合清单。</p>
          </div>
          <button
            type="button"
            onClick={() => generate()}
            disabled={loading || !brandId}
            className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            生成计划
          </button>
        </header>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div>}

        <section className={`grid gap-5 ${embedded ? 'xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_340px]' : 'lg:grid-cols-[320px_minmax(0,1fr)_360px]'}`}>
          <aside className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            {showBrandSelector && (
              <Field label="品牌">
                <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="field">
                  {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="月份"><input className="field" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></Field>
              <Field label="套餐">
                <select className="field" value={servicePlanId} onChange={(event) => setServicePlanId(event.target.value)}>
                  <option value="essential">Essential</option>
                  <option value="booster">Booster</option>
                </select>
              </Field>
            </div>
            <Field label="市场">
              <select className="field" value={market} onChange={(event) => setMarket(event.target.value)}>
                <option>Singapore</option>
                <option>Malaysia</option>
                <option>Indonesia</option>
              </select>
            </Field>
            <Field label="月度目标"><textarea className="field min-h-24" value={goal} onChange={(event) => setGoal(event.target.value)} /></Field>
            <Field label="推广点">
              <textarea className="field min-h-36" value={sellingPoints} onChange={(event) => setSellingPoints(event.target.value)} />
            </Field>
          </aside>

          <section className="min-h-[640px] rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">发布计划草稿</h2>
                <p className="mt-1 text-sm text-slate-500">{plan ? `${plan.monthlyPublicationPlanDrafts?.length || 0} 条内容，${plan.contentLibraryGaps?.length || 0} 个内容库缺口` : '生成后在这里 review 每条排期。'}</p>
              </div>
              {plan && <StatusPill value={plan.state || 'draft'} />}
            </div>

            {!plan ? (
              <div className="grid h-[520px] place-items-center rounded-md border border-dashed border-slate-300 text-center text-sm text-slate-500 dark:border-slate-700">
                <div>
                  <CalendarDays className="mx-auto mb-3 h-8 w-8" />
                  <p>选择品牌和推广点后生成计划。</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {publications.map((item) => (
                  <button
                    key={item.publicationId}
                    type="button"
                    onClick={() => setSelectedPublicationId(item.publicationId)}
                    className={`w-full rounded-md border p-4 text-left transition ${selectedPublication?.publicationId === item.publicationId ? 'border-slate-950 bg-slate-50 dark:border-white dark:bg-slate-800' : 'border-slate-200 hover:border-slate-400 dark:border-slate-800'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-900 px-2 py-1 text-xs font-bold text-white dark:bg-white dark:text-slate-900">{item.plannedPublishDate}</span>
                        <span className="text-xs font-semibold uppercase text-slate-500">{item.platform}</span>
                      </div>
                      <StatusPill value={item.ownerReviewStatus || 'draft'} />
                    </div>
                    <h3 className="mt-3 text-sm font-bold">{item.contentAngle}</h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.kanbanSelectionReason}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      {(item.matchedTags || []).slice(0, 4).map((tag: string) => <span key={tag} className="rounded border border-slate-200 px-2 py-1 dark:border-slate-700">{tag}</span>)}
                      {!item.selectedCreativeCandidateId && <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">需要补库/刷新</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className={`rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${embedded ? 'xl:col-span-2 2xl:col-span-1' : ''}`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">候选创意 review</h2>
              {selectedPublication && (
                <button
                  type="button"
                  onClick={() => generate(selectedPublication.promotionPointId)}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  刷新
                </button>
              )}
            </div>
            {selectedPublication ? <CandidateDetail item={selectedPublication} /> : <p className="text-sm text-slate-500">选择一条发布计划查看候选内容。</p>}
          </aside>
        </section>
      </div>
  )

  const styles = (
      <style jsx global>{`
        .field {
          width: 100%;
          border-radius: 6px;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 8px 10px;
          font-size: 14px;
          outline: none;
        }
        .field:focus { border-color: rgb(15 23 42); }
        .dark .field {
          border-color: rgb(51 65 85);
          background: rgb(15 23 42);
          color: rgb(241 245 249);
        }
      `}</style>
  )

  return embedded ? (
    <>
      {content}
      {styles}
    </>
  ) : (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      {content}
      {styles}
    </main>
  )
}

export default PromotionStrategyWorkspace

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-500">{label}</span>{children}</label>
}

function CandidateDetail({ item }: { item: PublicationDraft }) {
  const source = item.sourceVideo || item.sourcePost
  const script = item.scriptContent || {}
  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center gap-2 text-sm font-bold">
          {item.sourceVideo ? <Video className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          {item.sourceVideo ? '原视频参考' : '原 post 参考'}
        </div>
        {source ? (
          <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <p>{source.title || source.copySummary || '未命名参考内容'}</p>
            <p>{source.referenceReason}</p>
            {source.sourceUrl && <a className="inline-flex items-center gap-1 text-blue-600" href={source.sourceUrl} target="_blank" rel="noreferrer"><Search className="h-3.5 w-3.5" />打开原内容</a>}
            <p className="text-xs text-amber-700 dark:text-amber-200">{source.rightsNote}</p>
          </div>
        ) : <p className="mt-3 text-sm text-amber-700 dark:text-amber-200">amc-content 未返回参考原内容，需补库或人工策划。</p>}
      </section>

      <section className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4" />脚本内容</div>
        <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {script.opening && <p><strong>开场：</strong>{script.opening}</p>}
          {script.title && <p><strong>标题：</strong>{script.title}</p>}
          {Array.isArray(script.shots) && script.shots.map((shot) => <p key={shot.label}><strong>{shot.label}：</strong>{shot.instruction}</p>)}
          {Array.isArray(script.slides) && script.slides.map((slide) => <p key={slide.label}><strong>{slide.label}：</strong>{slide.copy}</p>)}
          {script.body && <p>{script.body}</p>}
          {script.cta && <p><strong>CTA：</strong>{script.cta}</p>}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="h-4 w-4" />素材与配合</div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          {(item.assetNeeds || []).map((need: string) => <li key={need}>{need}</li>)}
          {(item.storeVisitNeeds || []).map((need: string) => <li key={need}>探店：{need}</li>)}
          {(item.materialNeeds || []).map((need: string) => <li key={need}>物料：{need}</li>)}
        </ul>
      </section>
    </div>
  )
}

function StatusPill({ value }: { value: string }) {
  const text = value === 'needs_refresh' ? '需刷新' : value === 'owner_reviewing' ? '待 review' : value || 'draft'
  return <span className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">{text}</span>
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || data?.message || `request_failed:${response.status}`)
  return data
}
