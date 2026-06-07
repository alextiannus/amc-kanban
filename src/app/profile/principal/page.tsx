'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, KeyRound, Plus, Settings } from 'lucide-react'
import AgentSequenceView from '@/components/AgentSequenceView'
import NewAgentKeyModal from '@/components/layout/NewAgentKeyModal'

type DashboardPayload = {
  dashboardRole: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
  summary: {
    totalAgents: number
    totalBrands: number
    totalActionLogs: number
  }
  agents: Array<{
    id: string
    email: string
    nickname: string | null
    isOnline: boolean
    boundBrands: Array<{ id: string; name: string; role: string }>
  }>
  brands: Array<{
    id: string
    name: string
    location: string | null
    status: string
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

export default function PrincipalDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/profile/principal-dashboard')
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
  }, [])

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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">主理人看板</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            汇总查看主理人的全部 AI Agent、绑定品牌与品牌动作日志
          </p>
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
          <button
            onClick={createAgentKey}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
          >
            <KeyRound className="h-4 w-4" /> 新增 AMC Agent
          </button>
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
                <th className="py-2 pr-3">绑定 AMC Agent</th>
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
                  <td className="py-2 pr-3 text-xs">{brand.status}</td>
                  <td className="py-2 pr-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {brand.brandAgents.length === 0 ? (
                        <p className="text-xs text-slate-400">未绑定</p>
                      ) : (
                        brand.brandAgents.map((link) => (
                          <button
                            key={`${brand.id}-${link.agentId}`}
                            onClick={() => router.push(`/agents/${link.agentId}`)}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300"
                          >
                            {link.agent.nickname || link.agent.email}
                          </button>
                        ))
                      )}
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
        <h2 className="text-lg font-black text-slate-900 dark:text-slate-50 mb-4">品牌动作日志（最近）</h2>
        <div className="space-y-2">
          {data.actionLogs.map((log) => (
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
      </div>
    </div>
  )
}
