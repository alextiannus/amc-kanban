'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bot, ExternalLink, KeyRound, Plus, RefreshCw, Settings, X } from 'lucide-react'
import AgentDetailPanel from '@/components/AgentDetailPanel'
import AgentSequenceView from '@/components/AgentSequenceView'
import AvatarImage from '@/components/AvatarImage'
import NewAgentKeyModal from '@/components/layout/NewAgentKeyModal'

type DashboardPayload = {
  dashboardRole: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
  userRoles?: string[]
  scope?: 'all' | 'mine'
  summary: {
    totalAgents: number
    totalBrands: number
    totalActionLogs: number
  }
  agents: Array<{
    id: string
    email: string
    nickname: string | null
    introduction?: string | null
    insights?: string | null
    workflow?: string | null
    themeColor?: string | null
    avatar?: string | null
    apiKey?: string | null
    isOnline: boolean
    boundBrands: Array<{ id: string; name: string; role: string }>
  }>
  brands: Array<{
    id: string
    name: string
    location: string | null
    status: string
    subscriptions?: Array<{
      status: string
    }>
    owners: Array<{
      userId: string
      role: string
      user: {
        id: string
        email: string
        nickname: string | null
      }
    }>
    brandAgents: Array<{
      agentId: string
      role: string
      agent: {
        id: string
        email: string
        nickname: string | null
      }
    }>
    _count: {
      actionItems: number
      brandAgents: number
    }
  }>
  actionLogs: Array<{
    id: string
    brandId: string
    type: string
    priority: string
    title: string
    status: string
    agentId: string | null
    createdAt: string
    updatedAt: string
    brand: { id: string; name: string }
  }>
}

type AgentDetail = DashboardPayload['agents'][number]

function statusBadgeClass(status: string) {
  switch (status) {
    case 'ACTIVE':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
    case 'PENDING':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300'
    case 'FAILED':
      return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
    case 'CANCELLED':
    case 'PAUSED':
    case 'ARCHIVED':
      return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300'
  }
}

export default function PrincipalDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [agentSelections, setAgentSelections] = useState<Record<string, string>>({})
  const [selectedAgent, setSelectedAgent] = useState<AgentDetail | null>(null)
  const [agentModalLoading, setAgentModalLoading] = useState(false)
  const [selectedActionBrandId, setSelectedActionBrandId] = useState('')
  const [adminScope, setAdminScope] = useState<'all' | 'mine'>('all')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = adminScope === 'mine' ? '?scope=mine' : ''
      const res = await fetch(`/api/profile/principal-dashboard${query}`, { cache: 'no-store' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '加载主理人看板失败')
      }
      const json = await res.json() as DashboardPayload
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [adminScope])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  if (loading) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 text-sm text-slate-500 dark:text-slate-400">加载主理人看板中...</div>
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 space-y-4">
        <p className="text-sm text-rose-600">{error}</p>
        <button
          onClick={() => router.back()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          返回上一页
        </button>
      </div>
    )
  }

  if (!data) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 text-sm text-slate-500 dark:text-slate-400">暂无数据</div>
  }

  const filteredActionLogs = selectedActionBrandId
    ? data.actionLogs.filter((log) => log.brandId === selectedActionBrandId)
    : data.actionLogs

  const createAgentKey = async () => {
    try {
      const res = await fetch('/api/agents/keys', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '新增 Agent 失败')
        return
      }
      setNewApiKey(json.apiKey)
    } catch {
      alert('新增 Agent 失败，请稍后重试')
    }
  }

  const withBusy = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key)
    try {
      await action()
    } finally {
      setBusyKey(null)
    }
  }

  const openAgentModal = async (agentId: string) => {
    const localAgent = data.agents.find((agent) => agent.id === agentId)
    if (localAgent) setSelectedAgent(localAgent)
    setAgentModalLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}`)
      const json = await res.json().catch(() => null)
      if (res.ok && json) {
        setSelectedAgent({
          ...(localAgent || {} as AgentDetail),
          ...json,
          isOnline: localAgent?.isOnline ?? Boolean(json.tasksAsAssignee?.length),
          boundBrands: localAgent?.boundBrands || [],
        })
      } else if (!localAgent) {
        alert(json?.error || '打开 Agent 详情失败')
      }
    } catch {
      if (!localAgent) alert('打开 Agent 详情失败')
    } finally {
      setAgentModalLoading(false)
    }
  }

  const bindBrandAgent = async (brandId: string) => {
    const agentId = agentSelections[brandId]
    if (!agentId) {
      alert('请选择 AI 序列中的 Agent')
      return
    }

    await withBusy(`agent-add-${brandId}`, async () => {
      const res = await fetch(`/api/brands/${brandId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, role: 'worker' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '添加 Agent 失败')
        return
      }
      setAgentSelections((prev) => ({ ...prev, [brandId]: '' }))
      await loadDashboard()
    })
  }

  const replaceBrandAgent = async (brandId: string, currentAgentIds: string[]) => {
    const agentId = agentSelections[brandId]
    if (!agentId) {
      alert('请选择要替换成的 Agent')
      return
    }

    await withBusy(`agent-replace-${brandId}`, async () => {
      for (const currentAgentId of currentAgentIds) {
        if (currentAgentId === agentId) continue
        const removeRes = await fetch(`/api/brands/${brandId}/agents?agentId=${encodeURIComponent(currentAgentId)}`, {
          method: 'DELETE',
        })
        if (!removeRes.ok) {
          const json = await removeRes.json().catch(() => ({}))
          alert(json.error || '替换 Agent 失败')
          return
        }
      }

      const res = await fetch(`/api/brands/${brandId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, role: 'worker' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '替换 Agent 失败')
        return
      }
      setAgentSelections((prev) => ({ ...prev, [brandId]: '' }))
      await loadDashboard()
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="space-y-4">
          <button
            onClick={() => router.push('/board')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> 返回首页
          </button>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white">主理人看板</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                汇总查看主理人的全部 AI Agent、绑定品牌与品牌动作日志
              </p>
            </div>
            {data.dashboardRole === 'ADMIN' && (
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold dark:border-slate-700 dark:bg-slate-900">
                <button
                  onClick={() => setAdminScope('all')}
                  className={`rounded-lg px-3 py-1.5 ${adminScope === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-indigo-600 dark:text-slate-300'}`}
                >
                  全系统
                </button>
                <button
                  onClick={() => setAdminScope('mine')}
                  className={`rounded-lg px-3 py-1.5 ${adminScope === 'mine' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-indigo-600 dark:text-slate-300'}`}
                >
                  我的主理人品牌
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs text-slate-400">AI Agent</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-50">{data.summary.totalAgents}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs text-slate-400">绑定品牌</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-50">{data.summary.totalBrands}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs text-slate-400">品牌动作日志</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-50">{data.summary.totalActionLogs}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <AgentSequenceView
            headerAction={(
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button
                  onClick={createAgentKey}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
                >
                  <KeyRound className="h-4 w-4" /> 新增 AMC Agent
                </button>
                <a
                  href="/connect"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300"
                >
                  <ExternalLink className="h-4 w-4" /> 查看 AI 连接方式
                </a>
              </div>
            )}
          />
        </section>

        <section id="principal-brands-section" className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Brand Operations</p>
              <h2 className="mt-1 text-lg font-black text-slate-900 dark:text-slate-50">品牌列表</h2>
            </div>
            <button
              onClick={() => router.push('/profile/principal/brands/new')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> 添加新品牌
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 pr-3">品牌</th>
                  <th className="py-2 pr-3">品牌主信息</th>
                  <th className="py-2 pr-3">状态</th>
                  <th className="py-2 pr-3">AI 序列</th>
                  <th className="py-2 pr-3">动作项</th>
                  <th className="py-2">管理</th>
                </tr>
              </thead>
              <tbody>
                {data.brands.map((brand) => {
                  const owner = brand.owners[0]
                  return (
                    <tr key={brand.id} className="border-b border-slate-100 dark:border-slate-800 align-top">
                      <td className="py-2 pr-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{brand.name}</p>
                        {brand.location && <p className="text-xs text-slate-400">{brand.location}</p>}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        {owner ? (
                          <div>
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{owner.user.nickname || owner.user.email}</p>
                            <p className="text-[11px] text-slate-400">{owner.user.email}</p>
                          </div>
                        ) : <p className="text-xs text-slate-400">暂无品牌主</p>}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {(() => {
                          const subStatus = brand.subscriptions?.[0]?.status || 'PENDING'
                          return (
                            <span className={`inline-flex rounded-full border px-2 py-0.5 font-bold ${statusBadgeClass(subStatus)}`}>
                              {subStatus}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <div className="min-w-[260px] space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {brand.brandAgents.length === 0 ? (
                              <p className="text-xs text-slate-400">未绑定</p>
                            ) : (
                              brand.brandAgents.map((link) => (
                                <button
                                  key={`${brand.id}-${link.agentId}`}
                                  onClick={() => openAgentModal(link.agentId)}
                                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300"
                                >
                                  {link.agent.nickname || link.agent.email}
                                </button>
                              ))
                            )}
                          </div>
                          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                            <select
                              value={agentSelections[brand.id] || ''}
                              onChange={(event) => setAgentSelections((prev) => ({ ...prev, [brand.id]: event.target.value }))}
                              className="min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-400"
                            >
                              <option value="">选择 Agent</option>
                              {data.agents.map((agent) => (
                                <option key={agent.id} value={agent.id}>{agent.nickname || agent.email}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => bindBrandAgent(brand.id)}
                              disabled={!agentSelections[brand.id] || busyKey === `agent-add-${brand.id}` || busyKey === `agent-replace-${brand.id}`}
                              className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              添加
                            </button>
                            <button
                              onClick={() => replaceBrandAgent(brand.id, brand.brandAgents.map((link) => link.agentId))}
                              disabled={!agentSelections[brand.id] || brand.brandAgents.length === 0 || busyKey === `agent-add-${brand.id}` || busyKey === `agent-replace-${brand.id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
                            >
                              <RefreshCw className="h-3 w-3" /> 替换
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{brand._count.actionItems}</td>
                      <td className="py-2">
                        <button
                          onClick={() => router.push(`/profile/principal/brands/${brand.id}`)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300"
                        >
                          <Settings className="h-3.5 w-3.5" /> 管理
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-50">品牌动作日志（最近）</h2>
              <p className="mt-1 text-xs text-slate-400">当前显示 {filteredActionLogs.length} 条</p>
            </div>
            <select
              value={selectedActionBrandId}
              onChange={(event) => setSelectedActionBrandId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-400 sm:w-64"
              aria-label="按品牌筛选动作日志"
            >
              <option value="">全部品牌</option>
              {data.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {filteredActionLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-6 text-center text-sm text-slate-400">
                当前品牌暂无动作日志
              </div>
            ) : filteredActionLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                      <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{log.brand.name}</span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{log.type}</span>
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{log.priority}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{log.status}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{log.title}</p>
                  </div>
                  <p className="shrink-0 text-xs text-slate-400 md:text-right">{new Date(log.updatedAt).toLocaleString('zh-CN')}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {newApiKey && (
          <NewAgentKeyModal
            newApiKey={newApiKey}
            onClose={() => setNewApiKey(null)}
          />
        )}

        {selectedAgent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setSelectedAgent(null)}>
            <div
              onClick={(event) => event.stopPropagation()}
              className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div
                    style={selectedAgent.themeColor ? { backgroundColor: `${selectedAgent.themeColor}20`, color: selectedAgent.themeColor } : undefined}
                    className={`h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-white dark:border-slate-700 shadow-sm flex items-center justify-center text-sm font-bold ${!selectedAgent.themeColor ? 'bg-slate-200 text-slate-600' : ''}`}
                  >
                    {selectedAgent.avatar ? (
                      <AvatarImage src={selectedAgent.avatar} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      (selectedAgent.nickname || selectedAgent.email.split('@')[0]).substring(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xl font-black text-slate-900 dark:text-slate-50">{selectedAgent.nickname || selectedAgent.email.split('@')[0]}</p>
                    <p className="truncate text-sm text-slate-400">{selectedAgent.email}</p>
                    {agentModalLoading && <p className="mt-1 text-xs text-indigo-500">正在刷新详情...</p>}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="关闭 Agent 详情"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selectedAgent.insights && (
                <div className="mt-5">
                  <span className="text-[10px] uppercase font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded flex w-fit mb-2">
                    Workflow
                  </span>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed">{selectedAgent.insights}</p>
                </div>
              )}

              <AgentDetailPanel agent={selectedAgent} />

              {!selectedAgent.apiKey && !selectedAgent.introduction && !selectedAgent.workflow && (
                <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-500 dark:text-slate-400">
                  <Bot className="mb-2 h-5 w-5" /> 暂无更多 Agent 详情。
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
