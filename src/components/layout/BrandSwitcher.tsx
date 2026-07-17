'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'

export interface Brand {
  id: string
  name: string
  location?: string
  subscriptions?: Array<{
    id: string
    planId?: string
    planName?: string
    status?: string
    contractEndDate?: string | null
  }>
}

interface BrandSwitcherProps {
  brands: Brand[]
  activeBrand: Brand | null
  setActiveBrand: (brand: Brand) => void
}

export default function BrandSwitcher({ brands, activeBrand, setActiveBrand }: BrandSwitcherProps) {
  const { t } = useI18n()
  const [showBrandMenu, setShowBrandMenu] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const getSubscriptionMeta = (brand: Brand) => {
    const subscription = brand.subscriptions?.[0]
    if (!subscription) {
      return {
        label: t('未绑定配套', 'No package linked'),
        className: 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300',
      }
    }
    if (subscription.status === 'ACTIVE') {
      return {
        label: subscription.planName ? t(`已配套 ${subscription.planName}`, `Package: ${subscription.planName}`) : t('配套已激活', 'Package active'),
        className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300',
      }
    }
    return {
      label: subscription.planName ? `${subscription.planName} (${subscription.status || 'UNKNOWN'})` : t(`配套 ${subscription.status || 'UNKNOWN'}`, `Package ${subscription.status || 'UNKNOWN'}`),
      className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
    }
  }

  useEffect(() => {
    if (!showBrandMenu) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowBrandMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBrandMenu])

  if (brands.length === 0) return null

  return (
    <div className="relative" ref={containerRef}>
      <button
        id="brand-switcher-btn"
        onClick={() => setShowBrandMenu(v => !v)}
        className={`flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-xl border transition-all duration-200 ${
          showBrandMenu
            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 shadow-sm'
            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
        }`}
      >
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-black text-white">{(activeBrand?.name ?? '?').charAt(0).toUpperCase()}</span>
        </div>
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
          {activeBrand?.name ?? t('选择品牌', 'Select Brand')}
        </span>
        <ChevronDown
          size={13}
          className={`text-slate-400 shrink-0 transition-transform duration-200 ${showBrandMenu ? 'rotate-180 text-blue-500' : ''}`}
        />
      </button>

      {showBrandMenu && (
        <div className="absolute left-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-2 border-b border-slate-50 dark:border-slate-800">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('切换品牌', 'Switch Brand')}</p>
          </div>
          <div className="p-1.5 space-y-0.5">
            {brands.map((b) => {
              const subscriptionMeta = getSubscriptionMeta(b)
              return (
              <button
                key={b.id}
                onClick={() => { setActiveBrand(b); setShowBrandMenu(false) }}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors ${
                  activeBrand?.id === b.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-black text-white">{b.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{b.name}</p>
                  {b.location && <p className="text-[10px] text-slate-400 truncate">{b.location}</p>}
                  <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${subscriptionMeta.className}`}>
                    {subscriptionMeta.label}
                  </span>
                </div>
                {activeBrand?.id === b.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                )}
              </button>
              )
            })}
          </div>
          <div className="px-1.5 pb-1.5 pt-0.5 border-t border-slate-100 dark:border-slate-800">
          <button
              id="brand-switcher-add-brand"
              onClick={() => { router.push('/admin'); setShowBrandMenu(false) }}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-left text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <Plus size={14} className="shrink-0" />
              <span className="text-xs font-bold">{t('添加新品牌', 'Add New Brand')}</span>
            </button>
</div>
        </div>
      )}
    </div>
  )
}
