'use client'

import { useEffect, useState } from 'react'
import {
  Bot,
  Calendar,
  Search,
  RefreshCw,
  Clock,
  User,
  ArrowRight,
  Filter,
  FileText,
  Activity,
  PlusCircle,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

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
      if (brandId) params.set('brandId', brandId) // included in API context bounds implicitly but safe to pass

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
      {/* 1. Header with stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Bot className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            AI 员工工作日志
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            监控所有 AI 虚拟员工日常操作日志，已过滤内部模型检索与思考路径，只展示发生的动作。
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
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">
          <Filter className="w-3.5 h-3.5" />
          <span>日志筛选：</span>
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
              <option value="all">全部机器人</option>
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

        {(selectedAgentId !== 'all' || startDate || endDate) && (
          <button
            onClick={() => {
              setSelectedAgentId('all')
              setStartDate('')
              setEndDate('')
            }}
            className="md:mt-5 text-[11px] text-slate-400 dark:text-slate-500 hover:text-red-500 hover:underline font-extrabold"
          >
            重置筛选
          </button>
        )}
      </div>

      {/* 3. Timeline Log List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto mb-4" />
            <p className="text-xs text-slate-400">正在检索 AI 操作日志...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <Activity className="w-12 h-12 text-slate-350 dark:text-slate-700 mx-auto opacity-40 animate-pulse" />
            <div>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200">暂无日志记录</p>
              <p className="text-xs text-slate-400 mt-1">没有符合当前筛选条件的 AI 员工操作动作。</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map(log => {
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
