'use client'

import React, { useState } from 'react'
import { CreditCard, Save, RefreshCw, BarChart2, ShieldAlert, Cpu, ToggleLeft, ToggleRight, Check, Trash2 } from 'lucide-react'

export interface AssignmentPoolConfig {
  id: string
  enabled: boolean
  overflowPolicy: 'fallback_only' | 'pending_queue' | 'allow_soft_overflow'
  rebalancePolicy: 'manual_only' | 'scheduled_daily'
  matchingOrder: 'industry_first' | 'region_first'
  fallbackAgentId: string | null
}

export interface AssignmentPoolMember {
  id: string
  agentId: string
  agentNickname: string | null
  agentEmail: string | null
  active: boolean
  capacity: number
  priority: number
  industries: string[]
  regions: string[]
  currentLoad: number
  availableSlots: number
  overloaded: boolean
}

export interface AssignmentDecision {
  id: string
  subjectType: string
  subjectId: string
  matchedBy: string | null
  selectedAgentId: string | null
  reason: string | null
  overflowHandled: boolean
  fallbackUsed: boolean
  createdAt: string
}

interface PoolTabProps {
  poolConfig: AssignmentPoolConfig | null
  poolMembers: AssignmentPoolMember[]
  poolDecisions: AssignmentDecision[]
  poolLoading: boolean
  onFetchPoolData: () => Promise<void>
  onFetchDecisionLogs: () => Promise<void>
  onPatchPoolMember: (member: AssignmentPoolMember, patch: Partial<AssignmentPoolMember>) => Promise<void>
  onDeletePoolMember: (member: AssignmentPoolMember) => Promise<void>
  allAgents: { id: string; email: string; nickname: string | null }[]
}

export default function PoolTab({
  poolConfig,
  poolMembers,
  poolDecisions,
  poolLoading,
  onFetchPoolData,
  onFetchDecisionLogs,
  onPatchPoolMember,
  onDeletePoolMember,
  allAgents
}: PoolTabProps) {
  const [savingConfig, setSavingConfig] = useState(false)
  const [configDraft, setConfigDraft] = useState<Partial<AssignmentPoolConfig>>({})

  const handleUpdateConfig = (patch: Partial<AssignmentPoolConfig>) => {
    setConfigDraft(prev => ({ ...prev, ...patch }))
  }

  const handleSaveConfig = async () => {
    if (!poolConfig) return
    setSavingConfig(true)
    try {
      const payload = {
        enabled: configDraft.enabled ?? poolConfig.enabled,
        overflowPolicy: configDraft.overflowPolicy ?? poolConfig.overflowPolicy,
        rebalancePolicy: configDraft.rebalancePolicy ?? poolConfig.rebalancePolicy,
        matchingOrder: configDraft.matchingOrder ?? poolConfig.matchingOrder,
        fallbackAgentId: configDraft.fallbackAgentId !== undefined ? configDraft.fallbackAgentId : poolConfig.fallbackAgentId,
      }
      const res = await fetch('/api/admin/agent-assignment-pool/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        await onFetchPoolData()
        setConfigDraft({})
        alert('派单池配置已成功保存')
      } else {
        alert('保存派单池配置失败')
      }
    } catch (e) {
      console.error(e)
      alert('保存失败，请检查网络')
    } finally {
      setSavingConfig(false)
    }
  }

  const activeConfig = { ...poolConfig, ...configDraft } as AssignmentPoolConfig

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Cpu size={18} className="text-indigo-500" /> AI 派单智能调度池
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            配置系统对新托管商户的 AI 团队智能匹配算法。通过行业背景、地区重合度与实时负荷评估，实现工作量的最优自动分配。
          </p>
        </div>
        <button 
          onClick={onFetchPoolData}
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 transition-all cursor-pointer"
        >
          <RefreshCw size={13} className={poolLoading ? 'animate-spin' : ''} />
          <span>刷新派单状态</span>
        </button>
      </div>

      {poolConfig && (
        /* Global Dispatch Rules Config */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${activeConfig.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">派单路由全局配置</h3>
            </div>

            <button 
              onClick={handleSaveConfig} 
              disabled={savingConfig || Object.keys(configDraft).length === 0}
              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-blue-650 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm cursor-pointer"
            >
              <Save size={12} />
              <span>保存配置</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">自动分配开关</span>
              <button
                type="button"
                onClick={() => handleUpdateConfig({ enabled: !activeConfig.enabled })}
                className="flex items-center gap-1.5 focus:outline-none"
              >
                {activeConfig.enabled ? (
                  <ToggleRight className="w-8 h-8 text-blue-600 cursor-pointer" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-slate-400 cursor-pointer" />
                )}
                <span className="text-xs font-semibold text-slate-650 dark:text-slate-350">{activeConfig.enabled ? '已启用' : '已停用'}</span>
              </button>
            </div>

            <label className="space-y-1.5 block">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">标签匹配次序 (Order)</span>
              <select 
                value={activeConfig.matchingOrder} 
                onChange={e => handleUpdateConfig({ matchingOrder: e.target.value as any })}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="industry_first">行业背景优先 (Industry)</option>
                <option value="region_first">服务地区优先 (Region)</option>
              </select>
            </label>

            <label className="space-y-1.5 block">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">负荷溢出策略 (Overflow)</span>
              <select 
                value={activeConfig.overflowPolicy} 
                onChange={e => handleUpdateConfig({ overflowPolicy: e.target.value as any })}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="fallback_only">退回备用 AI 账号</option>
                <option value="pending_queue">排队等待空闲容量</option>
                <option value="allow_soft_overflow">允许轻度超出上限</option>
              </select>
            </label>

            <label className="space-y-1.5 block">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">备用兜底 AI 账号 (Fallback)</span>
              <select 
                value={activeConfig.fallbackAgentId || ''} 
                onChange={e => handleUpdateConfig({ fallbackAgentId: e.target.value || null })}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">未指定 (退回报错)</option>
                {allAgents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.nickname || agent.email}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {/* Member load cards */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">调度池在线成员负载监控</h3>
          <span className="text-xs text-slate-400 font-bold">在线: {poolMembers.filter(m => m.active).length} / 共 {poolMembers.length} 账号</span>
        </div>

        {poolMembers.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">暂无分配池成员账号，可在“AI 序列配置”卡片中一键添加</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {poolMembers.map((m) => {
              const usagePercent = Math.min(100, Math.round((m.currentLoad / (m.capacity || 30)) * 100))
              const isOverloaded = m.overloaded || m.currentLoad >= m.capacity

              return (
                <div 
                  key={m.agentId} 
                  className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/20 ${
                    m.active 
                      ? 'border-slate-200 dark:border-slate-800' 
                      : 'border-slate-150/60 dark:border-slate-850 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 dark:text-white truncate">{m.agentNickname || m.agentId}</p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">{m.agentEmail || m.agentId}</p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input 
                        type="checkbox"
                        checked={m.active}
                        onChange={e => onPatchPoolMember(m, { active: e.target.checked })}
                        className="rounded border-slate-350 text-indigo-650 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        title={m.active ? '设为忙碌' : '设为在线'}
                      />
                      <button 
                        onClick={() => onDeletePoolMember(m)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                        title="移出调度池"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Load progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-450">
                      <span>实时商户数 (Active Load)</span>
                      <span className={isOverloaded ? 'text-rose-500 font-black' : 'text-slate-600 dark:text-slate-300'}>
                        {m.currentLoad} / {m.capacity} ({usagePercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          isOverloaded 
                            ? 'bg-rose-500' 
                            : usagePercent > 80 
                              ? 'bg-amber-500' 
                              : 'bg-indigo-600'
                        }`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 text-[9px] text-slate-400">
                    {m.industries.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700">💼 {tag}</span>
                    ))}
                    {m.regions.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 text-indigo-600 dark:text-indigo-400">📍 {tag}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Decisions Log table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <CreditCard size={15} className="text-slate-500" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">自动分派决策审计日志</h3>
          </div>
          <button 
            onClick={onFetchDecisionLogs} 
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-350 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 transition-all cursor-pointer"
          >
            <RefreshCw size={11} />
            <span>刷新日志</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-150 dark:border-slate-800">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-905 text-slate-400 font-extrabold uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">时间</th>
                <th className="text-left px-4 py-3">匹配类型</th>
                <th className="text-left px-4 py-3">商户主键</th>
                <th className="text-left px-4 py-3">分派 AI 员工</th>
                <th className="text-left px-4 py-3">匹配策略</th>
                <th className="text-left px-4 py-3">命中详情原因</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-300">
              {poolDecisions.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-4 py-2.5 font-black">{log.subjectType}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-400">
                    {log.subjectId}
                  </td>
                  <td className="px-4 py-2.5 font-semibold">
                    {log.selectedAgentId ? (
                      <span className="font-mono text-indigo-650 dark:text-indigo-400">{log.selectedAgentId}</span>
                    ) : (
                      <span className="text-slate-400">(none)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {log.matchedBy ? (
                      <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 font-bold">{log.matchedBy}</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 leading-relaxed text-slate-450">{log.reason || '-'}</td>
                </tr>
              ))}
              {poolDecisions.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={6}>暂无决策日志记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
