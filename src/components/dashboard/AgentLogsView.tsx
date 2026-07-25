'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Bot,
  RefreshCw,
  Clock,
  Filter,
  FileText,
  Activity,
  PlusCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react'

// ── Work status definitions used by the log filter ──
const LANE_STATUSES = [
  { id: 'todo',        label: '待办',   color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700', activeColor: 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-700 dark:border-slate-200' },
  { id: 'in_progress', label: '执行中', color: 'bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-900/40', activeColor: 'bg-sky-500 text-white border-sky-500' },
  { id: 'pending',     label: '待审核', color: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/40', activeColor: 'bg-amber-500 text-white border-amber-500' },
  { id: 'done',        label: '已完成', color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40', activeColor: 'bg-emerald-500 text-white border-emerald-500' },
  { id: 'void',        label: '已作废', color: 'bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 border-red-100 dark:border-red-900/40', activeColor: 'bg-red-500 text-white border-red-500' },
]

type LogEntry = {
  id: string
  timestamp: string
  actorId: string
  actorName: string
  action: string
  resourceType: string
  resourceId: string
  description: string
  detail?: string
}

type AgentOption = {
  id: string
  email: string
  nickname: string | null
}

interface AgentLogsViewProps {
  brandId?: string
}

export default function AgentLogsView({ brandId }: AgentLogsViewProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [selectedAgentId, setSelectedAgentId] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Status multi-select filter
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set())

  // Expansion of log details
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set())

  const fetchLogs = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const params = new URLSearchParams()
      if (selectedAgentId !== 'all') params.set('agentId', selectedAgentId)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (brandId) params.set('brandId', brandId)

      const res = await fetch(`/api/logs/agent?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setAgents(data.agents || [])
      }
    } catch (e) {
      console.error('[AgentLogsView] Failed to fetch logs:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [selectedAgentId, startDate, endDate, brandId])

  // ── Client-side status filter ──────────────────────────────────────
  // Logic: STATUS_CHANGED logs are filtered by the newValue.status field.
  //        Other log types (TASK_CREATED, DRAFT_CREATED, etc.) are always shown
  //        regardless of which statuses are selected.
  const filteredLogs = useMemo(() => {
    if (selectedStatuses.size === 0) return logs
    return logs.filter(log => {
      if (log.action !== 'STATUS_CHANGED') return true
      // Extract the target status from the description — the API formats it as
      // "将任务「xxx」的状态从「yyy」更新为「zzz」", so we check the raw action context.
      // We'll match on a simple approach: the description contains the target status label.
      const statusLabel = LANE_STATUSES.find(s => selectedStatuses.has(s.id))
      // More robust: check against all selected statuses' labels
      return LANE_STATUSES
        .filter(s => selectedStatuses.has(s.id))
        .some(s => log.description.includes(`更新为「${s.label}」`))
    })
  }, [logs, selectedStatuses])

  const toggleStatus = (statusId: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev)
      if (next.has(statusId)) {
        next.delete(statusId)
      } else {
        next.add(statusId)
      }
      return next
    })
  }

  const clearAllFilters = () => {
    setSelectedAgentId('all')
    setStartDate('')
    setEndDate('')
    setSelectedStatuses(new Set())
  }

  const hasActiveFilters = selectedAgentId !== 'all' || startDate || endDate || selectedStatuses.size > 0

  const toggleExpandLog = (id: string) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'TASK_CREATED':
        return <PlusCircle className="w-4 h-4 text-sky-500" />
      case 'STATUS_CHANGED':
        return <Activity className="w-4 h-4 text-violet-500" />
      case 'TASK_COMMENT_ADDED':
        return <Clock className="w-4 h-4 text-amber-500" />
      case 'DRAFT_CREATED':
        return <FileText className="w-4 h-4 text-indigo-500" />
      case 'DRAFT_PUBLISHED':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />
      default:
        return <Bot className="w-4 h-4 text-slate-500" />
    }
  }

  const formatTimestamp = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Bot className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            工作日志
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            记录所有操作日志（人工 + AI），已过滤内部模型检索与思考路径，只展示实际发生的动作。
          </p>
        </div>

        <button
          onClick={() => fetchLogs(true)}
          disabled={loading || refreshing}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          刷新日志
        </button>
      </div>

      {/* 2. Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">

        {/* 2a. Status multi-select pills */}
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
            <Filter className="w-3.5 h-3.5" />
            <span>按任务状态筛选：</span>
            {selectedStatuses.size > 0 && (
              <span className="text-indigo-500 font-black">已选 {selectedStatuses.size} 个</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {LANE_STATUSES.map(status => {
              const isActive = selectedStatuses.has(status.id)
              return (
                <button
                  key={status.id}
                  onClick={() => toggleStatus(status.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all duration-200 ${
                    isActive ? status.activeColor : status.color
                  }`}
                >
                  {isActive && <X className="w-3 h-3" />}
                  {status.label}
                </button>
              )
            })}
            {selectedStatuses.size > 0 && (
              <button
                onClick={() => setSelectedStatuses(new Set())}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-red-400 hover:text-red-500 transition-all duration-200"
              >
                <X className="w-3 h-3" />
                清除状态
              </button>
            )}
          </div>
          {selectedStatuses.size > 0 && (
            <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
              * 状态筛选仅对「状态变更」类型的日志生效；创建、发布等其他类型日志始终显示。
            </p>
          )}
        </div>

        <div className="h-px bg-slate-100 dark:bg-slate-800" />

        {/* 2b. Agent + Date filters */}
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>更多筛选：</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            {/* Agent Filter */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">AI 虚拟员工</label>
              <select
                value={selectedAgentId}
                onChange={e => setSelectedAgentId(e.target.value)}
                className="px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
              >
                <option value="all">全部操作者</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    🤖 {a.nickname || a.email.split('@')[0]}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl outline-none"
              />
            </div>

            {/* End Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">结束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl outline-none"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-red-500 hover:underline font-extrabold whitespace-nowrap"
            >
              重置全部
            </button>
          )}
        </div>
      </div>

      {/* 3. Timeline Log List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Summary bar */}
        {!loading && (
          <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-bold">
              共 {filteredLogs.length} 条日志
              {selectedStatuses.size > 0 && logs.length !== filteredLogs.length && (
                <span className="ml-1 text-indigo-500">（全部 {logs.length} 条中过滤）</span>
              )}
            </span>
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto mb-4" />
            <p className="text-xs text-slate-400">正在检索操作日志...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <Activity className="w-12 h-12 text-slate-350 dark:text-slate-700 mx-auto opacity-40 animate-pulse" />
            <div>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200">暂无日志记录</p>
              <p className="text-xs text-slate-400 mt-1">没有符合当前筛选条件的操作记录。</p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs font-bold text-indigo-500 hover:underline"
              >
                重置所有筛选条件
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredLogs.map(log => {
              const isExpanded = expandedLogIds.has(log.id)
              return (
                <div key={log.id} className="p-5 hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors flex gap-4 items-start">
                  {/* Icon indicator */}
                  <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-750 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    {getActionIcon(log.action)}
                  </div>

                  {/* Log details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/30">
                          {log.actorName.split('@')[0]}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md self-start sm:self-auto">
                        {log.resourceType}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-2 leading-relaxed">
                      {log.description}
                    </p>

                    {log.detail && (
                      <div className="mt-2.5">
                        {isExpanded ? (
                          <div className="space-y-2">
                            <pre className="text-[11px] text-slate-650 dark:text-slate-350 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-850 whitespace-pre-wrap font-sans leading-relaxed">
                              {log.detail}
                            </pre>
                            <button
                              onClick={() => toggleExpandLog(log.id)}
                              className="text-[9px] font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1.5"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                              收起备注
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[400px]">
                              {log.detail}
                            </span>
                            <button
                              onClick={() => toggleExpandLog(log.id)}
                              className="text-[9px] font-black text-indigo-500 hover:underline flex items-center gap-1 shrink-0"
                            >
                              展开详情
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
