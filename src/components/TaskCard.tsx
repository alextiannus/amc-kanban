import { useState } from 'react'
import { Calendar, Clock, Flag, Copy, Check } from 'lucide-react'
import AvatarImage from './AvatarImage'

type TaskAssignee = {
  nickname?: string | null
  email?: string | null
  themeColor?: string | null
  avatar?: string | null
  type?: string | null
}

type TaskDependency = {
  blockerTask?: {
    status: string
  } | null
}

type TaskCardTask = {
  id: string
  status: string
  title?: string | null
  priority?: string | null
  deadline?: string | null
  estimatedHours?: number | null
  requiredInput?: string | null
  description?: string | null
  materials?: string | null
  tags?: string[] | null
  createdAt?: string | null
  assignee?: TaskAssignee | null
  assigneeId?: string | null
  dependencies?: TaskDependency[] | null
}

const priorityStyles: Record<string, string> = {
  high: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300',
  medium: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

export default function TaskCard({ task, onClick, onTagClick }: { task: TaskCardTask, onClick?: () => void, onTagClick?: (tag: string) => void }) {
  const [idCopied, setIdCopied] = useState(false)
  const assigneeThemeColor = task.assignee?.themeColor
  const assigneeEmailPrefix = task.assignee?.email?.split('@')[0] ?? ''

  const activeBlockers = (task.dependencies || []).filter(
    (dep) => dep.blockerTask && !['done', 'void'].includes(dep.blockerTask.status)
  )
  const isBlocked = activeBlockers.length > 0

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(task.id)
    setIdCopied(true)
    setTimeout(() => setIdCopied(false), 2000)
  }

  return (
    <div
      onClick={onClick}
      style={assigneeThemeColor ? { borderColor: assigneeThemeColor } : undefined}
      className={`group bg-white dark:bg-slate-800 p-5 rounded-3xl cursor-pointer border ${task.status === 'pending' && task.requiredInput ? 'shadow-md ring-2 ring-amber-400/20' : 'shadow-sm'} border-slate-100 dark:border-slate-700/60 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col gap-4 relative`}
    >
      <div className="flex items-start gap-4">
        {task.assignee ? (
          <div 
            style={task.assignee.themeColor ? { backgroundColor: `${task.assignee.themeColor}20`, color: task.assignee.themeColor } : undefined}
            className={`w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center text-xs font-bold shadow-sm overflow-hidden border border-white dark:border-slate-800 ${!task.assignee.themeColor ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : ''}`}
          >
            {task.assignee.avatar ? (
              <AvatarImage src={task.assignee.avatar} alt="Agent Avatar" className="w-full h-full object-cover" />
            ) : (
              (task.assignee.nickname || assigneeEmailPrefix || '??').substring(0, 2).toUpperCase()
            )}
          </div>
        ) : (
          <div className="w-12 h-12 flex-shrink-0 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
            <span className="text-slate-400">?</span>
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 leading-snug truncate">{task.title || 'Untitled task'}</h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isBlocked && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Blocked
                </span>
              )}
              {task.status === 'pending' && task.requiredInput && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Require Input</span>
              )}
              {task.status === 'done' && (
                <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">精选</span>
              )}
            </div>
          </div>
          <p className="text-xs font-medium text-slate-400 truncate mt-1">
            {task.assignee ? (task.assignee.nickname || assigneeEmailPrefix || 'Unassigned') : 'Unassigned'}
          </p>
        </div>
      </div>
      
      {task.status === 'done' ? (
        /* ── 交付成果 — shown directly on Done cards ──────────────── */
        (task.description || task.materials) ? (
          <div className="bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-800/40 rounded-2xl px-3.5 py-2.5">
            <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              交付成果
            </p>
            <p className="text-xs text-emerald-800 dark:text-emerald-200 line-clamp-3 leading-relaxed font-medium">
              {task.description || task.materials}
            </p>
          </div>
        ) : null
      ) : (
        <div className="flex-1">
          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
            {task.description || task.materials || "暂无详细描述，点击查看更多信息。"}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${priorityStyles[task.priority || 'medium'] || priorityStyles.medium}`}>
          <Flag size={12} /> {(task.priority || 'medium').toUpperCase()}
        </span>
        {task.deadline && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1.5">
            <Calendar size={12} /> {new Date(task.deadline).toLocaleDateString()}
          </span>
        )}
        {task.estimatedHours != null && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center gap-1.5">
            <Clock size={12} /> {task.estimatedHours}h
          </span>
        )}
        {(task.tags || []).slice(0, 3).map((tag: string) => (
          <button
            key={tag}
            onClick={(e) => {
              e.stopPropagation()
              if (onTagClick) onTagClick(tag)
            }}
            className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400 transition-colors"
          >
            #{tag}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-2 pt-4 border-t border-slate-100 dark:border-slate-800/60 text-xs font-semibold text-slate-400">
        <span className="flex items-center gap-1.5 group-hover:text-emerald-500 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {task.createdAt ? new Date(task.createdAt).toLocaleDateString() : 'Unknown date'}
        </span>
        <span className="flex items-center gap-1.5 group-hover:text-emerald-500 transition-colors uppercase tracking-wider">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {task.status.replace('_', ' ')}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <span className="font-mono text-[10px] text-slate-300 dark:text-slate-600">#{task.id.substring(0, 8)}</span>
          <button
            onClick={handleCopyId}
            title="Copy task ID"
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-emerald-500 transition-all"
          >
            {idCopied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
          </button>
        </span>
      </div>
    </div>
  )
}
