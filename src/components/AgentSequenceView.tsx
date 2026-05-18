'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bot, Search, Trash2, Zap, Inbox } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AgentEditModal from './AgentEditModal'
import AvatarImage from './AvatarImage'
import TaskCard from './TaskCard'
import TaskModal from './TaskModal'
import { buildAgentInitPrompt } from '@/lib/agentInitPrompt'
import { COLUMNS } from './KanbanBoard'

const markdownComponents = {
  a: ({ ...props }: any) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

// ── Mini Kanban Board (brand-scoped AI activity swim-lane) ─────────────────
function BrandKanbanLane({ brandId }: { brandId: string }) {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTask, setSelectedTask] = useState<any | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks?active=true&brandId=${brandId}`)
      if (res.ok) {
        const data = await res.json()
        setTasks(Array.isArray(data) ? data : data.tasks ?? [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [brandId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const searchLower = searchQuery.toLowerCase().trim()

  const activeTasks = tasks
    .filter(t => t.status === activeTab)
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
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Tab bar — identical to KanbanBoard */}
        <div className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
            {COLUMNS.map(col => {
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
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Search — identical to KanbanBoard */}
          <div className="mb-5 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.65 16.65A7.5 7.5 0 1116.65 2a7.5 7.5 0 010 14.65z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索任务标题、描述、标签或 Agent…"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-sm font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-400 placeholder:font-normal outline-none focus:ring-2 focus:ring-emerald-400/50"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
                {searchQuery ? '没有找到匹配的任务' : `${COLUMNS.find(c => c.id === activeTab)?.title} 暂无任务`}
              </p>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="mt-3 text-xs font-bold text-emerald-600 hover:underline">
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

      {/* Task detail modal */}
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

// ── Main: AgentSequenceView ─────────────────────────────────────────────────
export default function AgentSequenceView({
  initialFilter = 'all',
  brandId,
}: {
  initialFilter?: 'all' | 'online' | 'offline'
  brandId?: string
}) {
  const [agents, setAgents] = useState<any[]>([])
  const [expandedAgentIds, setExpandedAgentIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'online' | 'offline'>(initialFilter)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [editingAgent, setEditingAgent] = useState<any | null>(null)

  const getCopyCommand = (apiKey: string | null = null) => {
    const hostFromEnv = process.env.NEXT_PUBLIC_KANBAN_HOST
    const hostFromWindow = typeof window !== 'undefined' ? window.location.origin : null
    const baseHost = hostFromEnv || hostFromWindow || 'https://amc-kanban.immedi.ai'
    return buildAgentInitPrompt({ apiKey, apiBaseUrl: `${baseHost}/api` })
  }

  useEffect(() => { setFilterTab(initialFilter) }, [initialFilter])
  useEffect(() => { fetchAgents() }, [])

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      setAgents(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAgent = async (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation()
    if (!confirm('确定要遣散这只龙虾吗？它的所有未完成工作将会停滞，且此操作不可逆。')) return
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' })
      if (res.ok) {
        setAgents(prev => prev.filter(a => a.id !== agentId))
        setExpandedAgentIds(prev => prev.filter(id => id !== agentId))
      } else {
        const data = await res.json()
        alert(data.error || '删除失败，请重试')
      }
    } catch {
      alert('删除时发生网络错误')
    }
  }

  const filteredAgents = agents.filter(agent => {
    if (filterTab === 'online' && !agent.isOnline) return false
    if (filterTab === 'offline' && agent.isOnline) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        agent.email.toLowerCase().includes(q) ||
        (agent.nickname && agent.nickname.toLowerCase().includes(q)) ||
        (agent.insights && agent.insights.toLowerCase().includes(q)) ||
        (agent.introduction && agent.introduction.toLowerCase().includes(q))
      )
    }
    return true
  })

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* ── Header bar ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-3">
          🤖 AI 序列{' '}
          <span className="text-sm font-normal text-slate-400 bg-slate-50 dark:bg-slate-950 px-3 py-1 rounded-full">
            {filteredAgents.length} Agents
          </span>
        </h2>

        <div className="flex flex-col sm:flex-row gap-4 items-center w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索邮箱、工作流或简介..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
            {(['all', 'online', 'offline'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterTab(f)}
                className={`flex-1 sm:px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filterTab === f
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {f === 'all' ? '全部' : f === 'online' ? '在线' : '离线'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Agent cards grid ─────────────────────────────────────────── */}
      <div className="mb-10">
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400">
            <Bot size={32} className="animate-pulse" />
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Bot size={48} className="mb-4 opacity-50" />
            <p>没有找到匹配的 Agent</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
            {filteredAgents.map(agent => (
              <div
                key={agent.id}
                onClick={() =>
                  setExpandedAgentIds(prev =>
                    prev.includes(agent.id)
                      ? prev.filter(id => id !== agent.id)
                      : [...prev, agent.id]
                  )
                }
                style={agent.themeColor ? { borderColor: agent.themeColor } : undefined}
                className={`group bg-white dark:bg-slate-900 border rounded-3xl p-6 cursor-pointer transition-all duration-300 relative ${
                  expandedAgentIds.includes(agent.id)
                    ? 'border-emerald-500 shadow-lg ring-4 ring-emerald-500/10'
                    : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm hover:shadow-md'
                }`}
              >
                {/* Top-right actions + online dot */}
                <div className="absolute top-6 right-6 flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-2 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingAgent(agent) }}
                      className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                      title="编辑名片"
                    >
                      <span className="text-sm">✏️</span>
                    </button>
                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                    <button
                      onClick={e => handleDeleteAgent(e, agent.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="遣散此 Agent"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <span
                    className={`w-3 h-3 rounded-full ${
                      agent.isOnline
                        ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                </div>

                {/* Avatar + name */}
                <div className="flex items-center gap-4 mb-5 pr-8">
                  <div
                    style={agent.themeColor ? { backgroundColor: `${agent.themeColor}20`, color: agent.themeColor } : undefined}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-sm font-bold overflow-hidden border border-white dark:border-slate-700 shadow-sm flex-shrink-0 ${!agent.themeColor ? 'bg-slate-200 text-slate-600' : ''}`}
                  >
                    {agent.avatar
                      ? <AvatarImage src={agent.avatar} alt="Avatar" className="w-full h-full object-cover" />
                      : (agent.nickname || agent.email.split('@')[0]).substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-slate-800 dark:text-slate-100 truncate text-lg">
                      {agent.nickname || agent.email.split('@')[0]}
                    </h3>
                    <p className="text-xs font-medium text-slate-400 truncate">{agent.email}</p>
                  </div>
                </div>

                {/* Workflow badge + insights */}
                {agent.insights && (
                  <div className="mb-2">
                    <span className="text-[10px] uppercase font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded flex w-fit mb-2">
                      Workflow
                    </span>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {agent.insights}
                    </p>
                  </div>
                )}

                {/* Expanded: credentials + intro + workflow */}
                {expandedAgentIds.includes(agent.id) && (
                  <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-5 animate-in fade-in slide-in-from-top-2">
                    {agent.apiKey && (
                      <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-3">🔑 凭证管理</span>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={agent.apiKey}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 font-mono text-xs focus:outline-none"
                            />
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                navigator.clipboard.writeText(agent.apiKey)
                                setCopiedKey(agent.id)
                                setTimeout(() => setCopiedKey(null), 2000)
                              }}
                              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex-shrink-0"
                            >
                              {copiedKey === agent.id ? '已复制 Key' : '复制 Key'}
                            </button>
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              navigator.clipboard.writeText(getCopyCommand(agent.apiKey))
                              setCopiedCommand(agent.id)
                              setTimeout(() => setCopiedCommand(null), 2000)
                            }}
                            className="w-full px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 mt-1"
                          >
                            📜 {copiedCommand === agent.id ? 'Skill 已复制' : '一键复制完整初始化 Skill'}
                          </button>
                        </div>
                      </div>
                    )}
                    {agent.introduction && (
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2 flex items-center gap-2">
                          <Bot size={14} /> 个人简介
                        </span>
                        <div className="text-sm text-slate-600 dark:text-slate-400 prose prose-sm dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {agent.introduction}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                    {agent.workflow && (
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">执行流</span>
                        <div className="text-sm text-slate-600 dark:text-slate-400 prose prose-sm dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {agent.workflow}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── AI 活动战报 — brand-scoped Kanban swim-lane ──────────────── */}
      <section className="pb-10">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            AI 活动战报
          </h3>
          {brandId && (
            <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-full ml-1">
              仅显示本品牌 AI 员工的工作
            </span>
          )}
        </div>

        {brandId ? (
          <BrandKanbanLane brandId={brandId} />
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2.5 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
            <Zap className="w-8 h-8 text-slate-200 dark:text-slate-700" />
            <p className="text-sm font-bold text-slate-400">请先选择品牌</p>
            <p className="text-[11px] text-slate-300 dark:text-slate-600">
              在顶部切换品牌后，对应品牌的 AI 员工活动泳道将显示在此
            </p>
          </div>
        )}
      </section>

      {/* Agent edit modal */}
      {editingAgent && (
        <AgentEditModal
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          onUpdate={() => { setEditingAgent(null); fetchAgents() }}
        />
      )}
    </div>
  )
}
