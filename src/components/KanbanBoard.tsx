'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Store } from 'lucide-react'
import TaskModal from './TaskModal'
import UserSettingsModal from './UserSettingsModal'
import MobileLayout from './dashboard/MobileLayout'
import DashboardHome from './dashboard/DashboardHome'
import SocialInsightDashboard from './dashboard/SocialInsightDashboard'
import DashboardCalendar from './dashboard/DashboardCalendar'
import MainLayout from './layout/MainLayout'
import SystemLogModal from './layout/SystemLogModal'
import NewAgentKeyModal from './layout/NewAgentKeyModal'
import AgentsWorkflowView from './dashboard/AgentsWorkflowView'
import GameSettingsDashboard from './dashboard/GameSettingsDashboard'
import DashboardAssets from './dashboard/DashboardAssets'
import DraftManagementView from './dashboard/DraftManagementView'
import DataAnalysisView from './dashboard/DataAnalysisView'
import AgentLogsView from './dashboard/AgentLogsView'

import { resolveRoles, canAccessView, type BoardView } from '@/lib/permissions'

interface Brand {
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

type BoardTask = {
  id: string
  status: string
  title?: string | null
  description?: string | null
  materials?: string | null
  updatedAt?: string | null
  createdAt?: string | null
  assigneeId?: string | null
  assignee?: {
    nickname?: string | null
    email?: string | null
  } | null
}

function isEffectiveActiveSubscription(subscription?: { status?: string; contractEndDate?: string | null } | null) {
  if (subscription?.status !== 'ACTIVE') return false
  if (!subscription.contractEndDate) return true
  return new Date(subscription.contractEndDate).getTime() > Date.now()
}

export default function KanbanBoard({ initialView = 'dashboard' }: { initialView?: BoardView }) {
  const router = useRouter()
  const [tasks, setTasks] = useState<BoardTask[]>([])
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [summary, setSummary] = useState<{
    collaborativeAgentsCount: number
    runningAgentsCount: number
    notRunningAgentsCount: number
    pendingTasksCount: number
    completedTasksCount: number
  } | null>(null)
  const [user, setUser] = useState<{
    id: string
    email: string
    role: string
    dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
    userRoles?: string[]
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
        const savedView = window.localStorage.getItem('amc.currentView') as BoardView | null
        const validViews: BoardView[] = ['agents', 'dashboard', 'calendar', 'game', 'socialInsight', 'drafts', 'assets', 'dataAnalysis', 'logs', 'managementOverview']
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

  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [showSystemLog, setShowSystemLog] = useState(false)
  const [subscriptionActive, setSubscriptionActive] = useState<boolean | null>(null)
  const userRoles = resolveRoles(user)
  const canAccessAnalytics = canAccessView(userRoles, 'socialInsight')

  const activeBrandIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    activeBrandIdRef.current = activeBrand?.id
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

  const fetchBrands = async () => {
    try {
      const res = await fetch('/api/brands?assignedOnly=true')
      if (res.ok) {
        const list: Brand[] = await res.json()
        setBrands(list)
        if (list.length > 0) {
          let savedBrandId: string | null = null
          try {
            savedBrandId = window.localStorage.getItem('dashboard.activeBrandId')
          } catch (e) {
            console.error(e)
          }
          const savedBrand = list.find(b => b.id === savedBrandId)
          setActiveBrand(prev => prev ?? savedBrand ?? list[0])
        }
      }
    } catch (e) {
      console.error('[KanbanBoard] fetchBrands error', e)
    }
  }

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        setUser(await res.json())
      }
    } catch (e) {
      console.error('[KanbanBoard] fetchUser error', e)
    }
  }

  const fetchSubscriptionState = async () => {
    try {
      const res = await fetch('/api/subscription')
      if (!res.ok) {
        setSubscriptionActive(false)
        return
      }

      const data = await res.json()
      setSubscriptionActive(isEffectiveActiveSubscription(data?.latestSubscription))
    } catch (e) {
      console.error('[KanbanBoard] fetchSubscriptionState error', e)
      setSubscriptionActive(false)
    }
  }

  const fetchTasks = async (brandId?: string) => {
    try {
      const queryBrandId = brandId !== undefined ? brandId : activeBrandIdRef.current
      const url = queryBrandId ? `/api/tasks?active=true&brandId=${queryBrandId}` : '/api/tasks?active=true'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setTasks((Array.isArray(data) ? data : data.tasks ?? []) as BoardTask[])
      }
    } catch (e) {
      console.error('[KanbanBoard] fetchTasks error', e)
    }
  }

  const fetchSummary = async (brandId?: string) => {
    try {
      const queryBrandId = brandId !== undefined ? brandId : activeBrandIdRef.current
      const url = queryBrandId ? `/api/dashboard/summary?brandId=${queryBrandId}` : '/api/dashboard/summary'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setSummary(data)
      }
    } catch (e) {
      console.error('[KanbanBoard] fetchSummary error', e)
    }
  }

  const createAgentKey = async () => {
    try {
      const res = await fetch('/api/agents/keys', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || '生成 Agent 密钥失败')
        return
      }
      setNewApiKey(data.apiKey)
    } catch (e) {
      console.error('[KanbanBoard] createAgentKey error', e)
      alert('生成 Agent 密钥失败，请稍后重试')
    }
  }

  // Fetch tasks and summary when active brand changes
  useEffect(() => {
    if (activeBrand?.id) {
      fetchTasks(activeBrand.id)
      fetchSummary(activeBrand.id)
    } else {
      fetchTasks()
      fetchSummary()
    }
  }, [activeBrand?.id])

  useEffect(() => {
    let eventSource: EventSource | null = null
    queueMicrotask(() => {
      void fetchUser()
      void fetchSubscriptionState()
      void fetchBrands()

      eventSource = new EventSource('/api/events')
      eventSource.onmessage = (event) => {
        if (event.data === 'update') {
          void fetchTasks()
          void fetchSummary()
        }
      }
    })

    return () => {
      eventSource?.close()
    }
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

        </div>
      </div>
    )
  }

  if (subscriptionActive === null) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
          <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
          <p className="text-sm font-medium">检查订阅状态...</p>
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
      onNewAgentKeyGenerated={(key) => setNewApiKey(key)}
      onTasksCleared={() => {
        fetchTasks()
        fetchSummary()
      }}
    >
      {currentView === 'agents' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <AgentsWorkflowView
            onOpenDashboard={() => setCurrentView('dashboard')}
            onCreateAgent={createAgentKey}
          />
        </div>
      ) : currentView === 'calendar' ? (
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
          <DraftManagementView key={activeBrand?.id ?? 'no-brand'} brandId={activeBrand?.id} brandName={activeBrand?.name} />
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
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-full p-4 md:p-8">
          {/* TODO: ManagementOverviewDashboard — multi-brand summary for Admin/Principal */}
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-400 to-blue-600 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-white">主理人总览</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">跨品牌汇总看板正在开发中，将展示所有代运营品牌的运营状态和数据摘要。</p>
            </div>
          </div>
        </div>
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
              <DashboardHome key={activeBrand?.id ?? 'no-brand'} brand={activeBrand ?? undefined} />
            </Suspense>
          </MobileLayout>
        </div>
      )}

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          allTasks={tasks}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => {
            fetchTasks()
            fetchSummary()
            setSelectedTask(null)
          }}
          onTagFilter={(tag) => {
            setSelectedTask(null)
            setSearchQuery(tag)
          }}
        />
      )}

      {showSettings && user && (
        <UserSettingsModal user={user} onClose={() => setShowSettings(false)} onUpdated={fetchUser} />
      )}

      {newApiKey && (
        <NewAgentKeyModal newApiKey={newApiKey} onClose={() => setNewApiKey(null)} />
      )}

      {showSystemLog && (
        <SystemLogModal onClose={() => setShowSystemLog(false)} />
      )}
    </MainLayout>
  )
}
