import Link from 'next/link'
import { ArrowLeft, CheckCircle2, PlusCircle } from 'lucide-react'
import { SUBSCRIPTION_ADDONS } from '@/lib/subscription/catalog'

export default function AddonServicesPage() {
  const monthly = SUBSCRIPTION_ADDONS.filter((addon) => addon.pricing === 'monthly')
  const oneTime = SUBSCRIPTION_ADDONS.filter((addon) => addon.pricing === 'one_time')

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/dashboard/service-check" className="inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900 dark:hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              服务检查
            </Link>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.24em] text-indigo-600">AMC Add-ons</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal">加购增值服务</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-400">
              这些项目仅在报价、订单、发票、工作说明或书面确认中列明时才包含。第三方平台费用、创作者费用、广告投放费和供应商费用另行确认。
            </p>
          </div>
          <Link
            href="/terms"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-950"
          >
            查看商家合作协议
          </Link>
        </header>

        <AddonGroup title="月度加购" subtitle="适合需要持续维护的平台或渠道。" addons={monthly} />
        <AddonGroup title="单次加购" subtitle="适合拍摄、短视频制作或集中探店项目。" addons={oneTime} />
      </div>
    </main>
  )
}

function AddonGroup({
  title,
  subtitle,
  addons,
}: {
  title: string
  subtitle: string
  addons: typeof SUBSCRIPTION_ADDONS
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-black">{title}</h2>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {addons.map((addon) => (
          <article key={addon.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-black">{addon.name}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-600 dark:text-slate-400">{addon.description}</p>
              </div>
              <div className="shrink-0 rounded-lg bg-indigo-50 px-3 py-2 text-right dark:bg-indigo-950/40">
                <p className="text-lg font-black text-indigo-700 dark:text-indigo-300">S${addon.usd.toLocaleString()}</p>
                <p className="text-[11px] font-bold text-indigo-500 dark:text-indigo-300">{addon.pricing === 'monthly' ? '/ 月' : '/ 次'}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {addon.details.map((detail) => (
                <li key={detail} className="flex gap-2 text-sm font-medium leading-6 text-slate-650 dark:text-slate-300">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 dark:border-slate-700 dark:text-slate-200">
              <PlusCircle className="h-4 w-4" />
              报价、订单或书面确认后生效
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
