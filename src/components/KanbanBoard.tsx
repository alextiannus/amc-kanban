'use client'

import { useState, useEffect } from 'react'
import TaskCard from './TaskCard'
import TaskModal from './TaskModal'
import UserSettingsModal from './UserSettingsModal'
import AgentSequenceView from './AgentSequenceView'
import { LogOut, Activity, XCircle, AlertCircle, CheckCircle2, User as UserIcon, Copy, Check, Sun, Moon, Inbox, Settings, Users, LayoutDashboard, Bot } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'

export const COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'pending', title: 'Require Input', highlight: true },
  { id: 'done', title: 'Done' },
  { id: 'void', title: 'Void' },
]

export default function KanbanBoard() {
  const [tasks, setTasks] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [summary, setSummary] = useState<{
    runningAgentsCount: number;
    notRunningAgentsCount: number;
    pendingTasksCount: number;
    completedTasksCount: number;
  } | null>(null)
  const [user, setUser] = useState<{ id: string, email: string, role: string } | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  
  // Navigation State
  const [currentView, setCurrentView] = useState<'home' | 'agents'>('home')
  const [agentsFilter, setAgentsFilter] = useState<'all' | 'online' | 'offline'>('all')
  
  const [copied, setCopied] = useState(false)
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

    // Auto-polling for live AI updates
    const interval = setInterval(() => {
      fetchTasks()
      fetchSummary()
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const fetchUser = async () => {
    const res = await fetch('/api/auth/me')
    if (res.ok) {
      setUser(await res.json())
    }
  }

  const fetchTasks = async () => {
    const res = await fetch('/api/tasks')
    if (res.ok) {
      const data = await res.json()
      setTasks(data)
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

  const copyCommand = `【系统级指令：AMC 看板协作初始化】

你是 AMC (Agent-Machine Collaboration) 体系中的龙虾 AI 员工。请通过 AMC Kanban 的 MCP/API Skill 执行工作，并将可追踪的工作全过程沉淀到看板。

### 动作 1：加载规范
请先读取以下在线资源：
- API 规范：GET https://amc-kanban.immedi.ai/api/meta/openapi
- SOP 规范：GET https://amc-kanban.immedi.ai/api/meta/sop
- 头像规范：GET https://amc-kanban.immedi.ai/api/meta/avatar-guide

说明：看板 API 的 Authorization 由运行环境注入，不要在对话或日志中泄露密钥。

### 动作 1.5：获取个人 API Key
首次注册时，系统会为你分配一个独特的 API Key，用于在后续所有请求中识别你的身份：
1. 执行注册时（动作 2），系统会在响应中返回你的 apiKey
2. **妥善保管此 key，这是你在 AMC 中的唯一身份标识**
3. 后续所有 API 调用都应包含此 header：Authorization: Bearer <your-apiKey>
4. 不要将此 key 泄露给其他龙虾或人类，不要记录在明文日志中

### 动作 2：注册 AI 名片
调用 /agents/profile 完成注册或刷新：
1. 使用固定且具备唯一标识的 agentId（强烈建议使用能代表你身份的英文名或UUID，例如 amc-researcher-01）
2. **nickname 使用你自己的机器人昵称**（你在系统中的真实名字或既定名称，例如你是一个名叫「分析师小龙虾」的机器人，就用「分析师小龙虾」）
3. introduction 说明职责与能力边界
4. workflow 填写核心工作流名
5. themeColor 使用十六进制主题色
6. insights 写工作流名或高层执行规则

头像规则：默认按头像规范中的 Chinese prompt (recommended) 生成 Q 版龙虾头像；若用户明确提供自定义头像 URL，优先使用用户头像。

响应中会包含 apiKey 字段，这是你的个人身份 key。

### 动作 3：上板与状态闭环
任何有意义、可追踪、可交付的工作都必须上板，不允许隐形工作。
1. 创建或领取任务，确保 assigneeId 为你自己的真实 Agent ID
2. 开始执行前，状态置为 in_progress
3. 执行过程中持续写入 description（关键进展、决策、下一步）
4. 遇阻塞时，状态置为 pending，并在 requiredInput 写明需要人类提供的信息
5. 获取人类输入后，状态改回 in_progress，requiredInput 置空
6. 完成后置为 done，并提交结果摘要

每完成一步都向我汇报结果；若报错，返回接口名、HTTP 状态码、错误信息和关键参数。`

  const handleCopy = () => {
    navigator.clipboard.writeText(copyCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const activeTasks = tasks.filter(t => t.status === activeTab)
  const doneTasks = tasks.filter(t => t.status === 'done')

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex flex-col font-sans transition-colors duration-300">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shadow-md">
            <span className="font-black text-xl">AC</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              AMC Command Center
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
        </div>
        
        <div className="flex-1 flex justify-end w-full lg:w-auto">
          <button 
            onClick={handleCopy}
            className="flex items-center gap-3 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-xl transition-all duration-300 w-full lg:w-auto border border-emerald-100 dark:border-emerald-800/50"
          >
            <span className="text-xs font-medium truncate max-w-[250px] xl:max-w-[400px]">复制初始化指令接入 Agent</span>
            {copied ? <Check size={14} className="flex-shrink-0" /> : <Copy size={14} className="flex-shrink-0" />}
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
              className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:shadow-md hover:scale-105 transition-all duration-300 border border-slate-200 dark:border-slate-700"
            >
              {user ? user.email.charAt(0).toUpperCase() : <UserIcon size={18} />}
            </button>

            {showProfile && (
              <div className="absolute right-0 mt-3 w-64 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/50 dark:border-slate-700/50 overflow-hidden transform transition-all z-50">
                <div className="p-4 border-b border-slate-100/50 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{user?.email}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user?.role}</p>
                </div>
                <div className="p-2 space-y-1">
                  {user?.role === 'ADMIN' && (
                    <button
                      onClick={() => { setShowProfile(false); router.push('/admin') }}
                      className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                      <Users size={16} /> 用户管理
                    </button>
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

            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
              {activeTasks.length === 0 ? (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400">
                  <div className="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
                    <Activity size={32} className="opacity-50" />
                  </div>
                  <p className="font-medium text-slate-500">No tasks in this lane</p>
                </div>
              ) : (
                activeTasks.map(task => (
                  <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} />
                ))
              )}
            </div>
          </div>

          {/* Right Side: Dashboard */}
          <div className="w-full xl:w-[400px] flex-shrink-0 flex flex-col gap-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-6">
                <span className="text-emerald-500">⭐</span> 监控大盘
              </h2>
              
              {summary ? (
                <div className="grid grid-cols-2 gap-4">
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
                  <div onClick={() => openAgentsWithFilter('offline')} className="cursor-pointer group bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl flex flex-col items-center text-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                    <XCircle size={20} className="text-slate-400 mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">离线 Agent</p>
                    <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{summary.notRunningAgentsCount}</p>
                  </div>
                </div>
              ) : (
                <div className="animate-pulse flex gap-4 flex-wrap">
                  <div className="w-full h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
                </div>
              )}
            </div>

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
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 group"
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
      ) : (
        <div className="flex-1">
          <AgentSequenceView initialFilter={agentsFilter} />
        </div>
      )}

      {selectedTask && (
        <TaskModal 
          task={selectedTask} 
          onClose={() => setSelectedTask(null)} 
          onUpdate={() => {
            fetchTasks()
            fetchSummary()
            setSelectedTask(null)
          }}
        />
      )}

      {showSettings && user && <UserSettingsModal user={user} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
