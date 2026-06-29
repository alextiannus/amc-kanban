'use client'

import React from 'react'
import { Store, Save, RefreshCw, Users, Shield, MapPin, Tag } from 'lucide-react'
import { type UserRecord } from './UsersTab'

export interface BrandRecord {
  id: string
  name: string
  location: string | null
  timezone: string
  status: string
  autoPilot: boolean
  owners: { userId: string; role: string; user: { id: string; email: string; nickname: string | null } }[]
  brandAgents: { agentId: string; role: string; agent: { id: string; email: string; nickname: string | null } }[]
  subscriptions: { id: string; planId: string; planName: string; status: string; durationMonths: number; contractStartDate: string | null; contractEndDate: string | null; totalDueUsd: number }[]
  _count: { actionItems: number; contents: number }
  updatedAt: string
}

interface BrandsTabProps {
  brands: BrandRecord[]
  brandsLoading: boolean
  humans: UserRecord[]
  agents: UserRecord[]
  brandDrafts: Record<string, { name: string; location: string; status: string; ownerUserId: string; planId: string; subscriptionStatus: string; durationMonths: number; agentIds: string[] }>
  actionLoading: Record<string, string>
  onUpdateBrandDraft: (brandId: string, patch: any) => void
  onSaveBrandDraft: (brand: BrandRecord) => Promise<void>
  onFetchBrands: () => Promise<void>
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
  onFetchBrands
}: BrandsTabProps) {

  const formatBrandNames = (brandsList: { name: string }[], max = 3) => {
    if (brandsList.length === 0) return '暂无绑定品牌'
    const head = brandsList.slice(0, max).map((brand) => brand.name).join('、')
    return brandsList.length > max ? `${head} 等 ${brandsList.length} 个品牌` : head
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Store size={18} className="text-blue-500" /> 品牌配置与订阅管理
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            在此管理代运营商户的基本资料、所属业主 (Brand Owner)、签约代运营服务套餐与到期周期，以及分配负责该品牌的 AI 代理人。
          </p>
        </div>
        <button 
          onClick={onFetchBrands} 
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 transition-all cursor-pointer"
        >
          <RefreshCw size={13} className={brandsLoading ? 'animate-spin' : ''} />
          <span>刷新</span>
        </button>
      </div>

      {brandsLoading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-450 shadow-sm">
          <RefreshCw className="animate-spin inline-block mr-2 text-slate-450" size={18} />
          加载品牌数据中...
        </div>
      ) : brands.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-450 shadow-sm">
          暂无托管品牌记录
        </div>
      ) : (
        <div className="space-y-6">
          {brands.map((brand) => {
            const draft = brandDrafts[brand.id]
            const subscription = brand.subscriptions[0]
            const isSaving = !!actionLoading[brand.id + '_brand']

            return (
              <div 
                key={brand.id} 
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-5 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200"
              >
                {/* Brand Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-slate-850 dark:text-white leading-tight">{brand.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                        brand.status === 'ACTIVE' 
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border-emerald-100 dark:border-emerald-900/30'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}>
                        {brand.status}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                        {subscription?.planName || '未绑定计划'}
                      </span>
                      {brand.autoPilot && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                          🤖 自动驾驶中
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 font-medium">
                      <span className="flex items-center gap-1"><Users size={11} /> 业主邮箱: {brand.owners[0]?.user.email || '未指定'}</span>
                      <span className="flex items-center gap-1"><MapPin size={11} /> 物理位置: {brand.location || '未标注'}</span>
                      <span className="flex items-center gap-1"><Tag size={11} /> 待审核事项: {brand._count.actionItems} 个</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => onSaveBrandDraft(brand)} 
                    disabled={isSaving} 
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-650 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm flex-shrink-0 cursor-pointer self-start md:self-auto"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>{isSaving ? '保存中...' : '保存修改'}</span>
                  </button>
                </div>

                {/* Form fields */}
                {draft && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 pt-1">
                    <label className="space-y-1.5 lg:col-span-2 block">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">品牌名称</span>
                      <input 
                        type="text"
                        value={draft.name} 
                        onChange={e => onUpdateBrandDraft(brand.id, { name: e.target.value })} 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                    </label>
                    <label className="space-y-1.5 block">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">运行状态</span>
                      <select 
                        value={draft.status} 
                        onChange={e => onUpdateBrandDraft(brand.id, { status: e.target.value })} 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="ACTIVE">ACTIVE (活跃)</option>
                        <option value="PAUSED">PAUSED (暂停)</option>
                        <option value="ARCHIVED">ARCHIVED (归档)</option>
                      </select>
                    </label>
                    <label className="space-y-1.5 block">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">物理地点</span>
                      <input 
                        type="text"
                        value={draft.location} 
                        onChange={e => onUpdateBrandDraft(brand.id, { location: e.target.value })} 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                    </label>
                    
                    <label className="space-y-1.5 lg:col-span-2 block">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">主理人/业主 (Brand Owner)</span>
                      <select 
                        value={draft.ownerUserId} 
                        onChange={e => onUpdateBrandDraft(brand.id, { ownerUserId: e.target.value })} 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">未设置</option>
                        {humans.map((human) => (
                          <option key={human.id} value={human.id}>{human.nickname ? `${human.nickname} (${human.email})` : human.email}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5 block">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">服务套餐等级 (Plan)</span>
                      <select 
                        value={draft.planId} 
                        onChange={e => onUpdateBrandDraft(brand.id, { planId: e.target.value })} 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="starter">STARTER (自媒体基础)</option>
                        <option value="essential">ESSENTIAL (品牌建设)</option>
                        <option value="advanced">ADVANCED (旗舰代运营)</option>
                      </select>
                    </label>
                    <label className="space-y-1.5 block">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">订阅付款状态</span>
                      <select 
                        value={draft.subscriptionStatus} 
                        onChange={e => onUpdateBrandDraft(brand.id, { subscriptionStatus: e.target.value })} 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                        onChange={e => onUpdateBrandDraft(brand.id, { durationMonths: Number(e.target.value) })} 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value={3}>3 个月</option>
                        <option value={6}>6 个月</option>
                        <option value={12}>12 个月</option>
                      </select>
                    </label>
                  </div>
                )}

                {/* AI Agents binding */}
                {draft && (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/45 p-4 space-y-3">
                    <p className="text-xs font-black text-slate-700 dark:text-slate-350">🤖 分配运营该品牌的 AI 团队 (AI Agents)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {agents.length === 0 ? (
                        <p className="text-xs text-slate-400 py-2 col-span-full">暂无 AI Agents 可供绑定</p>
                      ) : (
                        agents.map((agent) => {
                          const isChecked = draft.agentIds.includes(agent.id)
                          return (
                            <label 
                              key={`${brand.id}-${agent.id}`} 
                              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-extrabold cursor-pointer transition-all bg-white dark:bg-slate-900 ${
                                isChecked 
                                  ? 'border-indigo-500 ring-1 ring-indigo-500/20 text-indigo-750 dark:text-indigo-300' 
                                  : 'border-slate-150 dark:border-slate-800 text-slate-650 dark:text-slate-405 hover:bg-slate-50/30'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  const nextAgentIds = isChecked
                                    ? draft.agentIds.filter(id => id !== agent.id)
                                    : [...draft.agentIds, agent.id]
                                  onUpdateBrandDraft(brand.id, { agentIds: nextAgentIds })
                                }}
                                className="rounded border-slate-350 text-indigo-650 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                              />
                              <span className="truncate">{agent.nickname || agent.email}</span>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
