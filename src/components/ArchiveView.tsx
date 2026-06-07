import { useState, useEffect, useCallback } from 'react'
import { Inbox, ChevronLeft, ChevronRight, Activity, Calendar } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AvatarImage from './AvatarImage'
import ArchiveFilters from './ArchiveFilters'
type ArchiveTask = {
  id: string
  title?: string
  description?: string | null
  createdAt: string
  status: string
  workflow?: string | null
  assignee?: {
    id?: string | null
    nickname?: string | null
    email?: string | null
    avatar?: string | null
    themeColor?: string | null
  } | null
}

const markdownComponents = {
  p: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  a: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement> & React.PropsWithChildren) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
      {children}
    </a>
  ),
}

export default function ArchiveView({ onTaskClick }: { onTaskClick: (task: ArchiveTask) => void }) {
  const [allTasks, setAllTasks] = useState<ArchiveTask[]>([])
  const [tasks, setTasks] = useState<ArchiveTask[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ agent: '', workflow: '', dateFrom: '', dateTo: '' })
  const limit = 20

  const applyFilters = useCallback((taskList: ArchiveTask[]) => {
    let filtered = taskList
    if (filters.agent) {
      filtered = filtered.filter(t => t.assignee?.id === filters.agent)
    }
    if (filters.workflow) {
      filtered = filtered.filter(t => t.workflow === filters.workflow)
    }
    if (filters.dateFrom) {
      filtered = filtered.filter(t => new Date(t.createdAt) >= new Date(filters.dateFrom))
    }
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo)
      endDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(t => new Date(t.createdAt) <= endDate)
    }
    setTasks(filtered)
  }, [filters])

  const fetchArchiveTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks?archive=true&page=${page}&limit=${limit}`)
      if (res.ok) {
        const data = await res.json()
        const taskList = (data.tasks ?? (Array.isArray(data) ? data : [])) as ArchiveTask[]
        setAllTasks(taskList)
        applyFilters(taskList)
        setTotalPages(data.pagination?.totalPages ?? 1)
        setTotal(data.pagination?.total ?? taskList.length)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [applyFilters, page])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchArchiveTasks()
    })
  }, [fetchArchiveTasks])

  const handleFilter = (newFilters: { agent: string; workflow: string; dateFrom: string; dateTo: string }) => {
    setFilters(newFilters)
    applyFilters(allTasks)
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 flex flex-col h-full min-h-[600px]">
      <div className="flex flex-col gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-3">
            🗄️ 归档库 <span className="text-sm font-normal text-slate-400 bg-slate-50 dark:bg-slate-950 px-3 py-1 rounded-full">{total} 个历史任务</span>
          </h2>
        </div>
        {/* 筛选区块 */}
        <ArchiveFilters tasks={allTasks} onFilter={handleFilter} />
      </div>

      <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400">
            <Activity size={32} className="animate-pulse" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400">
            <Inbox size={48} className="mb-4 opacity-50" />
            <p>归档库空空如也</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map(task => (
              (() => {
                const assigneeLabel = task.assignee?.nickname
                  ?? (typeof task.assignee?.email === 'string' ? task.assignee.email.split('@')[0] : null)
                  ?? 'Unknown'

                return (
              <div 
                key={task.id} 
                onClick={() => onTaskClick(task)}
                style={task.assignee?.themeColor ? { borderColor: task.assignee.themeColor } : undefined}
                className="bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5 cursor-pointer transition-all duration-300 flex flex-col sm:flex-row gap-4 sm:items-center"
              >
                <div className="flex items-center gap-4 flex-shrink-0 w-48">
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center text-xs font-bold text-slate-600 border border-slate-200 dark:border-slate-600 shadow-sm overflow-hidden flex-shrink-0">
                    {task.assignee?.avatar ? (
                      <AvatarImage src={task.assignee.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : 'AI'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{assigneeLabel}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${task.status === 'done' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                      {task.status}
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base mb-1 truncate">{task.title}</h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 prose prose-sm dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{task.description || '无详细描述'}</ReactMarkdown>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-slate-400 flex-shrink-0 text-xs font-medium bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <Calendar size={14} />
                  {new Date(task.createdAt).toLocaleString()}
                </div>
              </div>
                )
              })()
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            第 <span className="font-bold text-slate-800 dark:text-slate-200">{page}</span> 页，共 <span className="font-bold text-slate-800 dark:text-slate-200">{totalPages}</span> 页
          </p>
          <div className="flex gap-2">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
