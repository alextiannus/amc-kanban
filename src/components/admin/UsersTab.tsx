'use client'

import React, { useState } from 'react'
import {
  User, Shield, Store, Users, Edit3, RefreshCw, Trash2, Check, Copy, Plus, Search
} from 'lucide-react'

export interface UserRecord {
  id: string
  email: string
  nickname: string | null
  type: 'HUMAN' | 'AI_AGENT'
  role: 'ADMIN' | 'USER'
  insights?: string | null
  introduction?: string | null
  workflow?: string | null
  themeColor?: string | null
  chatLink?: string | null
  driveFolder?: string | null
  createdAt: string
  businessRoles?: { role: string }[]
  brandMemberships: { brand: { id: string; name: string; status: string } }[]
  ownedBrands: { brand: { id: string; name: string; status: string } }[]
  legacyOwnedBrands: { brand: { id: string; name: string; status: string } }[]
  permittedAgents: { agent: { id: string; email: string; nickname: string | null; brandMemberships: { brand: { id: string; name: string; status: string } }[] } }[]
  assignedToHumans: { human: { id: string; email: string; nickname: string | null } }[]
}

interface UsersTabProps {
  users: UserRecord[]
  loading: boolean
  creating: boolean
  actionLoading: Record<string, string>
  onCreateUser: (email: string, type: string, role: string) => Promise<void>
  onRoleToggle: (user: UserRecord) => Promise<void>
  onToggleBusinessRole: (user: UserRecord, roleName: 'BRAND_OWNER' | 'AMC_PRINCIPAL') => void
  onResetPassword: (user: UserRecord) => Promise<void>
  onDeleteUser: (user: UserRecord) => Promise<void>
  onEditUser: (user: { id: string; email: string; nickname: string | null; role: string; type: string }) => void
  allAgents: UserRecord[]
  onSavePermissions: (humanId: string, agentIds: string[]) => Promise<void>
  savingPerms: boolean
}

export default function UsersTab({
  users,
  loading,
  creating,
  actionLoading,
  onCreateUser,
  onRoleToggle,
  onToggleBusinessRole,
  onResetPassword,
  onDeleteUser,
  onEditUser,
  allAgents,
  onSavePermissions,
  savingPerms
}: UsersTabProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [email, setEmail] = useState('')
  const [type, setType] = useState('HUMAN')
  const [role, setRole] = useState('USER')
  
  // Permissions Modal state
  const [selectedHuman, setSelectedHuman] = useState<UserRecord | null>(null)
  const [assignedAgentIds, setAssignedAgentIds] = useState<string[]>([])

  const humans = users.filter(u => u.type === 'HUMAN')
  
  const filteredHumans = humans.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.nickname && u.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const uniqueBrandsFromPermittedAgents = (links: UserRecord['permittedAgents']) => {
    const map = new Map<string, { id: string; name: string; status: string }>()
    for (const link of links) {
      for (const brandLink of link.agent.brandMemberships || []) {
        map.set(brandLink.brand.id, brandLink.brand)
      }
    }
    return Array.from(map.values())
  }

  const uniqueBrandsFromOwnerLinks = (links: Array<{ brand: { id: string; name: string; status: string } }> = []) => {
    const map = new Map<string, { id: string; name: string; status: string }>()
    for (const link of links) map.set(link.brand.id, link.brand)
    return Array.from(map.values())
  }

  const formatBrandNames = (brands: { name: string }[], max = 3) => {
    if (brands.length === 0) return '暂无绑定品牌'
    const head = brands.slice(0, max).map((brand) => brand.name).join('、')
    return brands.length > max ? `${head} 等 ${brands.length} 个品牌` : head
  }

  const UserClassificationBadges = ({ user }: { user: UserRecord }) => {
    const explicitRoles = new Set((user.businessRoles || []).map((role) => role.role))
    const isPrincipal = user.type === 'HUMAN' && (explicitRoles.has('AMC_PRINCIPAL') || user.permittedAgents.length > 0)
    const isBrandOwner = user.type === 'HUMAN' && (explicitRoles.has('BRAND_OWNER') || uniqueBrandsFromOwnerLinks([...(user.ownedBrands || []), ...(user.legacyOwnedBrands || [])]).length > 0)
    
    return (
      <div className="flex flex-wrap gap-1">
        {user.role === 'ADMIN' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-650 dark:text-indigo-455 border border-indigo-100 dark:border-indigo-800/50">
            <Shield size={10} /> System Admin
          </span>
        )}
        {isBrandOwner && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-450 border border-blue-100 dark:border-blue-800/50">
            <Store size={10} /> Brand Owner
          </span>
        )}
        {isPrincipal && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-605 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-800/50">
            <Users size={10} /> AMC Principal
          </span>
        )}
        {user.role !== 'ADMIN' && !isBrandOwner && !isPrincipal && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-105 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/40 dark:border-slate-700/40">
            <User size={10} /> Standard User
          </span>
        )}
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    await onCreateUser(email, type, role)
    setEmail('')
  }

  const handleOpenPermissions = (user: UserRecord) => {
    setSelectedHuman(user)
    setAssignedAgentIds(user.permittedAgents.map(pa => pa.agent.id))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
      {/* Left: Create Form */}
      <div className="lg:col-span-1">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm sticky top-6">
          <h2 className="text-sm font-black text-slate-850 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Plus size={16} className="text-blue-500" /> 新建用户
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">账号类型</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="HUMAN">人类用户</option>
                <option value="AI_AGENT">AI Agent</option>
              </select>
            </div>
            {type === 'HUMAN' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">人类账号角色</label>
                <select value={role} onChange={e => setRole(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option value="USER">USER（无系统管理权限）</option>
                  <option value="ADMIN">ADMIN（System Admin 权限）</option>
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">邮箱地址</label>
              <input 
                type="email" 
                required 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="user@example.com" 
                className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
              />
            </div>
            <button type="submit" disabled={creating} className="w-full bg-blue-650 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm">
              {creating ? '创建中...' : '创建并生成邀请链接'}
            </button>
          </form>
        </div>
      </div>

      {/* Right: User Lists */}
      <div className="lg:col-span-2 space-y-4">
        {/* Search Header */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索用户邮箱或昵称..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm rounded-xl pl-9 pr-4 py-2 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
            />
          </div>
          <span className="text-xs text-slate-400 font-bold flex-shrink-0">
            共 {humans.length} 人
          </span>
        </div>

        {/* User Card List */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-900/50">
            <User size={15} className="text-slate-500" />
            <span className="text-sm font-black text-slate-800 dark:text-slate-100">人类用户列表</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-450">
              <RefreshCw className="animate-spin inline-block mr-2 text-slate-400" size={16} />
              加载用户列表中...
            </div>
          ) : filteredHumans.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-450">
              没有找到符合条件的人类用户
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredHumans.map(user => {
                const derivedBrands = uniqueBrandsFromPermittedAgents(user.permittedAgents)
                const ownedBrands = uniqueBrandsFromOwnerLinks([...(user.ownedBrands || []), ...(user.legacyOwnedBrands || [])])
                return (
                  <li key={user.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/30 dark:hover:bg-slate-850/20 transition-all">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">{user.email}</span>
                        {user.nickname && (
                          <span className="text-xs text-slate-400 font-medium">({user.nickname})</span>
                        )}
                        <UserClassificationBadges user={user} />
                      </div>
                      <p className="text-[11px] text-slate-400 leading-normal">
                        注册时间：{new Date(user.createdAt).toLocaleDateString('zh-CN')}
                      </p>
                      <div className="space-y-0.5 pt-1 text-[11px] text-slate-500 dark:text-slate-450">
                        <p className="truncate">
                          <span className="text-slate-400">拥有品牌：</span>
                          {formatBrandNames(ownedBrands)}
                        </p>
                        <p className="truncate">
                          <span className="text-slate-400">运营范围：</span>
                          {formatBrandNames(derivedBrands)}
                        </p>
                        <p className="truncate">
                          <span className="text-slate-400">授权 AI 序列：</span>
                          {user.permittedAgents.length > 0 
                            ? user.permittedAgents.map(pa => pa.agent.nickname || pa.agent.email).join('、')
                            : '暂无'
                          }
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap md:flex-nowrap">
                      <button 
                        onClick={() => handleOpenPermissions(user)} 
                        className="px-2.5 py-1.5 text-[11px] font-extrabold rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-650 dark:text-slate-350 transition-all border border-slate-200/50 dark:border-slate-700/50"
                      >
                        运营权限
                      </button>
                      <button 
                        onClick={() => onToggleBusinessRole(user, 'BRAND_OWNER')} 
                        disabled={!!actionLoading[user.id + '_biz']} 
                        className="px-2.5 py-1.5 text-[11px] font-extrabold rounded-xl bg-blue-50/50 hover:bg-blue-50 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-450 transition-all border border-blue-100/50 dark:border-blue-900/30 disabled:opacity-50"
                      >
                        {(user.businessRoles || []).some((item) => item.role === 'BRAND_OWNER') ? '降级 Owner' : '设为 Owner'}
                      </button>
                      <button 
                        onClick={() => onToggleBusinessRole(user, 'AMC_PRINCIPAL')} 
                        disabled={!!actionLoading[user.id + '_biz']} 
                        className="px-2.5 py-1.5 text-[11px] font-extrabold rounded-xl bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-455 transition-all border border-emerald-100/50 dark:border-emerald-900/30 disabled:opacity-50"
                      >
                        {(user.businessRoles || []).some((item) => item.role === 'AMC_PRINCIPAL') ? '降级 Principal' : '设为 Principal'}
                      </button>
                      <button 
                        onClick={() => onRoleToggle(user)} 
                        disabled={!!actionLoading[user.id + '_role']} 
                        className="px-2.5 py-1.5 text-[11px] font-extrabold rounded-xl bg-indigo-50/50 hover:bg-indigo-50 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-450 transition-all border border-indigo-100/50 dark:border-indigo-900/30 disabled:opacity-50"
                      >
                        {actionLoading[user.id + '_role'] ? '...' : user.role === 'ADMIN' ? '降级 Admin' : '设为 Admin'}
                      </button>
                      <div className="flex items-center gap-1 border-l border-slate-100 dark:border-slate-800 pl-1.5 ml-1">
                        <button 
                          onClick={() => onEditUser({ id: user.id, email: user.email, nickname: user.nickname, role: user.role, type: user.type })} 
                          title="编辑用户信息" 
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          onClick={() => onResetPassword(user)} 
                          disabled={!!actionLoading[user.id + '_reset']} 
                          title="重置密码" 
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all disabled:opacity-50"
                        >
                          <RefreshCw size={14} className={actionLoading[user.id + '_reset'] ? 'animate-spin' : ''} />
                        </button>
                        <button 
                          onClick={() => onDeleteUser(user)} 
                          disabled={!!actionLoading[user.id + '_del']} 
                          title="删除" 
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Permissions Modal */}
      {selectedHuman && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4 border border-slate-150 dark:border-slate-850">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">配置 AI 代理人授权权限</h2>
              <p className="text-xs text-slate-400 mt-1">设置人类用户 <b>{selectedHuman.email}</b> 可以查看和下发指令的 AI 员工范围：</p>
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-100 dark:border-slate-800 rounded-xl p-3 scrollbar-thin">
              {allAgents.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">暂无可用 AI Agent，请先在 AI 序列配置中创建</p>
              ) : (
                allAgents.map(agent => (
                  <label key={agent.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-all">
                    <input
                      type="checkbox"
                      checked={assignedAgentIds.includes(agent.id)}
                      onChange={e => {
                        if (e.target.checked) setAssignedAgentIds(prev => [...prev, agent.id])
                        else setAssignedAgentIds(prev => prev.filter(id => id !== agent.id))
                      }}
                      className="rounded border-slate-350 dark:border-slate-700 text-blue-650 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="text-xs">
                      <p className="font-extrabold text-slate-750 dark:text-slate-200">{agent.nickname || '未命名 Agent'}</p>
                      <p className="text-[10px] text-slate-400">{agent.email}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setSelectedHuman(null)} 
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200/65 dark:border-slate-750 bg-white dark:bg-slate-900"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await onSavePermissions(selectedHuman.id, assignedAgentIds)
                  setSelectedHuman(null)
                }}
                disabled={savingPerms}
                className="px-5 py-2 rounded-xl text-xs font-black bg-blue-650 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition-all"
              >
                {savingPerms ? '保存中...' : '保存授权'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
