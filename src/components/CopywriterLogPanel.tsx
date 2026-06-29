'use client'

import { useState, useEffect, useCallback } from 'react'
import { PenTool, RefreshCw, ChevronDown, ChevronUp, Download, Filter } from 'lucide-react'
import MessageAnnotationBar from '@/components/MessageAnnotationBar'

// ── Types ──────────────────────────────────────────────────────────────────────
interface CopywriterLogEntry {
  id: string
  brandId: string
  userId: string
  promptVersion: string | null
  systemPrompt: string
  userInput: string
  rawOutput: string
  modelId: string | null
  latencyMs: number | null
  tokenEstimate: number | null
  platform: string | null
  draftId: string | null
  createdAt: string
  rating: number | null
  adminNote: string | null
  correctedContent: string | null
  isAnnotated: boolean
  trainingTag: string | null
  brand: { name: string }
}

interface CopywriterLogPanelProps {
  brands: { id: string; name: string }[]
}

const truncate = (s: string, n = 80) => s.length > n ? s.slice(0, n) + '…' : s

const RatingBadge = ({ rating }: { rating: number | null }) => {
  if (!rating) return null
  const map = { 3: ['好', 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700'], 2: ['一般', 'bg-amber-100 dark:bg-amber-900/40 text-amber-700'], 1: ['差', 'bg-rose-100 dark:bg-rose-900/40 text-rose-700'] } as const
  const entry = map[rating as keyof typeof map]
  if (!entry) return null
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${entry[1]}`}>{entry[0]}</span>
}

const TagBadge = ({ tag }: { tag: string | null }) => {
  if (!tag) return null
  const map = {
    include:       'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    needs_rewrite: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    exclude:       'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
  } as const
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${map[tag as keyof typeof map] ?? 'bg-slate-100 text-slate-500'}`}>{tag}</span>
}

// ── Log Row ────────────────────────────────────────────────────────────────────
const LogRow = ({ log, isExpanded, onToggle }: {
  log: CopywriterLogEntry
  isExpanded: boolean
  onToggle: () => void
}) => {
  const [showPrompt, setShowPrompt] = useState(false)

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
      >
        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
          <PenTool size={14} className="text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{log.brand.name}</span>
            {log.platform && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{log.platform}</span>}
            {log.modelId && <span className="text-[10px] text-slate-400 font-mono">{log.modelId}</span>}
            <RatingBadge rating={log.rating} />
            <TagBadge tag={log.trainingTag} />
            {log.isAnnotated && <span className="text-[10px] text-indigo-500">✓ 已标注</span>}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            📝 {truncate(log.userInput)}
          </p>
        </div>
        <div className="text-right flex-shrink-0 space-y-0.5">
          <div className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
          {log.latencyMs && <div className="text-[10px] text-slate-400">{log.latencyMs}ms</div>}
        </div>
        {isExpanded ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />}
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
          {/* System Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Prompt</span>
              {log.promptVersion && <span className="text-[10px] font-mono text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">{log.promptVersion}</span>}
              <button
                onClick={() => setShowPrompt(v => !v)}
                className="text-[10px] text-slate-400 hover:text-slate-600 ml-2"
              >
                {showPrompt ? '收起' : '展开完整 prompt'}
              </button>
            </div>
            <div className={`text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg p-3 whitespace-pre-wrap ${showPrompt ? '' : 'max-h-16 overflow-hidden'}`}>
              {log.systemPrompt}
            </div>
          </div>

          {/* User Input */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">用户输入（话题/素材）</div>
            <div className="text-xs text-slate-700 dark:text-slate-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800 whitespace-pre-wrap">
              {log.userInput}
            </div>
          </div>

          {/* Model Output */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">模型输出</div>
            <div className="text-xs text-slate-700 dark:text-slate-300 bg-violet-50 dark:bg-violet-900/20 rounded-lg p-3 border border-violet-200 dark:border-violet-800 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {log.rawOutput}
            </div>
          </div>

          {/* Annotation toolbar */}
          <MessageAnnotationBar
            messageId={log.id}
            apiPath={`/api/admin/copywriter-logs/${log.id}/annotate`}
            initialRating={log.rating}
            initialTag={log.trainingTag}
            initialNote={log.adminNote}
            initialCorrected={log.correctedContent}
            isAnnotated={log.isAnnotated}
          />
        </div>
      )}
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────────
export default function CopywriterLogPanel({ brands }: CopywriterLogPanelProps) {
  const [logs,       setLogs]       = useState<CopywriterLogEntry[]>([])
  const [loading,    setLoading]    = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page,       setPage]       = useState(1)
  const [total,      setTotal]      = useState(0)
  const limit = 20

  // Filters
  const [filterBrand,     setFilterBrand]     = useState('')
  const [filterAnnotated, setFilterAnnotated] = useState('')
  const [filterTag,       setFilterTag]       = useState('')
  const [filterStart,     setFilterStart]     = useState('')
  const [filterEnd,       setFilterEnd]       = useState('')

  const fetchLogs = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterBrand)     params.set('brandId', filterBrand)
      if (filterAnnotated) params.set('isAnnotated', filterAnnotated)
      if (filterTag)       params.set('trainingTag', filterTag)
      if (filterStart)     params.set('startDate', filterStart)
      if (filterEnd)       params.set('endDate', filterEnd)
      params.set('page',  String(p))
      params.set('limit', String(limit))
      const r = await fetch(`/api/admin/copywriter-logs?${params}`)
      if (r.ok) {
        const d = await r.json()
        setLogs(d.logs || [])
        setTotal(d.total || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [filterBrand, filterAnnotated, filterTag, filterStart, filterEnd, limit])

  useEffect(() => {
    setPage(1)
    void fetchLogs(1)
  }, [filterBrand, filterAnnotated, filterTag, filterStart, filterEnd])

  const handlePageChange = (p: number) => {
    setPage(p)
    void fetchLogs(p)
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <PenTool size={15} className="text-violet-500" />
          <span className="text-sm font-black text-slate-800 dark:text-slate-100">Copywriter 文案日志</span>
          <span className="text-xs text-slate-400 ml-auto">{total} 条记录</span>
          <button
            onClick={() => void fetchLogs(page)}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="刷新"
          >
            <RefreshCw size={13} className="text-slate-400" />
          </button>
        </div>

        {/* Filter row */}
        <div className="flex gap-2 flex-wrap items-end">
          <Filter size={12} className="text-slate-400 mt-auto mb-1" />
          <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className="border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1 text-xs focus:outline-none">
            <option value="">全部品牌</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className="border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1 text-xs focus:outline-none">
            <option value="">全部标签</option>
            <option value="include">✅ include</option>
            <option value="needs_rewrite">✏️ needs_rewrite</option>
            <option value="exclude">🚫 exclude</option>
          </select>
          <select value={filterAnnotated} onChange={e => setFilterAnnotated(e.target.value)} className="border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1 text-xs focus:outline-none">
            <option value="">全部状态</option>
            <option value="true">已标注</option>
            <option value="false">未标注</option>
          </select>
          <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1 text-xs focus:outline-none" />
          <span className="text-slate-400 text-xs self-center">—</span>
          <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1 text-xs focus:outline-none" />
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-2">
        {loading && <div className="text-center py-10 text-slate-400 text-sm">加载中...</div>}
        {!loading && logs.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">暂无文案日志记录</div>
        )}
        {logs.map(log => (
          <LogRow
            key={log.id}
            log={log}
            isExpanded={expandedId === log.id}
            onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
          />
        ))}

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-center gap-2 pt-3">
            <button disabled={page === 1} onClick={() => handlePageChange(page - 1)} className="px-3 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition">上一页</button>
            <span className="text-xs text-slate-400">第 {page} 页 / 共 {Math.ceil(total / limit)} 页</span>
            <button disabled={page >= Math.ceil(total / limit)} onClick={() => handlePageChange(page + 1)} className="px-3 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition">下一页</button>
          </div>
        )}
      </div>
    </div>
  )
}
