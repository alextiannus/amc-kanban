'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const ACTIVE_BRAND_KEY = 'dashboard.activeBrandId'

export function PlanningGrowthBridge({ destination, title }: { destination: 'brand-inspirations' | 'promotion-plans'; title: string }) {
  return <Suspense fallback={<BridgeState title={title} />}><PlanningGrowthBridgeContent destination={destination} title={title} /></Suspense>
}

function PlanningGrowthBridgeContent({ destination, title }: { destination: 'brand-inspirations' | 'promotion-plans'; title: string }) {
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const redirect = async () => {
      let brandId = searchParams.get('brandId') || localStorage.getItem(ACTIVE_BRAND_KEY) || ''
      if (!brandId) {
        const response = await fetch('/api/brands', { cache: 'no-store' })
        const brands = await response.json().catch(() => [])
        if (!response.ok) throw new Error(brands?.error || '品牌加载失败')
        brandId = Array.isArray(brands) ? brands[0]?.id || '' : ''
      }
      if (!brandId) throw new Error('当前账号没有可访问的品牌')
      if (!cancelled) window.location.replace(`/api/integrations/amc-growth/sso/start?destination=${destination}&brandId=${encodeURIComponent(brandId)}`)
    }
    void redirect().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '跳转失败')
    })
    return () => { cancelled = true }
  }, [destination, searchParams])

  return <BridgeState title={title} error={error} />
}

function BridgeState({ title, error = '' }: { title: string; error?: string }) {
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      <h1 className="text-xl font-bold">正在打开 Growth {title}</h1>
      <p className={`mt-2 text-sm ${error ? 'text-red-600' : 'text-slate-500'}`}>{error || '将使用当前 Kanban 登录和品牌权限，在 Growth 中打开对应工作台。'}</p>
    </div>
  </main>
}
