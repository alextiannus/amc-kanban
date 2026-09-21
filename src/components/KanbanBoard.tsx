'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Store } from 'lucide-react'
import UserSettingsModal from './UserSettingsModal'
import MobileLayout from './dashboard/MobileLayout'
import BrandProfileView from './dashboard/BrandProfileView'
import SocialInsightDashboard from './dashboard/SocialInsightDashboard'
import DashboardCalendar from './dashboard/DashboardCalendar'
import MainLayout from './layout/MainLayout'
import SystemLogModal from './layout/SystemLogModal'
import GameSettingsDashboard from './dashboard/GameSettingsDashboard'
import DashboardAssets from './dashboard/DashboardAssets'
import DraftManagementView from './dashboard/DraftManagementView'
import BrandOperationsView from './dashboard/BrandOperationsView'
import DataAnalysisView from './dashboard/DataAnalysisView'
import AgentLogsView from './dashboard/AgentLogsView'

import { resolveRoles, canAccessView, getMenuGroups, type BoardView } from '@/lib/permissions'
import { hasActiveBrandSubscription, needsBrandSubscriptionGate } from '@/lib/subscription/kanbanGate'

interface Brand {
  id: string
  name: string
  location?: string
  status?: string | null
  subscriptions?: Array<{
    id: string
    planId?: string
    planName?: string
    status?: string
    contractEndDate?: string | null
  }>
}

function isActiveBrand(brand: Brand) {
  return !brand.status || brand.status === 'ACTIVE'
}

export default function KanbanBoard({ initialView = 'dashboard' }: { initialView?: BoardView }) {
  const router = useRouter()
  const [user, setUser] = useState<{
    id: string
    email: string
    role: string
    dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
    userRoles?: string[]
    permissions?: string[]
    nickname?: string | null
    avatar?: string | null
  } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  
  // Navigation State
  const [currentView, setCurrentView] = useState<BoardView>(initialView)
  const [preselectedAssetIds, setPreselectedAssetIds] = useState<string[] | null>(null)

  useEffect(() => {
    if (initialView === 'dashboard') {
      try {
        const requestedView = new URLSearchParams(window.location.search).get('tab')
        const savedView = (['assets', 'managementOverview', 'dashboard'].includes(requestedView || '') ? requestedView : window.localStorage.getItem('amc.currentView')) as BoardView | null
        const validViews: BoardView[] = ['dashboard', 'calendar', 'game', 'socialInsight', 'drafts', 'assets', 'dataAnalysis', 'logs', 'managementOverview']
        if (savedView && validViews.includes(savedView)) {
          setTimeout(() => {
            setCurrentView(savedView)
          }, 0)
        }
      } catch (e) {
        console.error(e)
      }
    }
  }, [initialView])

  useEffect(() => {
    try {
      window.localStorage.setItem('amc.currentView', currentView)
    } catch (e) {
      console.error(e)
    }
  }, [currentView])

  // Brand State — loaded from API
  const [brands, setBrands] = useState<Brand[]>([])
  const [activeBrand, setActiveBrand] = useState<Brand | null>(null)

  const [subscriptionCheckMs, setSubscriptionCheckMs] = useState<number>(Date.now())
  const [showSystemLog, setShowSystemLog] = useState(false)
  const [subscriptionActive, setSubscriptionActive] = useState<boolean | null>(null)
  const [subscriptionCheckError, setSubscriptionCheckError] = useState(false)
  const userRoles = resolveRoles(user)
  const menus = user ? getMenuGroups(userRoles, user.permissions || []) : []
  const localViews = menus.flatMap(group => group.items.filter(item => !item.href && !item.comingSoon).map(item => item.view))
  const canAccessAnalytics = canAccessView(userRoles, 'socialInsight', user?.permissions || [])

  useEffect(() => {
    if (!user || !localViews.length || localViews.includes(currentView)) return
    setCurrentView(localViews[0])
  }, [user, currentView, localViews.join(',')])

  useEffect(() => {
    if (activeBrand?.id) {
      document.body.setAttribute('data-active-brand-id', activeBrand.id)
      try {
        window.localStorage.setItem('dashboard.activeBrandId', activeBrand.id)
      } catch (e) {
        console.error(e)
      }
    } else {
      document.body.removeAttribute('data-active-brand-id')
    }
  }, [activeBrand?.id])

  const fetchBrands = async (): Promise<Brand[] | null> => {
    try {
      const res = await fetch('/api/brands?assignedOnly=true', { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const payload: Brand[] = await res.json()
        const list = payload.filter(isActiveBrand)
        setBrands(list)
        if (list.length > 0) {
          let requestedBrandId: string | null = null
          let savedBrandId: string | null = null
          try {
            requestedBrandId = new URLSearchParams(window.location.search).get('brandId')
            savedBrandId = requestedBrandId || window.localStorage.getItem('dashboard.activeBrandId')
          } catch (e) {
            console.error(e)
          }
          const savedBrand = list.find(b => b.id === savedBrandId)
          setActiveBrand(prev => (prev && list.some(b => b.id === prev.id) ? prev : savedBrand ?? (requestedBrandId ? null : list[0])))
        } else {
          setActiveBrand(null)
        }
        return list
      }
      if (res.status === 401) router.push('/')
    } catch (e) {
      console.error('[KanbanBoard] fetchBrands error', e)
    }
    return null
  }

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me', { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const data = await res.json()
        setUser(data)
        return data
      } else if (res.status === 401) {
        router.push('/')
      }
    } catch (e) {
      console.error('[KanbanBoard] fetchUser error', e)
    }
    return null
  }

  const fetchSubscriptionState = async () => {
    setSubscriptionCheckMs(Date.now())
    setSubscriptionCheckError(false)
    const list = await fetchBrands()
    if (!list) { setSubscriptionCheckError(true); return }
    setSubscriptionActive(list.length === 0 || hasActiveBrandSubscription(list))
  }

  // Non-brand capabilities do not depend on brand subscriptions.
  useEffect(() => {
    if (!user) return
    const roles = resolveRoles(user)
    if (!needsBrandSubscriptionGate(roles, user.permissions || [])) {
      setSubscriptionActive(true)
    }
  }, [user])

  useEffect(() => {
    queueMicrotask(async () => {
      // Fetch user first — role determines whether subscription check is needed
      const fetchedUser = await fetchUser()
      if (!fetchedUser) { setSubscriptionCheckError(true); return }
      const fetchedRoles = resolveRoles(fetchedUser)
      if (!needsBrandSubscriptionGate(fetchedRoles, fetchedUser.permissions || [])) {
        setSubscriptionActive(true)
        void fetchBrands()
      } else {
        void fetchSubscriptionState()
      }
    })
  }, [])

  if (subscriptionActive === false) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-2xl rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 md:p-8 shadow-sm text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-300 mx-auto">
            <Store size={28} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">订阅未激活</h1>
            <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
              当前账号还没有生效的订阅计划，因此暂不展示品牌主看板、品牌切换器和其他需要品牌上下文的页面。
            </p>
          </div>
          <button
            onClick={() => { setSubscriptionActive(null); void fetchSubscriptionState() }}
            className="mt-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            重新检查
          </button>
        </div>
      </div>
    )
  }

  if (subscriptionActive === null) {
    const elapsed = Date.now() - subscriptionCheckMs
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-slate-500 dark:text-slate-400">
          {!subscriptionCheckError && <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />}
          <p className="text-sm font-medium">{subscriptionCheckError ? '订阅状态暂时无法确认' : '检查订阅状态...'}</p>
          {(subscriptionCheckError || elapsed > 8000) && (
            <button
              onClick={() => { setSubscriptionActive(null); void fetchSubscriptionState() }}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              重试
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <MainLayout
      currentView={currentView}
      setCurrentView={setCurrentView}
      brands={brands}
      activeBrand={activeBrand}
      setActiveBrand={setActiveBrand}
      user={user}
      onShowSettings={() => setShowSettings(true)}
      onShowSystemLog={() => setShowSystemLog(true)}
    >
      {!localViews.length ? <div className="p-10 text-slate-500">{menus.length ? '请从左侧菜单选择已授权功能。' : '当前账号没有可访问功能，请联系管理员分配角色权限。'}</div> : !localViews.includes(currentView) || !canAccessView(userRoles, currentView, user?.permissions || []) ? <div className="p-10 text-slate-500">正在切换到可访问页面…</div> : currentView === 'calendar' ? (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-full">
          <DashboardCalendar
            key={activeBrand?.id ?? 'no-brand'}
            brandId={activeBrand?.id}
            preselectedAssetIds={preselectedAssetIds}
            clearPreselectedAssets={() => setPreselectedAssetIds(null)}
          />
        </div>
      ) : currentView === 'socialInsight' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-full">
          {canAccessAnalytics && activeBrand ? (
            <SocialInsightDashboard key={activeBrand.id} brandId={activeBrand.id} brandName={activeBrand.name} />
          ) : !activeBrand ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">请先选择品牌</div>
          ) : (
            <div className="flex items-center justify-center h-full text-red-500 text-sm font-bold">无权查看该模块</div>
          )}
        </div>
      ) : currentView === 'game' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-full p-4 md:p-8">
          {activeBrand ? (
            <GameSettingsDashboard key={activeBrand.id} brandId={activeBrand.id} brandName={activeBrand.name} />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">请先选择品牌</div>
          )}
        </div>
      ) : currentView === 'drafts' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-full">
          <DraftManagementView key={activeBrand?.id ?? 'no-brand'} brandId={activeBrand?.id} brandName={activeBrand?.name} initialTab="draft" />
        </div>
      ) : currentView === 'assets' ? (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-full">
          <DashboardAssets
            key={activeBrand?.id ?? 'no-brand'}
            brandId={activeBrand?.id}
            onNavigateToCalendar={(assetIds) => {
              setPreselectedAssetIds(assetIds)
              setCurrentView('calendar')
            }}
            onNavigateToDrafts={() => {
              setCurrentView('drafts')
            }}
          />
        </div>
      ) : currentView === 'dataAnalysis' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-full">
          {canAccessAnalytics ? (
            <DataAnalysisView />
          ) : (
            <div className="flex items-center justify-center h-full text-red-500 text-sm font-bold">无权查看该模块</div>
          )}
        </div>
      ) : currentView === 'logs' ? (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-full">
          <AgentLogsView brandId={activeBrand?.id} />
        </div>
      ) : currentView === 'managementOverview' ? (
        <BrandOperationsView />
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-full">
          <MobileLayout>
            <Suspense fallback={
              <div className="p-8 flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
                  <p className="text-xs text-slate-400 font-medium">加载中...</p>
                </div>
              </div>
            }>
              <BrandProfileView 
                key={activeBrand?.id ?? 'no-brand'} 
                brand={activeBrand ?? undefined}
                onClose={typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('returnTo') === 'managementOverview' ? () => { setCurrentView('managementOverview'); router.replace('/board?tab=managementOverview') } : undefined}
                onUpdate={(updated) => {
                  setActiveBrand(updated)
                  setBrands(prev => prev.map(b => b.id === updated.id ? { ...b, name: updated.name } : b))
                }}
              />
            </Suspense>
          </MobileLayout>
        </div>
      )}

      {showSettings && user && (
        <UserSettingsModal user={user} onClose={() => setShowSettings(false)} onUpdated={fetchUser} />
      )}

      {showSystemLog && (
        <SystemLogModal onClose={() => setShowSystemLog(false)} />
      )}
    </MainLayout>
  )
}
