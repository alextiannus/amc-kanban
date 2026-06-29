'use client'

import React, { useState } from 'react'
import { 
  User, Plus, Search, Shield, RefreshCw, Key, Trash2, Edit3, Check, Users
} from 'lucide-react'
import { type UserRecord } from './UsersTab'

interface UserAccountsPanelProps {
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
}

export default function UserAccountsPanel({
  users,
  loading,
  creating,
  actionLoading,
  onCreateUser,
  onRoleToggle,
  onToggleBusinessRole,
  onResetPassword,
  onDeleteUser,
  onEditUser
}: UserAccountsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('USER')

  const humans = users.filter(u => u.type === 'HUMAN')
  const filteredHumans = humans.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.nickname && u.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    onCreateUser(email.trim(), 'HUMAN', role).then(() => {
      setEmail('')
    })
  }

  const uniqueBrandsFromOwnerLinks = (links: Array<{ brand: { id: string; name: string; status: string } }> = []) => {
    const map = new Map<string, { id: string; name: string; status: string }>()
    for (const link of links) map.set(link.brand.id, link.brand)
    return Array.from(map.values())
  }

  const formatBrandNames = (brands: { name: string }[], max = 2) => {
    if (brands.length === 0) return '无代管品牌'
    const head = brands.slice(0, max).map((brand) => brand.name).join('、')
    return brands.length > max ? `${head} 等 ${brands.length} 个` : head
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Create Human Form */}
      <div className="lg:col-span-1">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-205 dark:border-slate-800 p-6 shadow-sm sticky top-6 space-y-4">
          <h3 className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
            <Plus size={16} className="text-blue-500" />
            <span>创建人类成员账号</span>
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">系统功能权限 (Role)</label>
              <select 
                value={role} 
                onChange={e => setRole(e.target.value)} 
                className="w-full border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-850 dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="USER">USER（运营执行账号）</option>
                <option value="ADMIN">ADMIN（System Admin 全局系统管理）</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">成员邮箱地址</label>
              <input 
                required 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="请输入新成员的邮箱" 
                className="w-full border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-850 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <button 
              type="submit" 
              disabled={creating} 
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-650 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm rounded-xl cursor-pointer"
            >
              {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus size={13} />}
              <span>{creating ? '创建账号中...' : '注册新成员并获取链接'}</span>
            </button>
          </form>
          <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
            提示：新建账号后，系统会即时生成一个登录激活链接与 7 天有效的临时初始密码，请手动复制发送给该用户完成注册。
          </p>
        </div>
      </div>

      {/* Right: Human Users List */}
      <div className="lg:col-span-2 space-y-4">
        {/* Search filter */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-202 dark:border-slate-800 p-4 shadow-sm flex items-center gap-3">
          <Search size={16} className="text-slate-400" />
          <input 
            type="text" 
            placeholder="搜索成员姓名、邮箱..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none dark:text-white"
          />
        </div>

        {/* Members List Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-202 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Users size={15} className="text-blue-500" /> 人员列表 ({filteredHumans.length})
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-450">
              <RefreshCw className="animate-spin inline-block mr-2 text-slate-400" size={16} />
              加载人员数据中...
            </div>
          ) : filteredHumans.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-450">
              没有找到符合条件的成员
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredHumans.map(user => {
                const isRoleLoading = !!actionLoading[user.id + '_role']
                const isResetLoading = !!actionLoading[user.id + '_reset']
                const isDelLoading = !!actionLoading[user.id + '_del']
                const explicitRoles = new Set((user.businessRoles || []).map((r) => r.role))
                
                const myOwnedBrands = uniqueBrandsFromOwnerLinks([...(user.ownedBrands || []), ...(user.legacyOwnedBrands || [])])

                return (
                  <li key={user.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/30 dark:hover:bg-slate-850/10 transition-colors">
                    {/* User Profile info */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-850 dark:text-white leading-none">
                          {user.nickname || '新加入成员'}
                        </h4>
                        {user.role === 'ADMIN' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-50 dark:bg-indigo-900/20 text-indigo-650 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/30">
                            <Shield size={10} /> System Admin
                          </span>
                        )}
                        {explicitRoles.has('AMC_PRINCIPAL') && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-50 dark:bg-blue-900/20 text-blue-650 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                            运营主理人 (Principal)
                          </span>
                        )}
                        {explicitRoles.has('BRAND_OWNER') && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 dark:bg-emerald-900/20 text-emerald-650 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">
                            品牌业主 (Owner)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono leading-none truncate">{user.email}</p>
                      
                      <div className="text-[10px] text-slate-450 font-bold space-y-0.5 pt-1">
                        <p>代管资产: <span className="text-slate-650 dark:text-slate-350">{formatBrandNames(myOwnedBrands)}</span></p>
                        <p>监管 AI 数: <span className="text-slate-650 dark:text-slate-350">{user.permittedAgents.length} 个 AI Agent</span></p>
                      </div>
                    </div>

                    {/* Quick actions panel */}
                    <div className="flex flex-wrap items-center gap-1.5 self-end md:self-auto">
                      <button
                        onClick={() => onRoleToggle(user)}
                        disabled={isRoleLoading}
                        className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold text-slate-700 dark:text-slate-350 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer"
                        title="切换系统管理员与普通成员身份"
                      >
                        {isRoleLoading ? '更新中...' : user.role === 'ADMIN' ? '取消 Admin' : '设为 Admin'}
                      </button>
                      
                      <button
                        onClick={() => onEditUser({ id: user.id, email: user.email, nickname: user.nickname, role: user.role, type: user.type })}
                        className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                        title="编辑基本信息"
                      >
                        <Edit3 size={12} />
                      </button>

                      <button
                        onClick={() => onResetPassword(user)}
                        disabled={isResetLoading}
                        className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                        title="重置临时登录密码"
                      >
                        <Key size={12} className={isResetLoading ? 'animate-pulse text-amber-500' : ''} />
                      </button>

                      <button
                        onClick={() => onDeleteUser(user)}
                        disabled={isDelLoading}
                        className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-450 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                        title="安全注销并删除该账号"
                      >
                        <Trash2 size={12} className={isDelLoading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
