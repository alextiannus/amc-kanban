'use client'

/**
 * SchedulerPanel.tsx — Scheduler 巡检管理面板
 * ──────────────────────────────────────────────────────────────────────────────
 * 功能：
 *   1. 显示上次巡检时间、告警数量、状态
 *   2. "立即运行巡检"手动触发按钮
 *   3. 最近 10 条巡检报告历史列表（可展开详情）
 */

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportSummary {
  totalBrands: number
  alertsGenerated: number
  silenceAlerts: number
  frequencyAlerts: number
  duplicateAlerts: number
  failedPostAlerts: number
  durationMs: number
  runAt: string
}

interface SchedulerReport {
  id: string
  triggeredBy: string
  runAt: string
  summary: ReportSummary
  status: 'completed' | 'failed'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AlertBadge({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className={`flex flex-col items-center px-4 py-3 rounded-lg border ${color}`}>
      <span className="text-2xl font-bold">{count}</span>
      <span className="text-xs opacity-70 mt-0.5 text-center">{label}</span>
    </div>
  )
}

function ReportRow({ report, onExpand }: { report: SchedulerReport; onExpand: () => void }) {
  const s = report.summary
  const runDate = new Date(report.runAt)
  const isManual = report.triggeredBy !== 'cron'

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-700/50 hover:bg-gray-700/50 transition-colors cursor-pointer"
      onClick={onExpand}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">{report.status === 'completed' ? '✅' : '❌'}</span>
        <div>
          <div className="text-sm font-medium text-gray-200">
            {runDate.toLocaleDateString('zh-CN')} {runDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            {isManual && (
              <span className="ml-2 text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">手动</span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {s.totalBrands} 品牌 · {s.alertsGenerated} 告警 · {s.durationMs}ms
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        {s.silenceAlerts > 0 && (
          <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
            🔇 {s.silenceAlerts}
          </span>
        )}
        {s.frequencyAlerts > 0 && (
          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
            📉 {s.frequencyAlerts}
          </span>
        )}
        {s.duplicateAlerts > 0 && (
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">
            🔁 {s.duplicateAlerts}
          </span>
        )}
        {s.failedPostAlerts > 0 && (
          <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">
            ⚠️ {s.failedPostAlerts}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SchedulerPanel() {
  const [reports, setReports] = useState<SchedulerReport[]>([])
  const [lastReport, setLastReport] = useState<SchedulerReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<{ success: boolean; message: string } | null>(null)

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      const [reportsRes, statusRes] = await Promise.all([
        fetch('/api/scheduler/reports?limit=10'),
        fetch('/api/scheduler/daily-check'),
      ])
      if (reportsRes.ok) {
        const data = await reportsRes.json()
        setReports(data.reports ?? [])
      }
      if (statusRes.ok) {
        const data = await statusRes.json()
        if (data.lastReport) setLastReport(data.lastReport)
      }
    } catch (e) {
      console.error('Failed to fetch scheduler reports:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchReports() }, [fetchReports])

  const handleRunNow = async () => {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await fetch('/api/scheduler/daily-check', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        setRunResult({
          success: true,
          message: `巡检完成！共发现 ${data.summary.alertsGenerated} 条告警，耗时 ${data.summary.durationMs}ms`,
        })
        await fetchReports()
      } else {
        setRunResult({ success: false, message: data.error ?? '巡检执行失败' })
      }
    } catch {
      setRunResult({ success: false, message: '请求失败，请稍后重试' })
    } finally {
      setRunning(false)
    }
  }

  const latestSummary = lastReport?.summary
  const lastRunTime = lastReport ? new Date(lastReport.runAt) : null
  const minutesSince = lastRunTime ? Math.floor((Date.now() - lastRunTime.getTime()) / 60000) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            🕐 Scheduler 智能排期巡检
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {lastRunTime
              ? `上次运行：${lastRunTime.toLocaleString('zh-CN')}（${minutesSince} 分钟前）`
              : '暂无巡检记录'}
            <span className="ml-2 text-gray-500">· 每天 07:00 / 14:00 自动运行</span>
          </p>
        </div>
        <button
          onClick={handleRunNow}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
        >
          {running ? (
            <>
              <span className="animate-spin">⟳</span>
              巡检中...
            </>
          ) : (
            <>▶ 立即运行</>
          )}
        </button>
      </div>

      {/* Run result toast */}
      {runResult && (
        <div className={`px-4 py-3 rounded-lg text-sm ${
          runResult.success
            ? 'bg-green-900/30 border border-green-700/50 text-green-300'
            : 'bg-red-900/30 border border-red-700/50 text-red-300'
        }`}>
          {runResult.success ? '✅ ' : '❌ '}{runResult.message}
        </div>
      )}

      {/* Latest summary cards */}
      {latestSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <AlertBadge
            count={latestSummary.silenceAlerts}
            label="沉默告警"
            color={latestSummary.silenceAlerts > 0
              ? 'bg-red-900/30 border-red-700/50 text-red-300'
              : 'bg-gray-800/50 border-gray-700/50 text-gray-400'}
          />
          <AlertBadge
            count={latestSummary.frequencyAlerts}
            label="频率不足"
            color={latestSummary.frequencyAlerts > 0
              ? 'bg-yellow-900/30 border-yellow-700/50 text-yellow-300'
              : 'bg-gray-800/50 border-gray-700/50 text-gray-400'}
          />
          <AlertBadge
            count={latestSummary.duplicateAlerts}
            label="主题重复"
            color={latestSummary.duplicateAlerts > 0
              ? 'bg-purple-900/30 border-purple-700/50 text-purple-300'
              : 'bg-gray-800/50 border-gray-700/50 text-gray-400'}
          />
          <AlertBadge
            count={latestSummary.failedPostAlerts}
            label="发布失败"
            color={latestSummary.failedPostAlerts > 0
              ? 'bg-orange-900/30 border-orange-700/50 text-orange-300'
              : 'bg-gray-800/50 border-gray-700/50 text-gray-400'}
          />
        </div>
      )}

      {/* Reports history */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          最近巡检记录
        </h4>
        {loading ? (
          <div className="text-sm text-gray-500 text-center py-6">加载中...</div>
        ) : reports.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-6">
            暂无巡检记录。点击"立即运行"执行首次巡检。
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map(report => (
              <div key={report.id}>
                <ReportRow
                  report={report}
                  onExpand={() => setExpandedId(expandedId === report.id ? null : report.id)}
                />
                {expandedId === report.id && (
                  <div className="mt-1 px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700/30 text-xs text-gray-400 space-y-1">
                    <div>🏢 品牌数量：{report.summary.totalBrands}</div>
                    <div>🔇 沉默告警：{report.summary.silenceAlerts}</div>
                    <div>📉 频率不足：{report.summary.frequencyAlerts}</div>
                    <div>🔁 主题重复：{report.summary.duplicateAlerts}</div>
                    <div>⚠️ 发布失败：{report.summary.failedPostAlerts}</div>
                    <div>⏱ 耗时：{report.summary.durationMs}ms</div>
                    <div>👤 触发方式：{report.triggeredBy === 'cron' ? '自动（Cron）' : `手动 (${report.triggeredBy})`}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
