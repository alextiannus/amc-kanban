'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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

  useEffect(() => {
    const load = async () => {
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
    }

    void load()
  }, [])

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">加载主理人看板中...</div>
  }

  if (error) {
    return (
      <div className="p-8 space-y-4">
        <p className="text-sm text-rose-600">{error}</p>
        <button
          onClick={() => router.push('/profile')}
          className="rounded-lg bg-slate-900 px-4 py-2 text-white text-sm"
        >
          返回设置中心
        </button>
      </div>
    )
  }

  if (!data) {
    return <div className="p-8 text-sm text-slate-500">暂无数据</div>
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 min-h-screen">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">主理人看板</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            汇总查看主理人的全部 AI Agent、绑定品牌与品牌动作日志
          </p>
        </div>
        <button
          onClick={() => router.push('/profile')}
          className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300"
        >
          返回设置中心
        </button>
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
        <h2 className="text-lg font-black text-slate-900 dark:text-slate-50 mb-4">全部 AI Agent 与品牌绑定</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.agents.map((agent) => (
            <div key={agent.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/60 dark:bg-slate-800/30">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-slate-900 dark:text-white truncate">{agent.nickname || agent.email}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${agent.isOnline ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                  {agent.isOnline ? '在线' : '离线'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 truncate">{agent.email}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {agent.boundBrands.length === 0 ? (
                  <span className="text-xs text-slate-400">未绑定品牌</span>
                ) : (
                  agent.boundBrands.map((brand) => (
                    <span key={`${agent.id}-${brand.id}`} className="text-[11px] px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      {brand.name}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-lg font-black text-slate-900 dark:text-slate-50 mb-4">品牌列表</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">品牌</th>
                <th className="py-2 pr-3">状态</th>
                <th className="py-2 pr-3">绑定 Agent</th>
                <th className="py-2">动作项</th>
              </tr>
            </thead>
            <tbody>
              {data.brands.map((brand) => (
                <tr key={brand.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{brand.name}</p>
                    {brand.location && <p className="text-xs text-slate-400">{brand.location}</p>}
                  </td>
                  <td className="py-2 pr-3 text-xs">{brand.status}</td>
                  <td className="py-2 pr-3">{brand._count.brandAgents}</td>
                  <td className="py-2">{brand._count.actionItems}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-lg font-black text-slate-900 dark:text-slate-50 mb-4">品牌动作日志（最近）</h2>
        <div className="space-y-2">
          {data.actionLogs.map((log) => (
            <div key={log.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{log.brand.name}</span>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{log.type}</span>
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{log.priority}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{log.status}</span>
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{log.title}</p>
              <p className="text-xs text-slate-400 mt-1">更新时间: {new Date(log.updatedAt).toLocaleString('zh-CN')}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
