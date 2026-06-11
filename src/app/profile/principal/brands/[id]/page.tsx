'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Bot, CreditCard, ExternalLink, Save, Trash2, UserPlus } from 'lucide-react'

type Agent = {
  id: string
  email: string
  nickname: string | null
}

type BrandOwner = {
  userId: string
  role: string
  user: {
    id: string
    email: string
    nickname: string | null
  }
}

type BrandAgent = {
  agentId: string
  role: string
  agent: Agent
}

type Brand = {
  id: string
  name: string
  location: string | null
  status: string
  owners: BrandOwner[]
  brandAgents: BrandAgent[]
  _count: { actionItems: number; brandAgents: number }
}

type DashboardPayload = {
  viewerUserId: string
  dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
  userRoles?: string[]
  agents: Array<Agent & { isOnline: boolean; boundBrands: Array<{ id: string; name: string; role: string }> }>
  brands: Brand[]
}

export default function ManagePrincipalBrandPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const brandId = params?.id
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [agentId, setAgentId] = useState('')

  const brand = useMemo(() => data?.brands.find((item) => item.id === brandId) || null, [brandId, data?.brands])
  const canManageSubscription = useMemo(() => {
    if (!brand || !data?.viewerUserId) return false
    if (data.dashboardRole === 'ADMIN' || data.userRoles?.includes('ADMIN')) return true
    if (data.dashboardRole === 'BRAND_DIRECTOR' || data.userRoles?.includes('AMC_PRINCIPAL')) return true
    return brand.owners.some((owner) => owner.userId === data.viewerUserId)
  }, [brand, data])
  const currentOwner = brand?.owners[0]
  const availableAgents = useMemo(() => {
    const bound = new Set(brand?.brandAgents.map((link) => link.agentId) || [])
    return (data?.agents || []).filter((agent) => !bound.has(agent.id))
  }, [brand?.brandAgents, data?.agents])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/profile/principal-dashboard')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '加载品牌失败')
      setData(json)
      const nextBrand = (json as DashboardPayload).brands.find((item) => item.id === brandId)
      if (nextBrand) {
        setName(nextBrand.name)
        setLocation(nextBrand.location || '')
        setOwnerEmail(nextBrand.owners[0]?.user.email || '')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载品牌失败')
    } finally {
      setLoading(false)
    }
  }, [brandId])

  useEffect(() => {
    load()
  }, [load])

  const withBusy = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key)
    try {
      await action()
    } finally {
      setBusyKey(null)
    }
  }

  const saveBrand = async () => {
    const trimmedName = name.trim()
    if (!trimmedName || !brand) return
    await withBusy('save-brand', async () => {
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, location: location.trim() || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '保存品牌失败')
        return
      }
      await load()
    })
  }

  const replaceOwner = async () => {
    const email = ownerEmail.trim().toLowerCase()
    if (!email || !brand) return
    await withBusy('replace-owner', async () => {
      const res = await fetch(`/api/brands/${brand.id}/owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: 'owner' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '更换品牌主失败')
        return
      }

      const newOwnerId = String(json.userId || '')
      const oldOwners = brand.owners.filter((owner) => owner.userId !== newOwnerId)
      for (const owner of oldOwners) {
        await fetch(`/api/brands/${brand.id}/owners/${owner.userId}`, { method: 'DELETE' })
      }
      await load()
    })
  }

  const bindAgent = async () => {
    if (!agentId || !brand) return
    await withBusy('bind-agent', async () => {
      const res = await fetch(`/api/brands/${brand.id}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, role: 'worker' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '绑定 Agent 失败')
        return
      }
      setAgentId('')
      await load()
    })
  }

  const unbindAgent = async (targetAgentId: string) => {
    if (!brand) return
    await withBusy(`unbind-${targetAgentId}`, async () => {
      const res = await fetch(`/api/brands/${brand.id}/agents?agentId=${encodeURIComponent(targetAgentId)}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '解绑 Agent 失败')
        return
      }
      await load()
    })
  }

  const deleteBrand = async () => {
    if (!brand || !confirm(`确认删除品牌「${brand.name}」吗？`)) return
    await withBusy('delete-brand', async () => {
      const res = await fetch(`/api/brands/${brand.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '删除品牌失败')
        return
      }
      router.push('/profile/principal')
    })
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 text-slate-500">加载品牌中...</div>
  }

  if (error || !brand) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-5 text-rose-600 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-300">
          {error || '未找到品牌'}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <button
          onClick={() => router.push('/profile/principal')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> 返回主理人看板
        </button>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Manage Brand</p>
              <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">管理品牌</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{brand.status} · {brand._count.actionItems} 个动作项</p>
            </div>
            {canManageSubscription ? (
              <button
                onClick={() => router.push(`/board/subscription/${brand.id}`)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200"
              >
                <CreditCard className="h-4 w-4" /> 管理订阅计划
              </button>
            ) : (
              <div className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                <CreditCard className="h-4 w-4" /> 仅品牌主理人可管理订阅
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
            <h2 className="text-lg font-black">品牌信息</h2>
            <label className="block">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">品牌名</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">品牌位置</span>
              <input value={location} onChange={(event) => setLocation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            </label>
            <div className="flex flex-wrap gap-3">
              <button onClick={saveBrand} disabled={busyKey === 'save-brand'} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                <Save className="h-4 w-4" /> 保存品牌
              </button>
              <button onClick={deleteBrand} disabled={busyKey === 'delete-brand'} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> 删除品牌
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
            <h2 className="text-lg font-black">品牌主信息</h2>
            {currentOwner && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3">
                <p className="text-sm font-bold">{currentOwner.user.nickname || currentOwner.user.email}</p>
                <p className="text-xs text-slate-400">{currentOwner.user.email}</p>
              </div>
            )}
            <label className="block">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">更换品牌主邮箱</span>
              <input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            </label>
            <button onClick={replaceOwner} disabled={busyKey === 'replace-owner'} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              <UserPlus className="h-4 w-4" /> 保存品牌主
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
          <h2 className="text-lg font-black">绑定 AMC Agent</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {brand.brandAgents.map((link) => (
              <div key={link.agentId} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3">
                <button onClick={() => router.push(`/agents/${link.agentId}`)} className="min-w-0 text-left">
                  <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{link.agent.nickname || link.agent.email}</p>
                  <p className="truncate text-xs text-slate-400">{link.agent.email}</p>
                </button>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => router.push(`/agents/${link.agentId}`)} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-300" aria-label="打开 Agent 详情">
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button onClick={() => unbindAgent(link.agentId)} disabled={busyKey === `unbind-${link.agentId}`} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 hover:text-rose-600 dark:hover:text-rose-300 disabled:opacity-50" aria-label="解绑 Agent">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400">
              <option value="">选择 AMC Agent</option>
              {availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.nickname || agent.email}</option>
              ))}
            </select>
            <button onClick={bindAgent} disabled={!agentId || busyKey === 'bind-agent'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              <Bot className="h-4 w-4" /> 绑定 Agent
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}