'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/catalog'

type Brand = {
  id: string
  name: string
}

export default function SubscriptionEntryPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [loadingBrands, setLoadingBrands] = useState(true)

  useEffect(() => {
    const loadBrands = async () => {
      try {
        const res = await fetch('/api/brands')
        const json = await res.json().catch(() => [])
        if (res.ok && Array.isArray(json)) {
          setBrands(json.map((b) => ({ id: String(b.id), name: String(b.name) })))
        }
      } finally {
        setLoadingBrands(false)
      }
    }
    loadBrands()
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 text-slate-900 dark:text-slate-100">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white">选择 AMC 订阅计划</h1>
          <p className="mt-3 text-sm md:text-base text-slate-600 dark:text-slate-300 leading-7">
            新用户可先选择订阅方案。品牌信息可以在后续 onboarding 阶段由 AI 员工梳理并写入系统。
          </p>
        </section>

        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <h2 className="text-sm font-black tracking-[0.18em] text-slate-700 dark:text-slate-200 mb-4">可选套餐</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <article key={plan.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
                <p className="text-xs font-black tracking-[0.15em] text-blue-700 dark:text-blue-300">{plan.name}</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">{plan.description}</p>
                <p className="mt-3 text-3xl font-black text-slate-900 dark:text-white">${plan.promoMonthlyUsd ?? plan.monthlyUsd}<span className="text-sm font-semibold text-slate-500"> / month</span></p>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
                  {plan.includes.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <h2 className="text-sm font-black tracking-[0.18em] text-slate-700 dark:text-slate-200 mb-3">下一步</h2>
          {loadingBrands ? (
            <div className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
              <Loader2 size={16} className="animate-spin" /> 正在加载品牌列表...
            </div>
          ) : brands.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">选择一个品牌进入订阅激活页面：</p>
              <div className="flex flex-wrap gap-2">
                {brands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => router.push(`/board/subscription/${brand.id}`)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                  >
                    {brand.name}
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                当前账号还没有品牌。你可以先在看板创建品牌，随后进入品牌订阅页完成激活并获取初始化指令。
              </p>
              <button
                onClick={() => router.push('/board')}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-bold text-white dark:text-slate-900 hover:opacity-90"
              >
                前往看板创建品牌
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
