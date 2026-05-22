'use client'

import { useState } from 'react'
import { Users, Activity, AlertCircle, CheckCircle2 } from 'lucide-react'
import TaskCard from '../TaskCard'
import AgentSequenceView from '../AgentSequenceView'

export const COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'pending', title: 'Require Input', highlight: true },
  { id: 'done', title: 'Done' },
  { id: 'void', title: 'Void' },
]

interface AgentsWorkflowViewProps {
  tasks: any[]
  summary: {
    collaborativeAgentsCount: number
    runningAgentsCount: number
    notRunningAgentsCount: number
    pendingTasksCount: number
    completedTasksCount: number
  } | null
  activeBrand: { id: string; name: string } | null
  onTaskClick: (task: any) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  activeTab: string
  setActiveTab: (tab: string) => void
  agentsFilter: 'all' | 'online' | 'offline'
  setAgentsFilter: (filter: 'all' | 'online' | 'offline') => void
}

export default function AgentsWorkflowView({
  tasks,
  summary,
  activeBrand,
  onTaskClick,
  searchQuery,
  setSearchQuery,
  activeTab,
  setActiveTab,
  agentsFilter,
  setAgentsFilter,
}: AgentsWorkflowViewProps) {
  // Local filtering states that don't need to be bubbled up
  const [priorityFilter] = useState('all')
  const [agentFilter] = useState('all')
  const [sortBy] = useState('updatedAt')
  const [showOverdueOnly] = useState(false)

  const openAgentsWithFilter = (filter: 'all' | 'online' | 'offline') => {
    setAgentsFilter(filter)
  }

  const searchLower = searchQuery.toLowerCase().trim()

  const activeTasks = tasks
    .filter(t => t.status !== 'void') // always hide cancelled tasks
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
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* ── 监控大盘 ── */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
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

      {/* ── 全局任务看板（原首页内容）── */}
      <div className="w-full bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {COLUMNS.filter(col => col.id !== 'void').map(col => {
            const count = tasks.filter(t => t.status === col.id).length
            const isActive = activeTab === col.id
            return (
              <button
                key={col.id}
                onClick={() => setActiveTab(col.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                    : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700'
                }`}
              >
                {col.title}
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mb-6 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.65 16.65A7.5 7.5 0 1116.65 2a7.5 7.5 0 010 14.65z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by title, description, tags, assignee, or task ID…"
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-sm font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-400 placeholder:font-normal outline-none focus:ring-2 focus:ring-emerald-400/50"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
          {activeTasks.length === 0 ? (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400">
              <div className="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
                <Activity size={32} className="opacity-50" />
              </div>
              <p className="font-medium text-slate-500">
                {searchQuery ? 'No tasks match the current search' : 'No tasks in this lane'}
              </p>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="mt-3 text-xs font-bold text-emerald-500 hover:text-emerald-600 underline">
                  Clear search
                </button>
              )}
            </div>
          ) : (
            activeTasks.map(task => (
              <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} onTagClick={(tag) => setSearchQuery(tag)} />
            ))
          )}
        </div>
      </div>

      {/* ── AI 序列 + 活动战报 ── */}
      <AgentSequenceView initialFilter={agentsFilter} brandId={activeBrand?.id} />
    </div>
  )
}
