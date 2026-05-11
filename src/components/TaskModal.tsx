import { useState } from 'react'
import { X, AlertCircle, Check, Copy } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AvatarImage from './AvatarImage'

const markdownComponents = {
  a: ({ ...props }: any) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

function renderTextWithLinks(text: string | null) {
  if (!text) return 'No description provided.';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:underline">
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function TaskModal({ task, onClose, onUpdate, allTasks, onTagFilter }: {
  task: any,
  onClose: () => void,
  onUpdate: () => void,
  allTasks?: any[],
  onTagFilter?: (tag: string) => void,
}) {
  const [updating, setUpdating] = useState(false)
  const [idCopied, setIdCopied] = useState(false)

  const handleProvideInput = async () => {
    setUpdating(true)
    try {
      await fetch(`/api/tasks/${task.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress', requiredInput: null })
      })
      onUpdate()
    } catch (e) {
      console.error(e)
    } finally {
      setUpdating(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true)
    try {
      await fetch(`/api/tasks/${task.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, requiredInput: newStatus !== 'pending' ? null : task.requiredInput })
      })
      onUpdate()
    } catch (e) {
      console.error(e)
    } finally {
      setUpdating(false)
    }
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(task.id)
    setIdCopied(true)
    setTimeout(() => setIdCopied(false), 2000)
  }

  const taskTags: string[] = task.tags || []
  const relatedTasks = allTasks
    ? allTasks
        .filter(t => t.id !== task.id && t.status !== 'void')
        .map(t => {
          const sharedTags = (t.tags || []).filter((tag: string) => taskTags.includes(tag))
          const sameAssignee = t.assigneeId && task.assigneeId && t.assigneeId === task.assigneeId
          const score = sharedTags.length * 2 + (sameAssignee ? 1 : 0)
          return { task: t, score, sharedTags }
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
    : []

  return (
    <div className="fixed inset-0 bg-slate-900/20 dark:bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 transition-all duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden transform transition-all">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start bg-white dark:bg-slate-900">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <select
                disabled={updating}
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest outline-none cursor-pointer border-none appearance-none transition-all
                ${task.status === 'todo' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200' :
                  task.status === 'in_progress' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100' :
                  task.status === 'pending' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100' :
                  task.status === 'done' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-100' :
                  'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100'
                }`}
              >
                <option value="todo">TO DO</option>
                <option value="in_progress">IN PROGRESS</option>
                <option value="pending">REQUIRE INPUT</option>
                <option value="done">DONE</option>
                <option value="void">VOID</option>
              </select>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2">{task.title}</h2>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">#{task.id.substring(0, 8)}</span>
              <button onClick={handleCopyId} title="Copy full task ID" className="text-slate-300 hover:text-emerald-500 dark:text-slate-600 dark:hover:text-emerald-400 transition-colors">
                {idCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-8">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Planning Metadata</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Priority
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize">{task.priority || 'medium'}</p>
              </div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Deadline
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{task.deadline ? new Date(task.deadline).toLocaleDateString() : 'Not set'}</p>
              </div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Estimate (h)
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{task.estimatedHours ?? 'Not set'}</p>
              </div>
              <div className="md:col-span-3">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Tags</p>
                {taskTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {taskTags.map((tag: string) => (
                      <button
                        key={tag}
                        onClick={() => { if (onTagFilter) { onTagFilter(tag) } }}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400 transition-colors"
                        title={onTagFilter ? `Filter board by #${tag}` : undefined}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No tags</p>
                )}
              </div>
            </div>
          </div>

          {task.status === 'pending' && task.requiredInput && (
            <div className="bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-bold tracking-tight text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
                <AlertCircle size={18} /> Agent Needs Input
              </h3>
              <p className="text-amber-700 dark:text-amber-400 text-sm whitespace-pre-wrap leading-relaxed mb-5">{renderTextWithLinks(task.requiredInput)}</p>
              
              <div className="flex justify-end pt-3 border-t border-amber-200/50 dark:border-amber-800/50">
                <button
                  onClick={handleProvideInput}
                  disabled={updating}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 shadow-sm hover:shadow hover:-translate-y-0.5 transition-all duration-300"
                >
                  <Check size={18} /> Input Provided externally, Resume AI
                </button>
              </div>
            </div>
          )}

          {task.assignee && task.assignee.type === 'AI_AGENT' && (task.assignee.introduction || task.assignee.workflow) && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Agent Profile</h3>
              <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <div className="flex items-center gap-3 mb-3">
                  <div 
                    style={task.assignee.themeColor ? { backgroundColor: task.assignee.themeColor } : undefined}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm overflow-hidden ${task.assignee.type === 'AI_AGENT' && !task.assignee.themeColor && !task.assignee.avatar ? 'bg-gradient-to-br from-amber-400 to-orange-500' : ''}`}
                  >
                    {task.assignee.avatar ? (
                      <AvatarImage src={task.assignee.avatar} alt="Agent Avatar" className="w-full h-full object-cover" />
                    ) : (
                      task.assignee.email.substring(0, 2).toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                      {task.assignee.email} 
                      {task.assignee.themeColor && <span className="w-2 h-2 rounded-full inline-block shadow-sm" style={{ backgroundColor: task.assignee.themeColor }}></span>}
                    </div>
                    <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-0.5">AMC Lobster Agent</div>
                  </div>
                </div>
                {task.assignee.insights && (
                  <div className="mb-4 bg-white/60 dark:bg-slate-800/50 p-3 rounded-xl border border-blue-100/50 dark:border-slate-700">
                    <span className="font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] uppercase tracking-widest bg-indigo-100 dark:bg-indigo-900/50 px-2 py-0.5 rounded-full">Workflow & Insights</span>
                    </span> 
                    <p className="text-sm">{renderTextWithLinks(task.assignee.insights)}</p>
                  </div>
                )}
                {task.assignee.introduction && (
                  <div className="mb-3">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Introduction:</span> {renderTextWithLinks(task.assignee.introduction)}
                  </div>
                )}
                {task.assignee.workflow && (
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Standard Workflow:</span>
                    <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-400">{renderTextWithLinks(task.assignee.workflow)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Description / Logs</h3>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words prose prose-sm dark:prose-invert max-w-none prose-a:text-blue-500 prose-headings:font-bold">
              {task.description ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {task.description}
                </ReactMarkdown>
              ) : (
                'No description provided.'
              )}
            </div>
          </div>

          {task.materials && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Research Materials</h3>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words prose prose-sm dark:prose-invert max-w-none prose-a:text-blue-500 prose-headings:font-bold">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {task.materials}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {relatedTasks.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Related Tasks</h3>
              <div className="flex flex-col gap-2">
                {relatedTasks.map(({ task: related, sharedTags }) => (
                  <div key={related.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{related.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-slate-400">#{related.id.substring(0, 8)}</span>
                        {sharedTags.map((tag: string) => (
                          <span key={tag} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">#{tag}</span>
                        ))}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${related.status === 'done' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : related.status === 'in_progress' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : related.status === 'pending' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {related.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
