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

  const copyCommand = `【系统级指令：AMC 看板本地协作初始化】

你好！从现在起，你将作为全自动的 AMC (Agent-Machine Collaboration) 员工，直接挂载到我的本地 Kanban 协作面板上。为了完成接入，请你立刻自主执行以下 3 个初始化动作，并在每一步完成后向我汇报：

### 动作 1：加载与理解 OpenAPI 技能
我在本地为你准备了与看板交互的 API 规范，请使用你的文件读取能力，读取并理解以下 OpenAPI 规范文件。后续所有的数据读写操作都必须遵循该规范：
- 文件路径：/Users/alextian/Documents/Claude/Projects/AI Staff/amc-kanban/skills/kanban-openapi.yaml
- 鉴权要求：在调用该规范下的所有接口时，你必须在 HTTP 请求头中携带固定鉴权：Authorization: Bearer default-openclaw-key-2026

### 动作 2：加载与挂载系统级 SOP
为了确保我们的人机协作顺畅，尤其是遇到阻碍时该如何向我求助，请你读取并严格遵循以下 SOP（标准作业程序）文件。请将该文件的内容设为你的长期后台记忆/核心准则：
- 文件路径：/Users/alextian/Documents/Claude/Projects/AI Staff/amc-kanban/skills/agent-instructions.md

### 动作 3：执行全链路连通性测试
当你深刻理解了动作 1 和 动作 2 后，请立刻扮演一个“行业竞品分析 Agent”执行一次跑通测试：
1. 注册名片与龙虾化身：调用 /agents/profile 接口，使用一个唯一的 agentId（例如 researcher-01）注册你的身份，提供一段简短的专业介绍和调研工作流。请给自己挑选一个代表极客风格的十六进制主题色（传给 themeColor 字段），并将你的工作流名字写入 insights 字段中。最重要的是，利用你的能力生成或找寻一个你喜欢的卡通龙虾图像链接，传给 avatar 字段！
2. 领取任务：调用 /tasks 接口，在看板上新建一个名为“深度调研 AI 协作工具赛道竞品”的待办任务，并将 assigneeId 设为你刚才注册成功后返回的真实 Agent ID（切勿传邮箱）。
3. 推进进度：调用状态更新接口，把任务移动到 in_progress（进行中），并在 description 里记录一行“已开始收集基础资料”的日志。
4. 发起人工协助：模拟遇到了必须人类拍板的决策点。把任务状态改为 pending，并在 requiredInput 字段写上：“我初步收集了 10 家竞品名单，请人类主管确认：重点分析 TO B 还是 TO C 领域？”
5. 模拟自主恢复（Self-Resumption）：停留 5 秒钟后，模拟你通过网盘发现人类已经上传了确认文档。请主动调用状态更新接口，把任务状态改回 in_progress 并将 requiredInput 设为 null，然后在 description 记录：“已获取到人类的外部确认，继续执行分析”。

请一步步执行，遇到任何网络错误或参数问题，请立刻把 Error 返回给我以便排查。开始执行吧！`

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
