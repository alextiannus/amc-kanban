'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AgentsWorkflowView from '@/components/dashboard/AgentsWorkflowView'
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
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [brandDrafts, setBrandDrafts] = useState<Record<string, { name: string; location: string }>>({})
  const [ownerInputs, setOwnerInputs] = useState<Record<string, string>>({})
  const [agentSelections, setAgentSelections] = useState<Record<string, string>>({})
  const [newBrand, setNewBrand] = useState({ name: '', location: '' })

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
      setBrandDrafts(
        Object.fromEntries(
          json.brands.map((brand) => [brand.id, { name: brand.name, location: brand.location || '' }])
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const visibleAgentOptions = useMemo(() => data?.agents || [], [data])

  const withBusy = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key)
    try {
      await action()
    } finally {
      setBusyKey(null)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 text-sm text-slate-500 dark:text-slate-400">加载主理人看板中...</div>
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 space-y-4">
        <p className="text-sm text-rose-600">{error}</p>
        <button
          onClick={() => router.push('/profile')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          返回设置中心
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

  const createBrand = async () => {
    const name = newBrand.name.trim()
    if (!name) {
      alert('请填写品牌名称')
      return
    }

    const params = new URLSearchParams({
      newBrandName: name,
      returnTo: '/profile/principal',
    })
    const location = newBrand.location.trim()
    if (location) params.set('newBrandLocation', location)
    router.push(`/board/subscription?${params.toString()}`)
  }

  const saveBrandBase = async (brandId: string) => {
    const draft = brandDrafts[brandId]
    if (!draft || !draft.name.trim()) {
      alert('品牌名称不能为空')
      return
    }

    await withBusy(`brand-save-${brandId}`, async () => {
      const res = await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name.trim(), location: draft.location.trim() || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '修改品牌失败')
        return
      }
      await loadDashboard()
    })
  }

  const deleteBrand = async (brandId: string, name: string) => {
    if (!confirm(`确认删除品牌「${name}」吗？`)) return

    await withBusy(`brand-delete-${brandId}`, async () => {
      const res = await fetch(`/api/brands/${brandId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '删除品牌失败')
        return
      }
      await loadDashboard()
    })
  }

  const addBrandOwner = async (brandId: string) => {
    const email = (ownerInputs[brandId] || '').trim()
    if (!email) {
      alert('请输入品牌主邮箱')
      return
    }

    await withBusy(`owner-add-${brandId}`, async () => {
      const res = await fetch(`/api/brands/${brandId}/owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: 'owner' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '添加品牌主失败')
        return
      }
      setOwnerInputs((prev) => ({ ...prev, [brandId]: '' }))
      await loadDashboard()
    })
  }

  const removeBrandOwner = async (brandId: string, userId: string) => {
    await withBusy(`owner-remove-${brandId}-${userId}`, async () => {
      const res = await fetch(`/api/brands/${brandId}/owners/${userId}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '移除品牌主失败')
        return
      }
      await loadDashboard()
    })
  }

  const addBrandAgent = async (brandId: string) => {
    const agentId = agentSelections[brandId]
    if (!agentId) {
      alert('请选择 AMC Agent')
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
        alert(json.error || '绑定 Agent 失败')
        return
      }
      setAgentSelections((prev) => ({ ...prev, [brandId]: '' }))
      await loadDashboard()
    })
  }

  const removeBrandAgent = async (brandId: string, agentId: string) => {
    await withBusy(`agent-remove-${brandId}-${agentId}`, async () => {
      const res = await fetch(`/api/brands/${brandId}/agents?agentId=${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '解绑 Agent 失败')
        return
      }
      await loadDashboard()
    })
  }

  const scrollToBrands = () => {
    const section = document.getElementById('principal-brands-section')
    if (!section) return
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">主理人看板</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            汇总查看主理人的全部 AI Agent、绑定品牌与品牌动作日志
          </p>
        </div>
        <button
          onClick={() => router.push('/profile')}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
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

      <AgentsWorkflowView
        onOpenDashboard={scrollToBrands}
        onCreateAgent={createAgentKey}
      />

      <section id="principal-brands-section" className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex flex-col gap-1 mb-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Brand Operations</p>
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-50">品牌列表</h2>
        </div>

        <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950/40">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">添加新品牌</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
            <input
              value={newBrand.name}
              onChange={(e) => setNewBrand((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="品牌名称"
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
            <input
              value={newBrand.location}
              onChange={(e) => setNewBrand((prev) => ({ ...prev, location: e.target.value }))}
              placeholder="品牌位置（可选）"
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
            <button
              onClick={createBrand}
              disabled={busyKey === 'brand-create'}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              购买订阅并创建品牌
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">品牌</th>
                <th className="py-2 pr-3">品牌主信息</th>
                <th className="py-2 pr-3">状态</th>
                <th className="py-2 pr-3">绑定 AMC Agent</th>
                <th className="py-2">动作项</th>
              </tr>
            </thead>
            <tbody>
              {data.brands.map((brand) => (
                <tr key={brand.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3">
                    <div className="space-y-2">
                      <input
                        value={brandDrafts[brand.id]?.name || brand.name}
                        onChange={(e) => setBrandDrafts((prev) => ({
                          ...prev,
                          [brand.id]: {
                            name: e.target.value,
                            location: prev[brand.id]?.location ?? brand.location ?? '',
                          },
                        }))}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-semibold"
                      />
                      <input
                        value={brandDrafts[brand.id]?.location || ''}
                        onChange={(e) => setBrandDrafts((prev) => ({
                          ...prev,
                          [brand.id]: {
                            name: prev[brand.id]?.name ?? brand.name,
                            location: e.target.value,
                          },
                        }))}
                        placeholder="品牌位置"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveBrandBase(brand.id)}
                          disabled={busyKey === `brand-save-${brand.id}`}
                          className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {busyKey === `brand-save-${brand.id}` ? '保存中...' : '保存品牌'}
                        </button>
                        <button
                          onClick={() => deleteBrand(brand.id, brand.name)}
                          disabled={busyKey === `brand-delete-${brand.id}`}
                          className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
                        >
                          删除品牌
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <div className="space-y-2">
                      {brand.owners.length === 0 ? (
                        <p className="text-xs text-slate-400">暂无品牌主</p>
                      ) : (
                        brand.owners.map((owner) => (
                          <div key={`${brand.id}-${owner.userId}`} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1">
                            <div>
                              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{owner.user.nickname || owner.user.email}</p>
                              <p className="text-[11px] text-slate-400">{owner.user.email}</p>
                            </div>
                            <button
                              onClick={() => removeBrandOwner(brand.id, owner.userId)}
                              disabled={busyKey === `owner-remove-${brand.id}-${owner.userId}`}
                              className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 disabled:opacity-50"
                            >
                              移除
                            </button>
                          </div>
                        ))
                      )}
                      <div className="flex gap-2">
                        <input
                          value={ownerInputs[brand.id] || ''}
                          onChange={(e) => setOwnerInputs((prev) => ({ ...prev, [brand.id]: e.target.value }))}
                          placeholder="owner 邮箱"
                          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => addBrandOwner(brand.id)}
                          disabled={busyKey === `owner-add-${brand.id}`}
                          className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
                        >
                          添加
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs">{brand.status}</td>
                  <td className="py-2 pr-3 align-top">
                    <div className="space-y-2">
                      {brand.brandAgents.length === 0 ? (
                        <p className="text-xs text-slate-400">未绑定</p>
                      ) : (
                        brand.brandAgents.map((link) => (
                          <div key={`${brand.id}-${link.agentId}`} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1">
                            <div>
                              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{link.agent.nickname || link.agent.email}</p>
                              <p className="text-[11px] text-slate-400">{link.agent.email}</p>
                            </div>
                            <button
                              onClick={() => removeBrandAgent(brand.id, link.agentId)}
                              disabled={busyKey === `agent-remove-${brand.id}-${link.agentId}`}
                              className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-300 disabled:opacity-50"
                            >
                              解绑
                            </button>
                          </div>
                        ))
                      )}
                      <div className="flex gap-2">
                        <select
                          value={agentSelections[brand.id] || ''}
                          onChange={(e) => setAgentSelections((prev) => ({ ...prev, [brand.id]: e.target.value }))}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                        >
                          <option value="">选择 AMC Agent</option>
                          {visibleAgentOptions.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.nickname || agent.email}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => addBrandAgent(brand.id)}
                          disabled={busyKey === `agent-add-${brand.id}`}
                          className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
                        >
                          绑定
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{brand._count.actionItems}</td>
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
