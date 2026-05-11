'use client'

import { useState, useEffect } from 'react'
import TaskCard from './TaskCard'
import TaskModal from './TaskModal'
import UserSettingsModal from './UserSettingsModal'
import AgentSequenceView from './AgentSequenceView'
import ArchiveView from './ArchiveView'
import { LogOut, Activity, AlertCircle, CheckCircle2, User as UserIcon, Copy, Check, Sun, Moon, Inbox, Settings, Users, LayoutDashboard, Bot, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { buildAgentInitPrompt } from '@/lib/agentInitPrompt'

export const COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'pending', title: 'Require Input', highlight: true },
  { id: 'done', title: 'Done' },
  { id: 'void', title: 'Void' },
]

export default function KanbanBoard() {
  const SHOW_LANE_FILTERS = false
  const [tasks, setTasks] = useState<any[]>([])
  const [doneTasks, setDoneTasks] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [sortBy, setSortBy] = useState('updatedAt')
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [summary, setSummary] = useState<{
    collaborativeAgentsCount: number;
    runningAgentsCount: number;
    notRunningAgentsCount: number;
    pendingTasksCount: number;
    completedTasksCount: number;
  } | null>(null)
  const [user, setUser] = useState<{ id: string, email: string, role: string, nickname?: string | null, avatar?: string | null } | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  
  // Navigation State
  const [currentView, setCurrentView] = useState<'home' | 'agents' | 'archive'>('home')
  const [agentsFilter, setAgentsFilter] = useState<'all' | 'online' | 'offline'>('all')
  
  const [copied, setCopied] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [generatingKey, setGeneratingKey] = useState(false)
  const router = useRouter()

  const openAgentsWithFilter = (filter: 'all' | 'online' | 'offline') => {
    setAgentsFilter(filter)
    setCurrentView('agents')
  }
  
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    fetchTasks()
    fetchSummary()
    fetchUser()

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

  const fetchUser = async () => {
    const res = await fetch('/api/auth/me')
    if (res.ok) {
      setUser(await res.json())
    }
  }

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks?active=true')
      if (res.ok) {
        const data = await res.json()
        setTasks(data)
      }
      
      const doneRes = await fetch('/api/tasks?status=done&limit=10')
      if (doneRes.ok) {
        const data = await doneRes.json()
        // API returns { tasks, pagination } if limit is used
        setDoneTasks(data.tasks || data)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchSummary = async () => {
    const res = await fetch('/api/dashboard/summary')
    if (res.ok) {
      const data = await res.json()
      setSummary(data)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  const getCopyCommand = (apiKey: string | null = null) => {
    const hostFromEnv = process.env.NEXT_PUBLIC_KANBAN_HOST
    const hostFromWindow = typeof window !== 'undefined' ? window.location.origin : null
    const baseHost = hostFromEnv || hostFromWindow || 'https://amc-kanban.immedi.ai'
    return buildAgentInitPrompt({ apiKey, apiBaseUrl: `${baseHost}/api` })
  }

  const generateAgentKey = async () => {
    setGeneratingKey(true)
    try {
      const res = await fetch('/api/agents/keys', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setNewApiKey(data.apiKey)
        fetchSummary()
        fetchTasks()
      } else {
        alert(data.error || 'Failed to generate key')
      }
    } catch (e) {
      alert('Error generating key')
    } finally {
      setGeneratingKey(false)
    }
  }

  const handleCopy = (key: string | null = null) => {
    navigator.clipboard.writeText(getCopyCommand(key))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const agentOptions = Array.from(
    new Map(tasks.filter(t => t.assignee).map(t => [t.assignee.id, t.assignee])).values()
  )

  const searchLower = searchQuery.toLowerCase().trim()

  const activeTasks = tasks
    .filter(t => t.status === activeTab)
    .filter(t => priorityFilter === 'all' || (t.priority || 'medium') === priorityFilter)
    .filter(t => agentFilter === 'all' || t.assigneeId === agentFilter)
    .filter(t => !showOverdueOnly || (t.deadline && new Date(t.deadline).getTime() < Date.now() && t.status !== 'done'))
    .filter(t => {
      if (!searchLower) return true
      const assigneeName = t.assignee ? (t.assignee.nickname || t.assignee.email || '').toLowerCase() : ''
      const tagMatch = (t.tags || []).some((tag: string) => tag.toLowerCase().includes(searchLower))
      return (
        t.id.toLowerCase().includes(searchLower) ||
        (t.title || '').toLowerCase().includes(searchLower) ||
        (t.description || '').toLowerCase().includes(searchLower) ||
        (t.materials || '').toLowerCase().includes(searchLower) ||
        assigneeName.includes(searchLower) ||
        tagMatch
      )
    })
    .sort((a, b) => {
      if (sortBy === 'priority') {
        const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
        return (rank[a.priority || 'medium'] ?? 1) - (rank[b.priority || 'medium'] ?? 1)
      }
      if (sortBy === 'deadline') {
        return new Date(a.deadline || '9999-12-31').getTime() - new Date(b.deadline || '9999-12-31').getTime()
      }
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    })

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex flex-col font-sans transition-colors duration-300">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <img
            src="/amc-dashboard-logo.svg"
            alt="AMC Dashboard logo"
            className="w-10 h-10 rounded-xl shadow-md"
          />
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              AMC Dashboard
            </h1>
            <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">AI COLLABORATION PLATFORM</span>
          </div>
        </div>

        {/* Top Navigation Menu */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mx-auto">
          <button 
            onClick={() => setCurrentView('home')} 
            className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${currentView === 'home' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
          >
            <LayoutDashboard size={16} /> 首页
          </button>
          <button 
            onClick={() => setCurrentView('agents')} 
            className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${currentView === 'agents' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
          >
            <Bot size={16} /> AI 序列
          </button>
          <button 
            onClick={() => setCurrentView('archive')} 
            className={`flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${currentView === 'archive' ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
          >
            <Inbox size={16} /> 归档
          </button>
        </div>
        
        <div className="flex-1 flex justify-end w-full lg:w-auto gap-3">
          <button 
            onClick={generateAgentKey}
            disabled={generatingKey}
            className="flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-4 py-2 rounded-xl transition-all duration-300 w-full lg:w-auto border border-indigo-100 dark:border-indigo-800/50"
          >
            <Bot size={16} />
            <span className="text-xs font-bold">{generatingKey ? '生成中...' : '生成新 Agent 密钥'}</span>
          </button>
          <button 
            onClick={() => handleCopy()}
            className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-xl transition-all duration-300 w-full lg:w-auto border border-emerald-100 dark:border-emerald-800/50"
          >
            <span className="text-xs font-bold">复制初始化指令</span>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}

          <div className="relative">
            <button 
              onClick={() => setShowProfile(!showProfile)}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:shadow-md hover:scale-105 transition-all duration-300 border border-slate-200 dark:border-slate-700 overflow-hidden"
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="User avatar" className="w-full h-full object-cover" />
              ) : user ? (
                (user.nickname || user.email).charAt(0).toUpperCase()
              ) : <UserIcon size={18} />}
            </button>

            {showProfile && (
              <div className="absolute right-0 mt-3 w-[calc(100vw-2rem)] max-w-64 sm:w-64 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/50 dark:border-slate-700/50 overflow-hidden transform transition-all z-50 max-h-[70vh] overflow-y-auto">
                <div className="p-4 border-b border-slate-100/50 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{user?.nickname || user?.email}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{user?.email}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user?.role}</p>
                </div>
                <div className="p-2 space-y-1">
                  {user?.role === 'ADMIN' && (
                    <>
                      <button
                        onClick={() => { setShowProfile(false); router.push('/admin') }}
                        className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
                      >
                        <Users size={16} /> 用户管理
                      </button>
                      <button
                        onClick={async () => {
                          setShowProfile(false);
                          if (confirm('确定要清理所有无主任务吗？这些通常是已被遣散龙虾遗留的测试任务，清理操作不可逆。')) {
                            try {
                              const res = await fetch('/api/tasks/unassigned', { method: 'DELETE' });
                              if (res.ok) {
                                const data = await res.json();
                                alert(`清理成功：删除了 ${data.deletedCount} 个无主任务`);
                                fetchTasks();
                                fetchSummary();
                              } else {
                                alert('清理失败，请确保您是管理员');
                              }
                            } catch (error) {
                              alert('网络错误，请重试');
                            }
                          }
                        }}
                        className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors"
                      >
                        <Trash2 size={16} /> 清理无主任务
                      </button>
                    </>
                  )}
                  <button 
                    onClick={() => { setShowProfile(false); setShowSettings(true) }}
                    className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <Settings size={16} /> 个人设置
                  </button>
                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
                  <button 
                    onClick={handleLogout} 
                    className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                  >
                    <LogOut size={16} /> 退出登录
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {currentView === 'home' && (
        <div className="mb-6 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <span className="text-emerald-500">⭐</span> 监控大盘
          </h2>

          {summary ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div onClick={() => openAgentsWithFilter('all')} className="cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl flex flex-col items-center text-center hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800/50">
                <Users size={20} className="text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">协作Agent</p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{summary.collaborativeAgentsCount}</p>
              </div>
              <div onClick={() => openAgentsWithFilter('online')} className="cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl flex flex-col items-center text-center hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors border border-transparent hover:border-emerald-100 dark:hover:border-emerald-800/50">
                <Activity size={20} className="text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">活跃 Agent</p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{summary.runningAgentsCount}</p>
              </div>
              <div onClick={() => setActiveTab('pending')} className="cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl flex flex-col items-center text-center hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors border border-transparent hover:border-amber-100 dark:hover:border-amber-800/50">
                <AlertCircle size={20} className="text-amber-500 mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">待输入任务</p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{summary.pendingTasksCount}</p>
              </div>
              <div onClick={() => setActiveTab('done')} className="cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl flex flex-col items-center text-center hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border border-transparent hover:border-blue-100 dark:hover:border-blue-800/50">
                <CheckCircle2 size={20} className="text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">今日完成</p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{summary.completedTasksCount}</p>
              </div>
            </div>
          ) : (
            <div className="animate-pulse">
              <div className="w-full h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
            </div>
          )}
        </div>
      )}

      {currentView === 'home' ? (
        <div className="flex flex-col xl:flex-row gap-8 items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Left Side: Tabs and Grid */}
          <div className="flex-1 w-full bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
              {COLUMNS.map(col => {
                const count = tasks.filter(t => t.status === col.id).length;
                const isActive = activeTab === col.id;
                return (
                  <button
                    key={col.id}
                    onClick={() => setActiveTab(col.id)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 whitespace-nowrap ${isActive ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700'}`}
                  >
                    {col.title}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-4">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.65 16.65A7.5 7.5 0 1116.65 2a7.5 7.5 0 010 14.65z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks by title, description, tags, assignee, or task ID…"
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-400 placeholder:font-normal outline-none focus:ring-2 focus:ring-emerald-400/50"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              {SHOW_LANE_FILTERS && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 outline-none"
                  >
                    <option value="all">All priorities</option>
                    <option value="high">High priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="low">Low priority</option>
                  </select>
                  <select
                    value={agentFilter}
                    onChange={(e) => setAgentFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 outline-none"
                  >
                    <option value="all">All agents</option>
                    {agentOptions.map((agent: any) => (
                      <option key={agent.id} value={agent.id}>{agent.nickname || agent.email}</option>
                    ))}
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 outline-none"
                  >
                    <option value="updatedAt">Sort: recently updated</option>
                    <option value="priority">Sort: priority</option>
                    <option value="deadline">Sort: deadline</option>
                  </select>
                  <button
                    onClick={() => setShowOverdueOnly(!showOverdueOnly)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${showOverdueOnly ? 'bg-red-500 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}
                  >
                    {showOverdueOnly ? 'Showing overdue' : 'Overdue only'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
              {activeTasks.length === 0 ? (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400">
                  <div className="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
                    <Activity size={32} className="opacity-50" />
                  </div>
                  <p className="font-medium text-slate-500">
                    {searchQuery || priorityFilter !== 'all' || agentFilter !== 'all' || showOverdueOnly
                      ? 'No tasks match the current search or filters'
                      : 'No tasks in this lane'}
                  </p>
                  {(searchQuery || priorityFilter !== 'all' || agentFilter !== 'all' || showOverdueOnly) && (
                    <button
                      onClick={() => { setSearchQuery(''); setPriorityFilter('all'); setAgentFilter('all'); setShowOverdueOnly(false) }}
                      className="mt-3 text-xs font-bold text-emerald-500 hover:text-emerald-600 underline"
                    >Clear all filters</button>
                  )}
                </div>
              ) : (
                activeTasks.map(task => (
                  <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} onTagClick={(tag) => setSearchQuery(tag)} />
                ))
              )}
            </div>
          </div>

          {/* Right Side: Delivery */}
          <div className="w-full xl:w-[400px] flex-shrink-0 flex flex-col gap-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex-1 min-h-[300px]">
              <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-6">
                <span className="text-amber-500">🏆</span> 交付成果展示
              </h2>
              <div className="space-y-4">
                {doneTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 opacity-60">
                    <Inbox size={32} className="mb-3" />
                    <p className="text-sm font-medium">暂无交付成果</p>
                  </div>
                ) : (
                  doneTasks.map(task => (
                    <div 
                      key={task.id} 
                      onClick={() => setSelectedTask(task)}
                      style={task.assignee?.themeColor ? { borderColor: task.assignee.themeColor } : undefined}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors border border-transparent group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0 border border-white dark:border-slate-700 shadow-sm group-hover:scale-105 transition-transform">
                          {task.assignee?.avatar ? (
                            <img src={task.assignee.avatar} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                          ) : 'AI'}
                        </div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{task.title}</p>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap ml-2 font-medium">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : currentView === 'agents' ? (
        <div className="flex-1">
          <AgentSequenceView initialFilter={agentsFilter} />
        </div>
      ) : (
        <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <ArchiveView onTaskClick={setSelectedTask} />
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

      {showSettings && user && <UserSettingsModal user={user} onClose={() => setShowSettings(false)} onUpdated={fetchUser} />}
      
      {newApiKey && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 p-8 relative animate-in fade-in zoom-in duration-300">
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">🎉 新龙虾已孵化</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">我们已在系统中为您预注册了一只新的 AI 员工，并为其分配了专属的身份密钥。</p>
            
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-2">⚠️ 唯一显示机会</p>
              <p className="text-xs text-amber-700 dark:text-amber-500">
                系统已为您预注册了新的 AI 身份。你有两种接入方式：<br/>
                <b>方式一：</b> 单独复制 Key 填入底层 MCP 配置（推荐，最稳定）。<br/>
                <b>方式二：</b> 一键复制包含 Key 的完整指令发给 AI，让它动态携带。
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">🔑 独立 API Key</label>
              <div className="relative">
                <input 
                  type="text" 
                  readOnly 
                  value={newApiKey} 
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-slate-800 dark:text-slate-100 font-mono text-sm shadow-inner" 
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(newApiKey);
                    setKeyCopied(true);
                    setTimeout(() => setKeyCopied(false), 2000);
                  }}
                  className="absolute right-2 top-2 p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-500 transition-colors"
                  title="Copy API Key"
                >
                  {keyCopied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div className="mb-8">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">📜 包含 Key 的完整初始化指令</label>
              <div className="relative">
                <textarea 
                  readOnly 
                  value={getCopyCommand(newApiKey)} 
                  className="w-full h-40 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-slate-800 dark:text-slate-100 font-mono text-xs shadow-inner resize-none focus:outline-none" 
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(getCopyCommand(newApiKey));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="absolute right-2 top-2 p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-500 transition-colors"
                  title="Copy Full Command"
                >
                  {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <button 
              onClick={() => setNewApiKey(null)} 
              className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3.5 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all shadow-md hover:shadow-lg"
            >
              我已经复制完毕，确认关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
