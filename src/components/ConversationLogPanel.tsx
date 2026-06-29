'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, ChevronDown, ChevronUp, Clock, Mic, Keyboard, Zap, Bot, RefreshCw, BarChart2 } from 'lucide-react'
import MessageAnnotationBar from '@/components/MessageAnnotationBar'

// ── Types ──────────────────────────────────────────────────────────────────────
interface ConversationSession {
  id: string
  userId: string
  startedAt: string
  lastActiveAt: string
  messageCount: number
  lastMessage: { role: string; content: string; inputType?: string } | null
}

interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sessionId?: string
  inputType?: string
  modelId?: string
  latencyMs?: number
  tokenEstimate?: number
  intentDetected?: string
  action?: string
  createdAt: string
  userId: string
  // Annotation fields
  rating?:           number | null
  adminNote?:        string | null
  correctedContent?: string | null
  isAnnotated?:      boolean
  trainingTag?:      string | null
}

interface ConversationStats {
  totalSessions: number
  totalMessages: number
  voiceInputPct: number
  avgLatencyMs: number
  topBrands: { brandId: string; brandName: string; sessionCount: number }[]
  intentDistribution: { intent: string; count: number }[]
  modelDistribution: { model: string; count: number }[]
}

interface ConversationLogPanelProps {
  brands: { id: string; name: string }[]
}

// ── Helper formatters ──────────────────────────────────────────────────────────
const formatRelativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (days  > 0) return `${days}天前`
  if (hours > 0) return `${hours}小时前`
  if (mins  > 0) return `${mins}分钟前`
  return '刚刚'
}

const truncate = (s: string, n = 60) => s.length > n ? s.slice(0, n) + '…' : s

const InputTypeBadge = ({ inputType }: { inputType?: string }) => {
  if (inputType === 'voice') return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
      <Mic size={9} /> 语音
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
      <Keyboard size={9} /> 文字
    </span>
  )
}

// ── Session Row ────────────────────────────────────────────────────────────────
const SessionRow = ({
  session,
  brandId,
  isExpanded,
  onToggle,
}: {
  session: ConversationSession
  brandId: string
  isExpanded: boolean
  onToggle: () => void
}) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isExpanded || messages.length > 0) return
    setLoading(true)
    fetch(`/api/brands/${brandId}/companion/history?sessionId=${session.id}&limit=50`)
      .then(r => r.json())
      .then(d => setMessages(d.messages || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isExpanded, brandId, session.id, messages.length])

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Session header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
          <MessageSquare size={14} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-slate-400">{session.id.slice(0, 16)}…</span>
            <InputTypeBadge inputType={session.lastMessage?.inputType} />
          </div>
          {session.lastMessage && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {session.lastMessage.role === 'user' ? '👤 ' : '🤖 '}
              {truncate(session.lastMessage.content)}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0 space-y-0.5">
          <div className="text-xs text-slate-400">{formatRelativeTime(session.lastActiveAt)}</div>
          <div className="text-[10px] text-slate-400">{session.messageCount} 条消息</div>
        </div>
        {isExpanded ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />}
      </button>

      {/* Expanded messages */}
      {isExpanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 space-y-2 max-h-96 overflow-y-auto">
          {loading && <div className="text-xs text-slate-400 text-center py-4">加载中...</div>}
          {!loading && messages.length === 0 && <div className="text-xs text-slate-400 text-center py-4">暂无消息记录</div>}
          {messages.map(msg => (
            <div key={msg.id} className="space-y-1">
              <div
                className={`flex gap-2 ${msg.role === 'assistant' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600'
                    : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600'
                }`}>
                  {msg.role === 'user' ? '👤' : <Bot size={12} />}
                </div>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${
                  msg.role === 'user'
                    ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {msg.role === 'user' && <InputTypeBadge inputType={msg.inputType} />}
                    {msg.role === 'assistant' && msg.modelId && (
                      <span className="text-[10px] text-slate-400">{msg.modelId}</span>
                    )}
                    {msg.role === 'assistant' && msg.latencyMs && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                        <Clock size={8} /> {msg.latencyMs}ms
                      </span>
                    )}
                    {msg.role === 'assistant' && msg.intentDetected && msg.intentDetected !== 'NONE' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                        <Zap size={8} /> {msg.intentDetected}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-300 dark:text-slate-600 ml-auto">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
              {/* Annotation toolbar — only for assistant messages */}
              {msg.role === 'assistant' && (
                <div className="ml-8">
                  <MessageAnnotationBar
                    messageId={msg.id}
                    apiPath={`/api/admin/companion-messages/${msg.id}/annotate`}
                    initialRating={msg.rating}
                    initialTag={msg.trainingTag}
                    initialNote={msg.adminNote}
                    initialCorrected={msg.correctedContent}
                    isAnnotated={msg.isAnnotated}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Global Stats Panel ─────────────────────────────────────────────────────────
const GlobalStats = () => {
  const [stats, setStats]     = useState<ConversationStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod]   = useState<'7d' | '30d' | 'all'>('30d')

  const fetchStats = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (period === '7d')  { params.set('startDate', new Date(Date.now() - 7  * 86400000).toISOString().slice(0, 10)) }
      if (period === '30d') { params.set('startDate', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)) }
      const r = await fetch(`/api/admin/conversation-stats?${params}`)
      if (r.ok) setStats(await r.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchStats() }, [period])

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-indigo-500" />
          <span className="text-sm font-black text-slate-800 dark:text-slate-100">全局统计</span>
        </div>
        <div className="flex gap-1">
          {(['7d', '30d', 'all'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                period === p ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {p === '7d' ? '7天' : p === '30d' ? '30天' : '全部'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-xs text-center text-slate-400 py-4">加载中...</div>}
      {!loading && stats && (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '对话会话', value: stats.totalSessions.toLocaleString() },
              { label: '用户消息', value: stats.totalMessages.toLocaleString() },
              { label: '语音占比', value: `${stats.voiceInputPct}%` },
              { label: '平均响应', value: `${stats.avgLatencyMs}ms` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                <div className="text-lg font-black text-slate-800 dark:text-white">{value}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Top brands */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">最活跃品牌</div>
              <div className="space-y-1.5">
                {stats.topBrands.map(b => (
                  <div key={b.brandId} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{b.brandName}</span>
                    <span className="text-xs font-mono text-slate-400">{b.sessionCount} 次</span>
                  </div>
                ))}
                {stats.topBrands.length === 0 && <div className="text-xs text-slate-400">暂无数据</div>}
              </div>
            </div>

            {/* Intent distribution */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">意图分布</div>
              <div className="space-y-1.5">
                {stats.intentDistribution.map(item => (
                  <div key={item.intent} className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-500 truncate">{item.intent ?? '—'}</span>
                    <span className="text-xs font-mono text-slate-400">{item.count}</span>
                  </div>
                ))}
                {stats.intentDistribution.length === 0 && <div className="text-xs text-slate-400">暂无数据</div>}
              </div>
            </div>

            {/* Model distribution */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">模型使用</div>
              <div className="space-y-1.5">
                {stats.modelDistribution.map(item => (
                  <div key={item.model} className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-500 truncate">{item.model ?? '—'}</span>
                    <span className="text-xs font-mono text-slate-400">{item.count}</span>
                  </div>
                ))}
                {stats.modelDistribution.length === 0 && <div className="text-xs text-slate-400">暂无数据</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────────
export default function ConversationLogPanel({ brands }: ConversationLogPanelProps) {
  const [selectedBrandId, setSelectedBrandId] = useState<string>('')
  const [sessions,   setSessions]   = useState<ConversationSession[]>([])
  const [loading,    setLoading]    = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page,       setPage]       = useState(1)
  const [total,      setTotal]      = useState(0)
  const limit = 20

  const fetchSessions = async (brandId: string, p: number) => {
    if (!brandId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/brands/${brandId}/companion/sessions?page=${p}&limit=${limit}`)
      if (r.ok) {
        const d = await r.json()
        setSessions(d.sessions || [])
        setTotal(d.total || 0)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedBrandId) {
      setPage(1)
      setSessions([])
      setExpandedId(null)
      void fetchSessions(selectedBrandId, 1)
    }
  }, [selectedBrandId])

  const handlePageChange = (p: number) => {
    setPage(p)
    void fetchSessions(selectedBrandId, p)
  }

  return (
    <div className="space-y-5">
      {/* Global stats at top */}
      <GlobalStats />

      {/* Per-brand session list */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Header with brand selector */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 flex-wrap">
          <MessageSquare size={15} className="text-slate-500" />
          <span className="text-sm font-black text-slate-800 dark:text-slate-100">品牌对话记录</span>
          <select
            value={selectedBrandId}
            onChange={e => setSelectedBrandId(e.target.value)}
            className="ml-auto border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="">— 选择品牌 —</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {selectedBrandId && (
            <button
              onClick={() => void fetchSessions(selectedBrandId, page)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="刷新"
            >
              <RefreshCw size={13} className="text-slate-400" />
            </button>
          )}
        </div>

        <div className="p-4 space-y-2">
          {!selectedBrandId && (
            <div className="text-center py-10 text-slate-400 text-sm">请选择品牌查看对话日志</div>
          )}
          {selectedBrandId && loading && (
            <div className="text-center py-10 text-slate-400 text-sm">加载中...</div>
          )}
          {selectedBrandId && !loading && sessions.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">该品牌暂无对话记录</div>
          )}
          {sessions.map(session => (
            <SessionRow
              key={session.id}
              session={session}
              brandId={selectedBrandId}
              isExpanded={expandedId === session.id}
              onToggle={() => setExpandedId(expandedId === session.id ? null : session.id)}
            />
          ))}

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-center gap-2 pt-3">
              <button
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
                className="px-3 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 transition"
              >
                上一页
              </button>
              <span className="text-xs text-slate-400">第 {page} 页 / 共 {Math.ceil(total / limit)} 页 ({total} 条)</span>
              <button
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => handlePageChange(page + 1)}
                className="px-3 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 transition"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
