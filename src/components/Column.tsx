import { useDroppable } from '@dnd-kit/core'
import { Inbox } from 'lucide-react'
import TaskCard from './TaskCard'
import AvatarImage from './AvatarImage'

export default function Column({ column, tasks, onTaskClick }: { column: any, tasks: any[], onTaskClick: (t: any) => void }) {
  const { setNodeRef } = useDroppable({ id: column.id })

  return (
    <div 
      ref={setNodeRef} 
      className={`flex flex-col flex-shrink-0 w-80 h-full rounded-2xl p-3 transition-all 
        ${column.id === 'todo' ? 'bg-slate-100 dark:bg-slate-800' : 
          column.id === 'in_progress' ? 'bg-blue-50 dark:bg-blue-900/60' : 
          column.id === 'pending' ? 'bg-orange-50 dark:bg-orange-900/60' : 
          column.id === 'done' ? 'bg-green-50 dark:bg-green-900/60' : 
          'bg-slate-100 dark:bg-slate-900'}
        ${column.highlight ? 'ring-2 ring-indigo-400 shadow-md' : ''}`}
    >
      <div className="flex items-center justify-between mb-3 px-3 pt-3">
        <h2 className="font-bold text-slate-700 dark:text-slate-200 text-sm">{column.title}</h2>
        <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold bg-white/60 dark:bg-slate-800 py-1 px-2.5 rounded-full">{tasks.length}</span>
      </div>
      <div className="p-4 flex-1 overflow-y-auto min-h-[150px]">
        {tasks.length === 0 ? (
          <div className="h-[200px] w-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 bg-white/30 dark:bg-slate-800/30">
            <Inbox size={32} className="mb-2 opacity-50" />
            <span className="text-sm font-medium text-center">No active tasks<br/>for your lobsters here</span>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              const sortedTasks = tasks.slice().sort((a, b) => {
                const idA = a.assignee?.email || a.assigneeId || '';
                const idB = b.assignee?.email || b.assigneeId || '';
                return idA.localeCompare(idB);
              });
              
              let lastAssigneeId: string | null = null;
              return sortedTasks.map(task => {
                const currentAssigneeId = task.assigneeId || 'unassigned';
                const showHeader = currentAssigneeId !== lastAssigneeId;
                lastAssigneeId = currentAssigneeId;
                
                return (
                  <div key={task.id} className="flex flex-col gap-2">
                    {showHeader && task.assignee && (
                      <div className="flex items-center gap-2 mt-2 mb-1 px-1 opacity-90">
                        <div 
                          style={task.assignee.themeColor ? { backgroundColor: task.assignee.themeColor } : undefined}
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shadow-sm overflow-hidden ${task.assignee.type === 'AI_AGENT' && !task.assignee.themeColor && !task.assignee.avatar ? 'bg-gradient-to-br from-amber-400 to-orange-500' : task.assignee.type !== 'AI_AGENT' && !task.assignee.avatar ? 'bg-gradient-to-br from-emerald-400 to-teal-500' : ''}`}
                        >
                          {task.assignee.avatar ? (
                            <AvatarImage src={task.assignee.avatar} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            (task.assignee.nickname || task.assignee.email.split('@')[0]).substring(0, 2).toUpperCase()
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                          {task.assignee.nickname || task.assignee.email.split('@')[0]}
                        </span>
                      </div>
                    )}
                    <TaskCard task={task} onClick={() => onTaskClick(task)} />
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
