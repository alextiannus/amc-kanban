import { useState, useMemo } from 'react'
import { X, AlertCircle, Check, Copy, ChevronLeft, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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

function extractWorkLinks(materials: string | null) {
  if (!materials) return { draftUrl: null as string | null, postUrl: null as string | null }

  const lines = materials.split('\n').map((line) => line.trim()).filter(Boolean)
  const draftLine = lines.find((line) => line.startsWith('草稿链接:'))
  const postLine = lines.find((line) => line.startsWith('发布链接:'))

  const draftUrl = draftLine
    ? draftLine.replace(/^草稿链接:\s*/, '')
    : (lines.find((line) => /^https?:\/\//i.test(line)) ?? null)
  const postUrl = postLine ? postLine.replace(/^发布链接:\s*/, '') : null

  return { draftUrl, postUrl }
}

export default function TaskModal({ task, onClose, onUpdate, allTasks, onTagFilter }: {
  task: any,
  onClose: () => void,
  onUpdate: () => void,
  allTasks?: any[],
  onTagFilter?: (tag: string) => void,
}) {
  const [currentTask, setCurrentTask] = useState(task)
  const [updating, setUpdating] = useState(false)
  const [idCopied, setIdCopied] = useState(false)

  // sorted non-void tasks for prev/next navigation
  const sortedTasks = useMemo(() => {
    if (!allTasks) return []
    return [...allTasks]
      .filter(t => t.status !== 'void')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [allTasks])

  const currentIndex = sortedTasks.findIndex(t => t.id === currentTask.id)
  const prevTask = currentIndex > 0 ? sortedTasks[currentIndex - 1] : null
  const nextTask = currentIndex < sortedTasks.length - 1 ? sortedTasks[currentIndex + 1] : null

  const handleProvideInput = async () => {
    setUpdating(true)
    try {
      await fetch(`/api/tasks/${currentTask.id}/status`, {
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
      await fetch(`/api/tasks/${currentTask.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, requiredInput: newStatus !== 'pending' ? null : currentTask.requiredInput })
      })
      onUpdate()
    } catch (e) {
      console.error(e)
    } finally {
      setUpdating(false)
    }
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(currentTask.id)
    setIdCopied(true)
    setTimeout(() => setIdCopied(false), 2000)
  }

  const taskTags: string[] = currentTask.tags || []
  const { draftUrl, postUrl } = extractWorkLinks(currentTask.materials)
  const relatedTasks = allTasks
    ? allTasks
        .filter(t => t.id !== currentTask.id && t.status !== 'void')
        .map(t => {
          const sharedTags = (t.tags || []).filter((tag: string) => taskTags.includes(tag))
          const sameAssignee = t.assigneeId && currentTask.assigneeId && t.assigneeId === currentTask.assigneeId
          const score = sharedTags.length * 2 + (sameAssignee ? 1 : 0)
          return { task: t, score, sharedTags }
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
    : []

  return (
    <div
      className="fixed inset-0 bg-slate-900/20 dark:bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 transition-all duration-300"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start bg-white dark:bg-slate-900">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <select
                disabled={updating}
                value={currentTask.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest outline-none cursor-pointer border-none appearance-none transition-all
                ${currentTask.status === 'todo' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200' :
                  currentTask.status === 'in_progress' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100' :
                  currentTask.status === 'pending' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100' :
                  currentTask.status === 'done' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-100' :
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
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2">{currentTask.title}</h2>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">#{currentTask.id.substring(0, 8)}</span>
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
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize">{currentTask.priority || 'medium'}</p>
              </div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Deadline
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{currentTask.deadline ? new Date(currentTask.deadline).toLocaleDateString() : 'Not set'}</p>
              </div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Estimate (h)
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{currentTask.estimatedHours ?? 'Not set'}</p>
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

          {currentTask.status === 'pending' && currentTask.requiredInput && (
            <div className="bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-bold tracking-tight text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
                <AlertCircle size={18} /> Agent Needs Input
              </h3>
              <p className="text-amber-700 dark:text-amber-400 text-sm whitespace-pre-wrap leading-relaxed mb-5">{renderTextWithLinks(currentTask.requiredInput)}</p>
              
              <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-amber-200/50 dark:border-amber-800/50">
                {/* Retry publish button — shown when requiredInput indicates a publish failure */}
                {currentTask.requiredInput.includes('自动发布失败') || currentTask.requiredInput.includes('重试发布失败') ? (
                  <button
                    onClick={async () => {
                      setUpdating(true)
                      try {
                        const res = await fetch(`/api/tasks/${currentTask.id}/retry-publish`, { method: 'POST' })
                        const data = await res.json()
                        if (data.success) {
                          onUpdate()
                        } else {
                          setCurrentTask((prev: any) => ({ ...prev, requiredInput: data.error ?? '重试失败，请稍后再试' }))
                        }
                      } catch (e) {
                        console.error(e)
                      } finally {
                        setUpdating(false)
                      }
                    }}
                    disabled={updating}
                    className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 shadow-sm hover:shadow hover:-translate-y-0.5 transition-all duration-300"
                  >
                    {updating ? (
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    )}
                    重新尝试发布
                  </button>
                ) : null}
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


          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Description / Logs</h3>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words prose prose-sm dark:prose-invert max-w-none prose-a:text-blue-500 prose-headings:font-bold">
              {currentTask.description ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {currentTask.description}
                </ReactMarkdown>
              ) : (
                'No description provided.'
              )}
            </div>
          </div>

          {currentTask.materials && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Research Materials</h3>
              {(draftUrl || postUrl) && (
                <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {draftUrl && (
                    <a
                      href={draftUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <p className="font-bold mb-0.5">草稿链接</p>
                      <p className="truncate">{draftUrl}</p>
                    </a>
                  )}
                  {postUrl && (
                    <a
                      href={postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                    >
                      <p className="font-bold mb-0.5">发布链接</p>
                      <p className="truncate">{postUrl}</p>
                    </a>
                  )}
                </div>
              )}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words prose prose-sm dark:prose-invert max-w-none prose-a:text-blue-500 prose-headings:font-bold">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {currentTask.materials}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {(prevTask || nextTask) && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Workflow Steps</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => prevTask && setCurrentTask(prevTask)}
                  disabled={!prevTask}
                  className="flex items-start gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-left disabled:opacity-30 hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
                >
                  <ChevronLeft size={16} className="mt-0.5 text-slate-400 shrink-0 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Previous</p>
                    {prevTask && <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">{prevTask.title}</p>}
                  </div>
                </button>
                <button
                  onClick={() => nextTask && setCurrentTask(nextTask)}
                  disabled={!nextTask}
                  className="flex items-start gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-left disabled:opacity-30 hover:border-slate-300 dark:hover:border-slate-600 transition-colors group justify-end"
                >
                  <div className="min-w-0 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Next</p>
                    {nextTask && <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">{nextTask.title}</p>}
                  </div>
                  <ChevronRight size={16} className="mt-0.5 text-slate-400 shrink-0 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
                </button>
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
