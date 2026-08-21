'use client'

import React, { useState, useEffect } from 'react'
import { 
  Store, Save, RefreshCw, Users, Shield, MapPin, Tag, Cpu, Trash2, CreditCard, ToggleLeft, ToggleRight, Search, Plus, X, Calendar
} from 'lucide-react'
import { type UserRecord } from './UsersTab'
import { type AssignmentPoolConfig, type AssignmentPoolMember, type AssignmentDecision } from '@/components/shared/types'

export interface BrandRecord {
  id: string
  name: string
  location: string | null
  timezone: string
  status: string
  autoPilot: boolean
  owners: { userId: string; role: string; user: { id: string; email: string; nickname: string | null } }[]
  brandAgents: { agentId: string; role: string; agent: { id: string; email: string; nickname: string | null } }[]
  subscriptions: { id: string; planId: string; planName: string; status: string; durationMonths: number; contractStartDate: string | null; contractEndDate: string | null; trialEndsAt: string | null; billingStartsAt: string | null; feeWaived: boolean; totalDueUsd: number }[]
  _count: { actionItems: number; contents: number }
  updatedAt: string
}

interface BrandsTabProps {
  brands: BrandRecord[]
  brandsLoading: boolean
  humans: UserRecord[]
  agents: UserRecord[]
  brandDrafts: Record<string, { name: string; location: string; timezone: string; status: string; ownerUserId: string; planId: string; subscriptionStatus: string; durationMonths: number; feeWaived: boolean; agentIds: string[] }>
  actionLoading: Record<string, string>
  onUpdateBrandDraft: (brandId: string, patch: any) => void
  onSaveBrandDraft: (brand: BrandRecord) => Promise<void>
  onFetchBrands: () => Promise<void>
  onCreateBrand: (params: { brandName: string; ownerEmail: string; planId: string; durationMonths: number; location?: string; timezone?: string }) => Promise<{ ok: boolean; error?: string }>

  // Dispatch Pool props
  poolConfig: AssignmentPoolConfig | null
  poolMembers: AssignmentPoolMember[]
  poolDecisions: AssignmentDecision[]
  poolLoading: boolean
  onFetchPoolData: () => Promise<void>
  onFetchDecisionLogs: () => Promise<void>
  onPatchPoolMember: (member: AssignmentPoolMember, patch: Partial<AssignmentPoolMember>) => Promise<void>
  onDeletePoolMember: (member: AssignmentPoolMember) => Promise<void>
  onCreatePoolMember: (agent: any) => Promise<void>
}

export default function BrandsTab({
  brands,
  brandsLoading,
  humans,
  agents,
  brandDrafts,
  actionLoading,
  onUpdateBrandDraft,
  onSaveBrandDraft,
  onFetchBrands,
  onCreateBrand,
  poolConfig,
  poolMembers,
  poolDecisions,
  poolLoading,
  onFetchPoolData,
  onFetchDecisionLogs,
  onPatchPoolMember,
  onDeletePoolMember,
  onCreatePoolMember
}: BrandsTabProps) {
  const [subTab, setSubTab] = useState<'brands' | 'pool'>('brands')
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'FAILED' | 'CANCELLED'>('ALL')
  const [poolSearchTerm, setPoolSearchTerm] = useState('')
  const [selectedPrincipalToAdd, setSelectedPrincipalToAdd] = useState('')

  const filteredHumans = humans.filter((u) => {
    if (u.role === 'ADMIN') return true
    const roles = u.businessRoles?.map(r => r.role) || []
    if (roles.length === 0) return true
    const isOnlyBrandOwner = roles.every(r => r === 'BRAND_OWNER')
    return !isOnlyBrandOwner
  })

  const principals = humans.filter(u => u.businessRoles?.some(r => r.role === 'AMC_PRINCIPAL'))
  const existingPoolAgentIds = new Set(poolMembers.map(m => m.agentId))
  const principalsNotInPool = principals.filter(u => !existingPoolAgentIds.has(u.id))
  const filteredPrincipalsNotInPool = poolSearchTerm.trim()
    ? principalsNotInPool.filter(u =>
        u.email.toLowerCase().includes(poolSearchTerm.toLowerCase()) ||
        (u.nickname && u.nickname.toLowerCase().includes(poolSearchTerm.toLowerCase()))
      )
    : principalsNotInPool
  const [crewSearchTerms, setCrewSearchTerms] = useState<Record<string, string>>({})
  const [activeSearchBrandId, setActiveSearchBrandId] = useState<string | null>(null)
  const [isDeletingBrandId, setIsDeletingBrandId] = useState<string | null>(null)

  // ── New Brand Form ──────────────────────────────────────────────────────────
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newBrand, setNewBrand] = useState({
    brandName: '',
    ownerEmail: '',
    planId: 'essential',
    durationMonths: 12,
    location: '',
    timezone: 'Asia/Singapore',
  })

  const handleCreateBrand = async () => {
    if (!newBrand.brandName.trim()) { setCreateError('品牌名称不能为空'); return }
    if (!newBrand.ownerEmail.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newBrand.ownerEmail)) {
      setCreateError('请填写有效的品牌主邮件'); return
    }
    setIsCreating(true)
    setCreateError(null)
    const result = await onCreateBrand({
      brandName: newBrand.brandName.trim(),
      ownerEmail: newBrand.ownerEmail.trim().toLowerCase(),
      planId: newBrand.planId,
      durationMonths: newBrand.durationMonths,
      location: newBrand.location.trim() || undefined,
      timezone: newBrand.timezone,
    })
    setIsCreating(false)
    if (result.ok) {
      setShowCreateForm(false)
      setNewBrand({ brandName: '', ownerEmail: '', planId: 'essential', durationMonths: 12, location: '', timezone: 'Asia/Singapore' })
    } else {
      setCreateError(result.error || '创建失败，请重试')
    }
  }

  const handleDeleteBrand = async (brandId: string) => {
    if (!confirm('确定要删除这个品牌吗？该操作会将品牌逻辑归档 (Soft Delete)，不再在前台或看板列表中展示。')) {
      return
    }
    setIsDeletingBrandId(brandId)
    try {
      const res = await fetch(`/api/admin/brands/${brandId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await onFetchBrands()
      } else {
        const errData = await res.json()
        alert(errData.error || '删除品牌失败')
      }
    } catch (err) {
      console.error(err)
      alert('网络错误，删除失败')
    } finally {
      setIsDeletingBrandId(null)
    }
  }

  // Filter and Search Brands
  const filteredBrands = brands.filter((brand) => {
    const query = searchQuery.toLowerCase().trim()
    if (query) {
      const matchName = brand.name.toLowerCase().includes(query)
      const matchLoc = brand.location?.toLowerCase().includes(query)
      if (!matchName && !matchLoc) return false
    }
    if (statusFilter !== 'ALL') {
      const subStatus = brand.subscriptions[0]?.status || 'NO_SUB'
      if (subStatus !== statusFilter) return false
    }
    return true
  })

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

  const formatBrandNames = (brandsList: { name: string }[], max = 3) => {
    if (brandsList.length === 0) return '暂无绑定品牌'
    const head = brandsList.slice(0, max).map((brand) => brand.name).join('、')
    return brandsList.length > max ? `${head} 等 ${brandsList.length} 个品牌` : head
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Module Title */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Store size={18} className="text-blue-500" /> 托管品牌与智能派单中心
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            在此管理商户的代运营合同、绑定负责的 AI 员工，以及配置系统智能派单委派机制与负载监控。
          </p>
        </div>
        <button 
          onClick={async () => {
            if (subTab === 'brands') await onFetchBrands()
            else await onFetchPoolData()
          }} 
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-slate-55 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 transition-all cursor-pointer"
        >
          <RefreshCw size={13} className={(brandsLoading || poolLoading) ? 'animate-spin' : ''} />
          <span>刷新数据</span>
        </button>
      </div>

      {/* Sub-tab Switcher Segment */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        <button
          onClick={() => setSubTab('brands')}
          className={`px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            subTab === 'brands'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-850 dark:hover:text-slate-200'
          }`}
        >
          <Store size={14} />
          <span>托管品牌与套餐订阅 ({brands.length})</span>
        </button>
        <button
          onClick={() => setSubTab('pool')}
          className={`px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            subTab === 'pool'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-850 dark:hover:text-slate-200'
          }`}
        >
          <Cpu size={14} />
          <span>智能分派池与负载监控</span>
        </button>
      </div>

      {/* Tab 1: Brands Management */}
      {subTab === 'brands' && (
        <div className="space-y-4">
          {/* Top Search & Filter Bar */}
          <div className="admin-toolbar flex-col sm:flex-row sm:justify-between">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-2xl">
              {/* Search Box */}
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="搜索品牌名称、物理地点..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="admin-input pl-9"
                />
                <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-xl p-0.5 bg-slate-50 dark:bg-slate-955">
                {(['ALL', 'ACTIVE', 'PENDING', 'FAILED', 'CANCELLED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-[10.5px] font-black transition-all cursor-pointer ${
                      statusFilter === status
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-405 shadow-sm border border-slate-200/50 dark:border-slate-800'
                        : 'text-slate-500 hover:text-slate-850 dark:hover:text-slate-200'
                    }`}
                  >
                    {status === 'ALL' ? '全部状态' : status}
                  </button>
                ))}
              </div>
            </div>
            {/* + New Brand Button */}
            <button
              id="admin-create-brand-btn"
              onClick={() => { setShowCreateForm(true); setCreateError(null) }}
              className="admin-primary-button shrink-0"
            >
              <Plus size={13} />
              <span>新建品牌</span>
            </button>
          </div>

          {brandsLoading ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-450 shadow-sm animate-pulse">
              加载品牌数据中...
            </div>
          ) : filteredBrands.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-450 shadow-sm">
              暂无托管品牌记录
            </div>
          ) : (
            <div className="admin-list">
              <table className="w-full min-w-[1240px] table-fixed text-xs">
                <colgroup>
                  <col className="w-[360px]" />
                  <col className="w-[140px]" />
                  <col className="w-[120px]" />
                  <col className="w-[180px]" />
                  <col className="w-[260px]" />
                  <col className="w-[180px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="text-left px-5 py-4">品牌名称</th>
                    <th className="text-left px-5 py-4">订阅套餐</th>
                    <th className="text-left px-5 py-4">状态</th>
                    <th className="text-left px-5 py-4">过期日期</th>
                    <th className="text-left px-5 py-4">团队成员</th>
                    <th className="text-left px-5 py-4">物理位置</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBrands.map((brand) => {
                    const subscription = brand.subscriptions[0]
                    const planLabel = subscription?.planId
                      ? subscription.planId.charAt(0).toUpperCase() + subscription.planId.slice(1).toLowerCase()
                      : '未绑定'
                    const status = subscription?.status || '无订阅'
                    
                    const endDate = subscription?.contractEndDate
                    const formattedDate = endDate ? new Date(endDate).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '无'
                    const isExpired = endDate ? new Date(endDate) < new Date() : false

                    return (
                      <tr 
                        key={brand.id}
                        onClick={() => setEditingBrandId(brand.id)}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-850/40 cursor-pointer transition-all select-none"
                      >
                        <td className="px-5 py-4 font-black">
                          <div className="flex items-center gap-3">
                            <div className="w-8.5 h-8.5 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-center font-black text-xs shrink-0">
                              {brand.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className="text-slate-900 dark:text-white block truncate font-black text-sm">{brand.name}</span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono font-medium block mt-0.5 truncate">{brand.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-[10px] font-bold bg-indigo-50 dark:bg-indigo-955/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/30">
                            {planLabel}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-[10px] font-black border ${
                            status === 'ACTIVE'
                              ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100/50 dark:border-emerald-900/30'
                              : status === 'PENDING'
                              ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-100/50 dark:border-amber-900/30'
                              : status === 'FAILED'
                              ? 'bg-rose-50 dark:bg-rose-955/20 text-rose-600 dark:text-rose-400 border-rose-100/50 dark:border-rose-900/30'
                              : 'bg-slate-100 dark:bg-slate-805 text-slate-500 border-slate-205/50 dark:border-slate-800'
                          }`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`font-semibold inline-flex items-center gap-1 ${isExpired ? 'text-rose-605 dark:text-rose-400 font-bold' : 'text-slate-650 dark:text-slate-300'}`}>
                            <Calendar size={12} className="text-slate-400 shrink-0" />
                            {formattedDate} {isExpired && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-955/30 border border-rose-100 dark:border-rose-900/30 ml-1">已过期</span>}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                            {brand.owners.map((o) => (
                              <span key={o.userId} className="admin-badge admin-badge-blue">
                                {o.user.nickname || o.user.email.split('@')[0]}
                              </span>
                            ))}
                            {brand.brandAgents.map((a) => (
                              <span key={a.agentId} className="admin-badge admin-badge-indigo">
                                {a.agent.nickname || a.agent.email.split('@')[0]}
                              </span>
                            ))}
                            {brand.owners.length === 0 && brand.brandAgents.length === 0 && (
                              <span className="text-slate-400 dark:text-slate-500 font-medium">暂无绑定成员</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex max-w-full items-center gap-1 text-slate-650 dark:text-slate-350 font-medium">
                              <MapPin size={12} className="shrink-0 text-slate-400" />
                              <span className="truncate">{brand.location || '未标注'}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider pl-4">
                              {brand.timezone}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Create New Brand Modal */}
          {showCreateForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200 flex flex-col">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Plus size={15} className="text-indigo-500" />
                      新建品牌 &amp; 开通服务计划
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">创建成功后品牌即激活，系统自动从分配池指派主理人</p>
                  </div>
                  <button onClick={() => setShowCreateForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
                    <X size={16} />
                  </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4 overflow-y-auto">
                  {/* Brand Name */}
                  <div>
                    <label className="block text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      品牌名称 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="例：Cheshi Hotpot"
                      value={newBrand.brandName}
                      onChange={e => setNewBrand(p => ({ ...p, brandName: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Owner Email */}
                  <div>
                    <label className="block text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      品牌主邮件 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="brandowner@example.com"
                      value={newBrand.ownerEmail}
                      onChange={e => setNewBrand(p => ({ ...p, ownerEmail: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">系统将自动查找或创建该邮件对应的品牌主账号</p>
                  </div>

                  {/* Plan + Duration Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                        服务套餐 <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={newBrand.planId}
                        onChange={e => setNewBrand(p => ({ ...p, planId: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="starter">ESSENTIAL（基础线上经营）</option>
                        <option value="essential">BOOSTER（增长战役）</option>
                        <option value="advanced">ADVANCED（全域增长）</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                        合同周期 <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={newBrand.durationMonths}
                        onChange={e => setNewBrand(p => ({ ...p, durationMonths: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value={3}>3 个月</option>
                        <option value={6}>6 个月</option>
                        <option value={12}>12 个月</option>
                      </select>
                    </div>
                  </div>

                  {/* Location */}
                  <div>
                    <label className="block text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      物理位置（可选）
                    </label>
                    <input
                      type="text"
                      placeholder="例：Singapore / 新加坡"
                      value={newBrand.location}
                      onChange={e => setNewBrand(p => ({ ...p, location: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Timezone */}
                  <div>
                    <label className="block text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      时区
                    </label>
                    <select
                      value={newBrand.timezone}
                      onChange={e => setNewBrand(p => ({ ...p, timezone: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Asia/Singapore">新加坡/北京时间 (Asia/Singapore - UTC+8)</option>
                      <option value="America/New_York">美东时间 (America/New_York - UTC-5/UTC-4)</option>
                      <option value="America/Los_Angeles">美西时间 (America/Los_Angeles - UTC-8/UTC-7)</option>
                      <option value="Europe/London">伦敦时间 (Europe/London - UTC+0/UTC+1)</option>
                      <option value="Australia/Sydney">悉尼时间 (Australia/Sydney - UTC+10/UTC+11)</option>
                    </select>
                  </div>

                  {/* Error */}
                  {createError && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold">
                      ⚠️ {createError}
                    </div>
                  )}

                  {/* Info note */}
                  <div className="px-3.5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[11px]">
                    <span className="font-black">注意</span>：创建完成后订阅状态立即激活（ACTIVE）。主理人分配失败不影响品牌创建，可事后在 AMC Crew 中手动添加成员。
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs cursor-pointer transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateBrand}
                    disabled={isCreating}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm cursor-pointer"
                  >
                    {isCreating ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 创建中...</>
                    ) : (
                      <><Save className="w-3.5 h-3.5" /> 确认创建</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Brand Modal Dialog */}

          {(() => {
            const editingBrand = brands.find(b => b.id === editingBrandId)
            if (!editingBrand) return null

            const draft = brandDrafts[editingBrand.id]
            if (!draft) return null

            const subscription = editingBrand.subscriptions[0]
            const isSaving = !!actionLoading[editingBrand.id + '_brand']

            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                  {/* Modal Header */}
                  <div className="px-6 py-5 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-black text-slate-850 dark:text-white leading-tight truncate">
                          编辑品牌: {editingBrand.name}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                          draft.subscriptionStatus === 'ACTIVE' 
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border-emerald-100 dark:border-emerald-900/30'
                            : draft.subscriptionStatus === 'PENDING'
                            ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-455 border-amber-100 dark:border-amber-900/30'
                            : draft.subscriptionStatus === 'FAILED'
                            ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-455 border-rose-100 dark:border-rose-900/30'
                            : 'bg-slate-100 dark:bg-slate-805 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}>
                          {draft.subscriptionStatus}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                          {draft.planId?.toUpperCase() || '未绑定计划'}
                        </span>
                        {editingBrand.autoPilot && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50/50 dark:bg-blue-955/20 text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/30">
                            🤖 自动驾驶中
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1"><MapPin size={11} /> 物理位置: {editingBrand.location || '未标注'}</span>
                        <span className="flex items-center gap-1"><Tag size={11} /> 待审核事项: {editingBrand._count.actionItems} 个</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setEditingBrandId(null)}
                      className="p-1 rounded-lg text-slate-405 hover:text-slate-850 dark:hover:text-slate-200 transition-all cursor-pointer font-bold"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
                    {/* Section 1: Brand Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl border border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-955/5">
                      <div className="md:col-span-2 pb-1 border-b border-slate-100 dark:border-slate-800/60">
                        <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-widest block">🏷️ 品牌基础资产设置</span>
                      </div>
                      <label className="space-y-1.5 block">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">品牌名称</span>
                        <input 
                          type="text"
                          value={draft.name} 
                          onChange={e => onUpdateBrandDraft(editingBrand.id, { name: e.target.value })} 
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                        />
                      </label>
                      <label className="space-y-1.5 block">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">物理地点</span>
                        <input 
                          type="text"
                          value={draft.location} 
                          onChange={e => onUpdateBrandDraft(editingBrand.id, { location: e.target.value })} 
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                        />
                      </label>
                      <label className="space-y-1.5 block">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">时区 (Timezone)</span>
                        <select 
                          value={draft.timezone} 
                          onChange={e => onUpdateBrandDraft(editingBrand.id, { timezone: e.target.value })} 
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                        >
                          <option value="Asia/Singapore">新加坡/北京时间 (Asia/Singapore - UTC+8)</option>
                          <option value="America/New_York">美东时间 (America/New_York - UTC-5/UTC-4)</option>
                          <option value="America/Los_Angeles">美西时间 (America/Los_Angeles - UTC-8/UTC-7)</option>
                          <option value="Europe/London">伦敦时间 (Europe/London - UTC+0/UTC+1)</option>
                          <option value="Australia/Sydney">悉尼时间 (Australia/Sydney - UTC+10/UTC+11)</option>
                        </select>
                      </label>
                    </div>

                    {/* Section 2: Billing & Subscriptions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl border border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-955/5">
                      <div className="md:col-span-2 pb-1 border-b border-slate-100 dark:border-slate-800/60">
                        <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-widest block">💳 商业授权与订阅 (Billing & Subscriptions)</span>
                      </div>
                      <label className="space-y-1.5 block">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">主理人/业主 (Brand Owner)</span>
                        <select 
                          value={draft.ownerUserId} 
                          onChange={e => onUpdateBrandDraft(editingBrand.id, { ownerUserId: e.target.value })} 
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">未设置</option>
                          <optgroup label="人类主理人 (Humans)">
                            {humans.map((human) => (
                              <option key={human.id} value={human.id}>
                                {human.nickname ? `${human.nickname} (${human.email})` : human.email}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="AI 智能体 (AI Agents)">
                            {agents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                🤖 {agent.nickname || agent.email}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </label>
                      <label className="space-y-1.5 block">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">服务套餐等级 (Plan)</span>
                        <select 
                          value={draft.planId} 
                          onChange={e => onUpdateBrandDraft(editingBrand.id, { planId: e.target.value })} 
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="starter">ESSENTIAL (基础线上经营)</option>
                          <option value="essential">BOOSTER (增长战役)</option>
                          <option value="advanced">ADVANCED (旗舰代运营)</option>
                        </select>
                      </label>
                      <label className="space-y-1.5 block">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">订阅付款状态</span>
                        <select 
                          value={draft.subscriptionStatus} 
                          onChange={e => onUpdateBrandDraft(editingBrand.id, { subscriptionStatus: e.target.value })} 
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="ACTIVE">ACTIVE (正常履约中)</option>
                          <option value="PENDING">PENDING (待确认账单)</option>
                          <option value="FAILED">FAILED (扣款失败)</option>
                          <option value="CANCELLED">CANCELLED (已退订)</option>
                        </select>
                      </label>
                      <label className="space-y-1.5 block">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">签约合同周期</span>
                        <select 
                          value={draft.durationMonths} 
                          onChange={e => onUpdateBrandDraft(editingBrand.id, { durationMonths: Number(e.target.value) })} 
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value={3}>3 个月</option>
                          <option value={6}>6 个月</option>
                          <option value={12}>12 个月</option>
                        </select>
                      </label>
                      <div className="md:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 px-3.5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-750 dark:text-slate-250">无需支付订阅费计划</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            开启后该订阅不计算收费开始日；关闭时 ACTIVE 订阅默认保留 7 天免费试用。
                          </p>
                          {subscription && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              {subscription.feeWaived
                                ? '当前：免订阅费'
                                : `当前收费开始：${subscription.billingStartsAt ? new Date(subscription.billingStartsAt).toLocaleDateString('zh-CN') : '待激活后生成'}`}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onUpdateBrandDraft(editingBrand.id, { feeWaived: !draft.feeWaived })}
                          className="flex items-center gap-1.5 focus:outline-none shrink-0"
                        >
                          {draft.feeWaived ? (
                            <ToggleRight className="w-8 h-8 text-emerald-600 cursor-pointer" />
                          ) : (
                            <ToggleLeft className="w-8 h-8 text-slate-400 cursor-pointer" />
                          )}
                          <span className="text-xs font-semibold text-slate-650 dark:text-slate-350">{draft.feeWaived ? '已免订阅费' : '正常收费'}</span>
                        </button>
                      </div>
                    </div>

                    {/* AI Agents binding */}
                    {(() => {
                      const eligibleCrewMembers = [
                        ...filteredHumans.map(u => ({
                          id: u.id,
                          name: u.nickname ? `${u.nickname} (${u.email})` : u.email,
                          isAi: false
                        })),
                        ...agents.map(a => ({
                          id: a.id,
                          name: a.nickname || a.email,
                          isAi: true
                        }))
                      ]

                      const selectedMembers = eligibleCrewMembers.filter(member => draft.agentIds.includes(member.id))
                      const searchTerm = crewSearchTerms[editingBrand.id] || ''
                      const availableMembers = eligibleCrewMembers.filter(member => {
                        const isSelected = draft.agentIds.includes(member.id)
                        if (isSelected) return false
                        if (!searchTerm) return true
                        return member.name.toLowerCase().includes(searchTerm.toLowerCase())
                      })

                      return (
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-55 dark:bg-slate-955/20 p-5 space-y-4">
                          <p className="text-xs font-black text-slate-700 dark:text-slate-350 flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <span>🤖 AI Marketing Crew</span>
                            <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">(包含人类主理人与 AI 智能体)</span>
                          </p>

                          {/* Badges List of currently selected members */}
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">已分配团队成员 ({selectedMembers.length})</span>
                            {selectedMembers.length === 0 ? (
                              <div className="text-xs text-slate-400 py-3 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center font-medium bg-white dark:bg-slate-900">
                                当前暂无分配 of Crew 成员，请在下方搜索添加
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2 p-2 bg-slate-55 dark:bg-slate-955 rounded-xl border border-slate-200/40 dark:border-slate-800/40 min-h-[42px]">
                                {selectedMembers.map((member) => (
                                  <div 
                                    key={`selected-${editingBrand.id}-${member.id}`} 
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl text-xs font-black text-slate-850 dark:text-slate-250 shadow-sm animate-in zoom-in-95 duration-150"
                                  >
                                    <span>{member.isAi ? '🤖' : '👤'}</span>
                                    <span className="max-w-[150px] truncate">{member.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextAgentIds = draft.agentIds.filter(id => id !== member.id)
                                        onUpdateBrandDraft(editingBrand.id, { agentIds: nextAgentIds })
                                      }}
                                      className="text-slate-405 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/20 p-0.5 rounded transition-all cursor-pointer font-bold ml-1"
                                      title="移出团队"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Search Selector Box */}
                          <div className="space-y-1.5 relative">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">添加成员至 Crew (搜索人类/AI)</span>
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="输入姓名、邮箱或 Agent 名字以搜索添加成员..."
                                value={searchTerm}
                                onFocus={() => setActiveSearchBrandId(editingBrand.id)}
                                onChange={e => setCrewSearchTerms(prev => ({ ...prev, [editingBrand.id]: e.target.value }))}
                                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 px-3.5 py-2.5 pl-9 text-xs text-slate-850 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>

                            {/* Search Dropdown list */}
                            {activeSearchBrandId === editingBrand.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setActiveSearchBrandId(null)} />
                                <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-20 divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in slide-in-from-top-1 duration-100">
                                  {availableMembers.length === 0 ? (
                                    <div className="p-3.5 text-center text-xs text-slate-455 font-medium bg-slate-55 dark:bg-slate-955/10">无匹配的候选成员（或已被全部添加）</div>
                                  ) : (
                                    availableMembers.map(member => (
                                      <div
                                        key={`avail-${editingBrand.id}-${member.id}`}
                                        onClick={() => {
                                          const nextAgentIds = [...draft.agentIds, member.id]
                                          onUpdateBrandDraft(editingBrand.id, { agentIds: nextAgentIds })
                                          setCrewSearchTerms(prev => ({ ...prev, [editingBrand.id]: '' }))
                                          setActiveSearchBrandId(null)
                                        }}
                                        className="flex items-center justify-between px-4 py-2.5 text-xs text-slate-750 dark:text-slate-350 hover:bg-indigo-50/40 dark:hover:bg-slate-850 cursor-pointer transition-colors"
                                      >
                                        <span className="flex items-center gap-2">
                                          <span>{member.isAi ? '🤖' : '👤'}</span>
                                          <span className="font-extrabold">{member.name}</span>
                                          {member.isAi && (
                                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-955/25 text-[9px] font-black text-indigo-650 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-800/30">AI Agent</span>
                                          )}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-bold hover:text-indigo-650">+ 添加成员</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Modal Footer */}
                  <div className="px-6 py-4 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between flex-shrink-0">
                    {/* Delete Brand Button */}
                    {(() => {
                      const hasActiveSub = editingBrand.subscriptions && editingBrand.subscriptions.length > 0 && editingBrand.subscriptions[0].status === 'ACTIVE'
                      const isDeleting = isDeletingBrandId === editingBrand.id
                      return (
                        <button
                          type="button"
                          onClick={() => handleDeleteBrand(editingBrand.id)}
                          disabled={hasActiveSub || isDeleting}
                          className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-extrabold text-xs transition-all shadow-sm ${
                            hasActiveSub
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-800 cursor-not-allowed'
                              : 'bg-rose-50/20 border border-rose-250 dark:border-rose-900/30 text-rose-650 dark:text-rose-455 hover:bg-rose-50 dark:hover:bg-rose-955/20 cursor-pointer'
                          }`}
                          title={hasActiveSub ? "正常签约中 (ACTIVE) 的品牌无法删除。请先修改订阅状态为 CANCELLED 之后再操作。" : "删除品牌 (Soft Delete)"}
                        >
                          {isDeleting ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          <span>删除品牌</span>
                        </button>
                      )
                    })()}

                    {/* Action buttons */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingBrandId(null)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs cursor-pointer transition-colors"
                      >
                        取消
                      </button>
                      <button 
                        type="button"
                        onClick={async () => {
                          await onSaveBrandDraft(editingBrand)
                          setEditingBrandId(null)
                        }} 
                        disabled={isSaving} 
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-650 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm cursor-pointer"
                      >
                        {isSaving ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>{isSaving ? '保存中...' : '保存修改'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Tab 2: AI Dispatch Pool Settings */}
      {subTab === 'pool' && (
        <div className="space-y-6">
          {poolConfig && (
            /* Global Dispatch Rules Config */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${activeConfig.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">自动排期分派池全局配置</h3>
                </div>

                <button 
                  onClick={handleSaveConfig} 
                  disabled={savingConfig || Object.keys(configDraft).length === 0}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-blue-650 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm cursor-pointer"
                >
                  <Save size={12} />
                  <span>保存路由配置</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">自动分派开关</span>
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
                    <span className="text-xs font-semibold text-slate-650 dark:text-slate-350">{activeConfig.enabled ? '自动分派中' : '分派暂停'}</span>
                  </button>
                </div>

                <label className="space-y-1.5 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">派单标签次序</span>
                  <select 
                    value={activeConfig.matchingOrder} 
                    onChange={e => handleUpdateConfig({ matchingOrder: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="industry_first">行业背景优先 (Industry)</option>
                    <option value="region_first">运营地区优先 (Region)</option>
                  </select>
                </label>

                <label className="space-y-1.5 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">负荷溢出策略</span>
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
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">备用兜底主理人 (Fallback)</span>
                  <select 
                    value={activeConfig.fallbackAgentId || ''} 
                    onChange={e => handleUpdateConfig({ fallbackAgentId: e.target.value || null })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">未指定 (退回报错)</option>
                    {principals.map(u => (
                      <option key={u.id} value={u.id}>{u.nickname || u.email}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* Member Load Cards */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">派单池主理人成员实时负荷监控</h3>
              <span className="text-xs text-slate-400 font-bold">在线主理人: {poolMembers.filter(m => m.active).length} / 共 {poolMembers.length}</span>
            </div>

            {/* Search and Add Principal Form */}
            <div className="flex flex-col md:flex-row items-end gap-3 bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-150 dark:border-slate-800">
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">筛选主理人昵称/邮箱</span>
                  <input
                    type="text"
                    placeholder="输入主理人邮箱或昵称筛选..."
                    value={poolSearchTerm}
                    onChange={e => setPoolSearchTerm(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">选择 AMC 主理人</span>
                  <select
                    value={selectedPrincipalToAdd}
                    onChange={e => setSelectedPrincipalToAdd(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">-- 请选择一位待分配主理人 --</option>
                    {filteredPrincipalsNotInPool.map(u => (
                      <option key={u.id} value={u.id}>{u.nickname || u.email} ({u.email})</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                disabled={!selectedPrincipalToAdd}
                onClick={async () => {
                  const targetUser = principalsNotInPool.find(u => u.id === selectedPrincipalToAdd)
                  if (targetUser) {
                    await onCreatePoolMember(targetUser)
                    setSelectedPrincipalToAdd('')
                    setPoolSearchTerm('')
                  }
                }}
                className="w-full md:w-auto px-4 py-2 rounded-xl bg-indigo-650 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5 h-[36px]"
              >
                <Plus size={14} />
                <span>加入分配池</span>
              </button>
            </div>

            {poolMembers.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">暂无分派池内主理人成员</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {poolMembers.map((m) => {
                  const usagePercent = Math.min(100, Math.round((m.currentLoad / (m.capacity || 30)) * 100))
                  const isOverloaded = m.overloaded || m.currentLoad >= m.capacity

                  return (
                    <div 
                      key={m.agentId} 
                      className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 bg-slate-50/50 dark:bg-slate-955/10 ${
                        m.active ? 'border-slate-200 dark:border-slate-800' : 'border-slate-150/60 dark:border-slate-850 opacity-60'
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
                          />
                          <button 
                            onClick={() => onDeletePoolMember(m)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/20 transition-all cursor-pointer"
                            title="移出派单池"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Load progress bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-450">
                          <span>实时承接商户负载</span>
                          <span className={isOverloaded ? 'text-rose-500 font-black' : 'text-slate-650'}>
                            {m.currentLoad} / {m.capacity} ({usagePercent}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              isOverloaded ? 'bg-rose-500' : usagePercent > 80 ? 'bg-amber-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${usagePercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 text-[9px] text-slate-400 font-bold">
                        {m.industries.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/50">💼 {tag}</span>
                        ))}
                        {m.regions.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 rounded bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100/50">📍 {tag}</span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Routing audit logs */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard size={15} className="text-slate-550" />
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">自动分派决策审计日志</h3>
              </div>
              <button 
                onClick={onFetchDecisionLogs}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-350 bg-slate-50 hover:bg-slate-100 dark:bg-slate-805 dark:hover:bg-slate-750 transition-all cursor-pointer"
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
                    <th className="text-left px-4 py-3">分派类型</th>
                    <th className="text-left px-4 py-3">商户主键</th>
                    <th className="text-left px-4 py-3">命中 AI 员工</th>
                    <th className="text-left px-4 py-3">匹配策略</th>
                    <th className="text-left px-4 py-3">命中详情原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-300">
                  {poolDecisions.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-2.5 font-black">{log.subjectType}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-400">{log.subjectId}</td>
                      <td className="px-4 py-2.5 font-semibold">
                        {log.selectedAgentId ? (
                          <span className="font-mono text-indigo-650 dark:text-indigo-400">{log.selectedAgentId}</span>
                        ) : (
                          <span className="text-slate-400">(none)</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {log.matchedBy ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-955/20 text-blue-650 dark:text-blue-400 border border-blue-100/50 font-bold">{log.matchedBy}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 leading-relaxed text-slate-450">{log.reason || '-'}</td>
                    </tr>
                  ))}
                  {poolDecisions.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-400" colSpan={6}>暂无派单日志记录</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
