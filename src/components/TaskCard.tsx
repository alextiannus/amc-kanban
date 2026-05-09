import { AlertCircle } from 'lucide-react'

export default function TaskCard({ task, onClick }: { task: any, onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`group bg-white dark:bg-slate-800 p-5 rounded-3xl cursor-pointer border ${task.status === 'pending' && task.requiredInput ? 'border-amber-400 shadow-md ring-2 ring-amber-400/20' : 'border-slate-100 dark:border-slate-700/60 shadow-sm'} hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-900/50 hover:-translate-y-1 transition-all duration-300 flex flex-col gap-4 relative`}
    >
      <div className="flex items-start gap-4">
        {task.assignee ? (
          <div 
            style={task.assignee.themeColor ? { backgroundColor: `${task.assignee.themeColor}20`, color: task.assignee.themeColor } : undefined}
            className={`w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center text-xs font-bold shadow-sm overflow-hidden border border-white dark:border-slate-800 ${!task.assignee.themeColor ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : ''}`}
          >
            {task.assignee.avatar ? (
              <img src={task.assignee.avatar} alt="Agent Avatar" className="w-full h-full object-cover" />
            ) : (
              task.assignee.email.substring(0, 2).toUpperCase()
            )}
          </div>
        ) : (
          <div className="w-12 h-12 flex-shrink-0 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
            <span className="text-slate-400">?</span>
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 leading-snug truncate">{task.title}</h3>
            {task.status === 'pending' && task.requiredInput && (
              <span className="flex-shrink-0 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Require Input</span>
            )}
            {task.status === 'done' && (
              <span className="flex-shrink-0 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">精选</span>
            )}
          </div>
          <p className="text-xs font-medium text-slate-400 truncate mt-1">
            {task.assignee ? task.assignee.email.split('@')[0] : 'Unassigned'}
          </p>
        </div>
      </div>
      
      <div className="flex-1">
        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
          {task.description || task.materials || "暂无详细描述，点击查看更多信息。"}
        </p>
      </div>

      <div className="flex items-center gap-2 mt-1">
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> {task.assignee?.insights ? '专属流程' : '学习成长'}
        </span>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          效率工具
        </span>
      </div>

      <div className="flex items-center gap-4 mt-2 pt-4 border-t border-slate-100 dark:border-slate-800/60 text-xs font-semibold text-slate-400">
        <span className="flex items-center gap-1.5 group-hover:text-emerald-500 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {new Date(task.createdAt).toLocaleDateString()}
        </span>
        <span className="flex items-center gap-1.5 group-hover:text-emerald-500 transition-colors uppercase tracking-wider">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {task.status.replace('_', ' ')}
        </span>
      </div>
    </div>
  )
}
