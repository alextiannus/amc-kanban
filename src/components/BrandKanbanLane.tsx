'use client'

import { useState, useEffect, useCallback } from 'react'
import { Inbox } from 'lucide-react'
import TaskCard from './TaskCard'
import TaskModal from './TaskModal'
import { COLUMNS } from './dashboard/AgentsWorkflowView'

type KanbanTask = {
  id: string
  status: string
  title?: string
  description?: string | null
  materials?: string | null
  createdAt?: string
  updatedAt?: string | null
  assigneeId?: string | null
  assignee?: {
    nickname?: string | null
    email?: string | null
    themeColor?: string | null
    avatar?: string | null
    type?: string | null
  } | null
  tags?: string[] | null
}

/**
 * A brand-scoped Kanban swim-lane.
 * Fetches /api/tasks?active=true&brandId=<brandId> and renders
 * the same tab-strip + search + TaskCard grid as the main KanbanBoard.
 */
export default function BrandKanbanLane({ brandId }: { brandId: string }) {
  const [tasks, setTasks] = useState<KanbanTask[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks?active=true&brandId=${brandId}`)
      if (res.ok) {
        const data = await res.json()
        setTasks(Array.isArray(data) ? data : (data.tasks ?? []))
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [brandId])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchTasks()
    })
  }, [fetchTasks])

  const searchLower = searchQuery.toLowerCase().trim()

  const activeTasks = tasks
    .filter(t => t.status !== 'void') // always hide cancelled tasks
    .filter(t => t.status === activeTab)
    .filter(t => {
      if (!searchLower) return true
      const assigneeName = t.assignee
        ? (t.assignee.nickname || t.assignee.email || '').toLowerCase()
        : ''
      const tagMatch = (t.tags || []).some((tag: string) =>
        tag.toLowerCase().includes(searchLower)
      )
      return (
        t.id.toLowerCase().includes(searchLower) ||
        (t.title || '').toLowerCase().includes(searchLower) ||
        (t.description || '').toLowerCase().includes(searchLower) ||
        (t.materials || '').toLowerCase().includes(searchLower) ||
        assigneeName.includes(searchLower) ||
        tagMatch
      )
    })
    .sort(
      (a, b) => {
        const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime()
        const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime()
        return bTime - aTime
      }
    )

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-0">
          {/* Tab bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
            {COLUMNS.filter(col => col.id !== 'void').map((col: { id: string; title: string }) => {
              const count = tasks.filter(t => t.status === col.id).length
              const isActive = activeTab === col.id
              return (
                <button
                  key={col.id}
                  onClick={() => setActiveTab(col.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 whitespace-nowrap flex-shrink-0 ${
                    isActive
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                      : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700'
                  }`}
                >
                  {col.title}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Search */}
          <div className="mb-5 relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 21l-4.35-4.35M16.65 16.65A7.5 7.5 0 1116.65 2a7.5 7.5 0 010 14.65z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索任务标题、描述、标签或 Agent…"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-sm font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-400 placeholder:font-normal outline-none focus:ring-2 focus:ring-emerald-400/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Task grid */}
        <div className="px-6 pb-6">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 bg-slate-100 dark:bg-slate-800 rounded-3xl animate-pulse" />
              ))}
            </div>
          ) : activeTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 opacity-60">
              <Inbox size={36} className="mb-3" />
              <p className="text-sm font-bold">
                  {searchQuery
                  ? '没有找到匹配的任务'
                  : `${COLUMNS.find((c: { id: string }) => c.id === activeTab)?.title} 暂无任务`}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-3 text-xs font-bold text-emerald-600 hover:underline"
                >
                  清除搜索
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => setSelectedTask(task)}
                  onTagClick={tag => setSearchQuery(tag)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          allTasks={tasks}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { fetchTasks(); setSelectedTask(null) }}
          onTagFilter={tag => { setSelectedTask(null); setSearchQuery(tag) }}
        />
      )}
    </>
  )
}
