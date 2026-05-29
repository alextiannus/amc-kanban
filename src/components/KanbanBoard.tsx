'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import TaskModal from './TaskModal'
import UserSettingsModal from './UserSettingsModal'
import ArchiveView from './ArchiveView'
import MobileLayout from './dashboard/MobileLayout'
import DashboardHome from './dashboard/DashboardHome'
import BrandAnalyticsDashboard from './dashboard/BrandAnalyticsDashboard'
import SocialInsightDashboard from './dashboard/SocialInsightDashboard'
import DashboardCalendar from './dashboard/DashboardCalendar'
import MainLayout from './layout/MainLayout'
import SystemLogModal from './layout/SystemLogModal'
import NewAgentKeyModal from './layout/NewAgentKeyModal'
import AgentsWorkflowView from './dashboard/AgentsWorkflowView'
import GameSettingsDashboard from './dashboard/GameSettingsDashboard'
import KanbanChatWidget from './chat/KanbanChatWidget'

interface Brand {
  id: string
  name: string
  location?: string
}

export default function KanbanBoard({ initialView = 'dashboard' }: { initialView?: 'agents' | 'archive' | 'dashboard' | 'analytics' | 'calendar' | 'game' | 'socialInsight' }) {
  const [tasks, setTasks] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
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
    nickname?: string | null
    avatar?: string | null
  } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  
  // Navigation State
  const [currentView, setCurrentView] = useState<'agents' | 'archive' | 'dashboard' | 'analytics' | 'calendar' | 'game' | 'socialInsight'>(initialView)
  const [agentsFilter, setAgentsFilter] = useState<'all' | 'online' | 'offline'>('all')

  // Brand State — loaded from API
  const [brands, setBrands] = useState<Brand[]>([])
  const [activeBrand, setActiveBrand] = useState<Brand | null>(null)

  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [showSystemLog, setShowSystemLog] = useState(false)
  const dashboardRole = user?.dashboardRole || (user?.role === 'ADMIN' ? 'ADMIN' : 'BRAND_DIRECTOR')

  const activeBrandIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    activeBrandIdRef.current = activeBrand?.id
    if (activeBrand?.id) {
      document.body.setAttribute('data-active-brand-id', activeBrand.id)
    } else {
      document.body.removeAttribute('data-active-brand-id')
    }
  }, [activeBrand?.id])

  const fetchBrands = async () => {
    try {
      const res = await fetch('/api/brands')
      if (res.ok) {
        const list: Brand[] = await res.json()
        setBrands(list)
        if (list.length > 0) setActiveBrand(prev => prev ?? list[0])
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

  const fetchTasks = async (brandId?: string) => {
    try {
      const queryBrandId = brandId !== undefined ? brandId : activeBrandIdRef.current
      const url = queryBrandId ? `/api/tasks?active=true&brandId=${queryBrandId}` : '/api/tasks?active=true'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setTasks(data)
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
    fetchUser()
    fetchBrands()

    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = (event) => {
      if (event.data === 'update') {
        fetchTasks()
        fetchSummary()
      }
    }

    return () => {
      eventSource.close()
    }
  }, [])

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
        <AgentsWorkflowView
          tasks={tasks}
          summary={summary}
          activeBrand={activeBrand}
          onTaskClick={setSelectedTask}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          agentsFilter={agentsFilter}
          setAgentsFilter={setAgentsFilter}
        />
      ) : currentView === 'archive' ? (
        <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <ArchiveView onTaskClick={setSelectedTask} />
        </div>
      ) : currentView === 'calendar' ? (
        <div className="flex-1 -mx-4 md:-mx-8 -mb-4 md:-mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-[calc(100vh-140px)] bg-slate-50 dark:bg-slate-950 overflow-y-auto">
          <DashboardCalendar key={activeBrand?.id ?? 'no-brand'} brandId={activeBrand?.id} />
        </div>
      ) : currentView === 'analytics' ? (
        <div className="flex-1 -mx-4 md:-mx-8 -mb-4 md:-mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-[calc(100vh-140px)] bg-slate-50 dark:bg-slate-950 overflow-y-auto">
          {activeBrand ? (
            <BrandAnalyticsDashboard key={activeBrand.id} brandId={activeBrand.id} brandName={activeBrand.name} />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">请先选择品牌</div>
          )}
        </div>
      ) : currentView === 'socialInsight' ? (
        <div className="flex-1 -mx-4 md:-mx-8 -mb-4 md:-mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-[calc(100vh-140px)] bg-slate-50 dark:bg-slate-950 overflow-y-auto">
          {(dashboardRole === 'ADMIN' || dashboardRole === 'BRAND_DIRECTOR') && activeBrand ? (
            <SocialInsightDashboard key={activeBrand.id} brandId={activeBrand.id} brandName={activeBrand.name} />
          ) : !activeBrand ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">请先选择品牌</div>
          ) : (
            <div className="flex items-center justify-center h-full text-red-500 text-sm font-bold">无权查看该模块</div>
          )}
        </div>
      ) : currentView === 'game' ? (
        <div className="flex-1 -mx-4 md:-mx-8 -mb-4 md:-mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-[calc(100vh-140px)] bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 md:p-8">
          {activeBrand ? (
            <GameSettingsDashboard key={activeBrand.id} brandId={activeBrand.id} brandName={activeBrand.name} />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">请先选择品牌</div>
          )}
        </div>
      ) : (
        <div className="flex-1 -mx-4 md:-mx-8 -mb-4 md:-mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300 relative h-[calc(100vh-140px)] bg-slate-50 dark:bg-slate-950 overflow-y-auto">
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

      <KanbanChatWidget
        brandId={activeBrand?.id}
        brandName={activeBrand?.name}
        taskId={selectedTask?.id}
        userId={user?.id}
      />
    </MainLayout>
  )
}
