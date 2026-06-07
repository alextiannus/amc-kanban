'use client'

import { useState, useEffect } from 'react'

interface SystemLogModalProps {
  onClose: () => void
}

type SystemLogMetadata = {
  source?: string
  success?: boolean
  postCount?: number
  reviewCount?: number
  rating?: number | null
  accounts?: number
  conversions?: number
  durationMs?: number
  error?: string
  dateRange?: string
}

type SystemLogEntry = {
  id: string
  timestamp: string
  action?: string
  resourceType?: string
  resourceId?: string
  actorName?: string | null
  actorType?: string | null
  reason?: string | null
  metadata?: SystemLogMetadata | null
}

export default function SystemLogModal({ onClose }: SystemLogModalProps) {
  const [logs, setLogs] = useState<SystemLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '200' })
        if (filter !== 'all') params.set('resourceType', filter)
        const res = await fetch(`/api/admin/logs?${params}`)
        if (res.ok) {
          const data = await res.json()
          setLogs(data.logs || [])
        }
      } catch (e) {
        console.error('[SystemLogModal] load logs error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filter])

  const ACTION_COLORS: Record<string, string> = {
    PUBLISH_SUCCESS:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    PUBLISH_FAILED:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    RETRY_PUBLISH:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    STATUS_CHANGE:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    EXTENSION_CMD_SEND: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    EXTENSION_CMD_RECV: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    EXTENSION_CMD_ERR:  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    DATA_FETCH:         'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  }

  const SOURCE_ICONS: Record<string, string> = {
    postfast:      '📡',
    google_places: '🗺️',
    database:      '🗄️',
  }

  const SOURCE_LABELS: Record<string, string> = {
    postfast:      'PostFast',
    google_places: 'Google Places',
    database:      '数据库',
  }

  const isDataFetch = (log: SystemLogEntry) => log.resourceType === 'SocialDataFetch'

  return (
    <div className="fixed inset-0 bg-slate-900/30 dark:bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">系统日志</h2>
              <p className="text-xs text-slate-400">{logs.length} 条记录</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-none outline-none"
            >
              <option value="all">全部类型</option>
              <option value="SocialDataFetch">📡 社媒数据提取</option>
              <option value="WorkUnit">任务</option>
              <option value="Brand">品牌</option>
              <option value="ContentDraft">草稿</option>
              <option value="ExtensionBridge">浏览器插件桥</option>
            </select>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded-full transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Log List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <svg className="w-10 h-10 mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" /></svg>
              <p className="text-sm">暂无日志记录</p>
            </div>
          ) : (
            logs.map(log => (
              isDataFetch(log) ? (
                /* ── Special rendering for SocialDataFetch logs ── */
                <div key={log.id} className="p-3.5 rounded-xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${ACTION_COLORS['DATA_FETCH']}`}>
                        DATA_FETCH
                      </span>
                      {log.metadata?.source && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300">
                          {SOURCE_ICONS[log.metadata.source] ?? '📦'} {SOURCE_LABELS[log.metadata.source] ?? log.metadata.source}
                        </span>
                      )}
                      {log.metadata?.success === false && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                          ❌ 失败
                        </span>
                      )}
                      {log.metadata?.success === true && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                          ✓ 成功
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                      {new Date(log.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  {log.reason && (
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mb-2">{log.reason}</p>
                  )}

                  {/* Metadata grid for data fetch entries */}
                  {log.metadata && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1">
                      {log.metadata.postCount !== undefined && (
                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-lg px-2 py-1 text-center">
                          <p className="text-[9px] text-slate-400 uppercase tracking-wider">帖子数</p>
                          <p className="text-sm font-black text-slate-800 dark:text-slate-200">{log.metadata.postCount}</p>
                        </div>
                      )}
                      {log.metadata.reviewCount !== undefined && (
                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-lg px-2 py-1 text-center">
                          <p className="text-[9px] text-slate-400 uppercase tracking-wider">评论数</p>
                          <p className="text-sm font-black text-slate-800 dark:text-slate-200">{log.metadata.reviewCount}</p>
                        </div>
                      )}
                      {log.metadata.rating !== undefined && log.metadata.rating !== null && (
                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-lg px-2 py-1 text-center">
                          <p className="text-[9px] text-slate-400 uppercase tracking-wider">评分</p>
                          <p className="text-sm font-black text-amber-500">⭐ {log.metadata.rating}</p>
                        </div>
                      )}
                      {log.metadata.accounts !== undefined && (
                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-lg px-2 py-1 text-center">
                          <p className="text-[9px] text-slate-400 uppercase tracking-wider">账户</p>
                          <p className="text-sm font-black text-slate-800 dark:text-slate-200">{log.metadata.accounts}</p>
                        </div>
                      )}
                      {log.metadata.conversions !== undefined && (
                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-lg px-2 py-1 text-center">
                          <p className="text-[9px] text-slate-400 uppercase tracking-wider">转化事件</p>
                          <p className="text-sm font-black text-slate-800 dark:text-slate-200">{log.metadata.conversions}</p>
                        </div>
                      )}
                      {log.metadata.durationMs !== undefined && log.metadata.durationMs > 0 && (
                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-lg px-2 py-1 text-center">
                          <p className="text-[9px] text-slate-400 uppercase tracking-wider">耗时</p>
                          <p className="text-sm font-black text-slate-800 dark:text-slate-200">{log.metadata.durationMs}ms</p>
                        </div>
                      )}
                    </div>
                  )}

                  {log.metadata?.error && (
                    <p className="text-[10px] text-red-500 dark:text-red-400 mt-2 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-lg font-mono">
                      ⚠ {log.metadata.error}
                    </p>
                  )}

                  {log.metadata?.dateRange && (
                    <p className="text-[9px] text-slate-400 mt-1.5">📅 {log.metadata.dateRange}</p>
                  )}
                </div>
              ) : (
                /* ── Standard audit log entry ── */
                (() => {
                  const action = log.action ?? 'UNKNOWN'
                  return (
                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${ACTION_COLORS[action] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                            {action}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {log.resourceType}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]">#{log.resourceId?.substring(0, 10)}</span>
                        </div>
                        {log.reason && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{log.reason}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-400">
                            {log.actorName ?? log.actorType ?? 'SYSTEM'}
                          </span>
                          <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(log.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })()
              )
            ))
          )}
        </div>
      </div>
    </div>
  )
}
