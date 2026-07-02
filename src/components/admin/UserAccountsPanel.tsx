'use client'

import React, { useState, useEffect } from 'react'
import { 
  User, Plus, Search, Shield, RefreshCw, Key, Trash2, Edit3, Check, Users, UserPlus, AlertCircle, Eye, EyeOff
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
  onFetchUsers?: () => Promise<void>
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
  onEditUser,
  onFetchUsers
}: UserAccountsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  
  // Profile Form States
  const [editNickname, setEditNickname] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState('USER') // 'ADMIN' | 'USER'
  const [editBusinessRoles, setEditBusinessRoles] = useState<string[]>([])
  
  // Keys & saving loaders
  const [regeneratedKey, setRegeneratedKey] = useState<string | null>(null)
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [showKeyPlaintext, setShowKeyPlaintext] = useState(false)

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('USER')
  
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const humans = users.filter(u => u.type === 'HUMAN')
  const filteredHumans = humans.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.nickname && u.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const selectedUser = humans.find(u => u.id === selectedUserId)

  // Sync details when selected user changes
  useEffect(() => {
    if (selectedUser) {
      setEditNickname(selectedUser.nickname || '')
      setEditEmail(selectedUser.email || '')
      setEditRole(selectedUser.role || 'USER')
      setEditBusinessRoles((selectedUser.businessRoles || []).map(r => r.role))
      setRegeneratedKey(null)
      setShowKeyPlaintext(false)
    } else {
      setEditNickname('')
      setEditEmail('')
      setEditRole('USER')
      setEditBusinessRoles([])
      setRegeneratedKey(null)
    }
  }, [selectedUserId, users])

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return
    await onCreateUser(newEmail.trim(), 'HUMAN', newRole)
    setNewEmail('')
    setShowCreateModal(false)
  }

  const handleResetPasswordLocal = async () => {
    if (!selectedUser) return
    await onResetPassword(selectedUser)
    setShowResetConfirm(false)
  }

  const handleDeleteUserLocal = async () => {
    if (!selectedUser) return
    await onDeleteUser(selectedUser)
    setSelectedUserId(null)
    setShowDeleteConfirm(false)
  }

  const handleSaveProfile = async () => {
    if (!selectedUserId) return
    setIsSavingProfile(true)
    try {
      // 1. PATCH basic details and business roles
      const res = await fetch(`/api/admin/users/${selectedUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: editNickname.trim() || null,
          email: editEmail.trim(),
          businessRoles: editBusinessRoles
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '保存账户资料失败')
        return
      }

      // 2. PATCH system role if changed
      if (selectedUser && selectedUser.role !== editRole) {
        const roleRes = await fetch(`/api/admin/users/${selectedUserId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: editRole }),
        })
        if (!roleRes.ok) {
          const data = await roleRes.json().catch(() => ({}))
          alert(data.error || '更新系统角色失败')
          return
        }
      }

      if (onFetchUsers) await onFetchUsers()
      alert('账户资料与身份标签保存成功！')
    } catch (e) {
      console.error(e)
      alert('保存失败，请检查网络。')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleRegenerateApiKey = async () => {
    if (!selectedUserId) return
    if (!confirm('您确定要为该人类用户重新生成 API Key 吗？这会作废其现有的 API Key 授权凭证。')) return
    setIsRegeneratingKey(true)
    setRegeneratedKey(null)
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateApiKey: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.apiKey) {
        setRegeneratedKey(data.apiKey)
        setShowKeyPlaintext(true)
        if (onFetchUsers) await onFetchUsers()
      } else {
        alert(data.error || '重新生成密钥失败')
      }
    } catch (e) {
      console.error(e)
      alert('重置密钥失败，请检查网络。')
    } finally {
      setIsRegeneratingKey(false)
    }
  }

  const handleToggleBusinessRoleLocal = (role: 'BRAND_OWNER' | 'AMC_PRINCIPAL') => {
    setEditBusinessRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  const uniqueBrandsFromOwnerLinks = (links: Array<{ brand: { id: string; name: string; status: string } }> = []) => {
    const map = new Map<string, { id: string; name: string; status: string }>()
    for (const link of links) map.set(link.brand.id, link.brand)
    return Array.from(map.values())
  }

  const formatBrandNames = (brands: { name: string }[], max = 2) => {
    if (brands.length === 0) return '无托管品牌'
    const head = brands.slice(0, max).map((brand) => brand.name).join('、')
    return brands.length > max ? `${head} 等 ${brands.length} 个` : head
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      
      {/* LEFT COLUMN: User Account List (60% Width on large screens) */}
      <div className="lg:col-span-3 space-y-4">
        {/* Search & Create Toolbar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="搜索成员姓名、邮箱..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-650 hover:bg-blue-700 text-white font-extrabold text-xs transition-all shadow-sm rounded-xl cursor-pointer whitespace-nowrap"
          >
            <UserPlus size={13} />
            <span>新建成员</span>
          </button>
        </div>

        {/* List Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-450">
              <RefreshCw className="animate-spin inline-block mr-2 text-slate-400" size={16} />
              正在载入人员账户列表...
            </div>
          ) : filteredHumans.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-450">
              暂无人员账户数据，请在上方“新建成员”
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-905 text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="text-left px-4 py-3">昵称 / 姓名</th>
                    <th className="text-left px-4 py-3">注册邮箱</th>
                    <th className="text-left px-4 py-3">系统身份</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-300">
                  {filteredHumans.map(user => {
                    const isSelected = selectedUserId === user.id
                    const explicitRoles = new Set((user.businessRoles || []).map((r) => r.role))

                    return (
                      <tr 
                        key={user.id}
                        onClick={() => handleSelectUser(isSelected ? null : user)}
                        className={`cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-blue-50/30 dark:bg-slate-800/40 border-l-2 border-l-blue-600' 
                            : 'hover:bg-slate-50/30 dark:hover:bg-slate-850/10'
                        }`}
                      >
                        {/* Nickname column */}
                        <td className="px-4 py-4 font-black text-slate-850 dark:text-white">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black uppercase text-slate-550 dark:text-slate-400">
                              {(user.nickname || user.email).charAt(0)}
                            </span>
                            <span className="truncate">{user.nickname || '未设置人设'}</span>
                          </div>
                        </td>

                        {/* Email column */}
                        <td className="px-4 py-4 font-mono text-slate-400">
                          {user.email}
                        </td>

                        {/* Badges column */}
                        <td className="px-4 py-4 space-x-1 space-y-1">
                          {user.role === 'ADMIN' && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-50 dark:bg-indigo-900/20 text-indigo-650 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/30">
                              Admin
                            </span>
                          )}
                          {explicitRoles.has('AMC_PRINCIPAL') && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-50 dark:bg-blue-900/20 text-blue-650 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                              主理人
                            </span>
                          )}
                          {explicitRoles.has('BRAND_OWNER') && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 dark:bg-emerald-900/20 text-emerald-650 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">
                              业主
                            </span>
                          )}
                          {!user.role && explicitRoles.size === 0 && (
                            <span className="text-[10px] text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Profile & Credentials Console (40% Width) */}
      <div className="lg:col-span-2">
        {!selectedUser ? (
          <div className="bg-slate-50/50 dark:bg-slate-900/30 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
            <User size={36} className="text-slate-300 dark:text-slate-700 mb-3" />
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-300">请选择一名人类成员</h3>
            <p className="text-[11px] text-slate-400 max-w-[200px] mt-1 leading-relaxed">
              从左侧列表中点击选择任一成员账号，以在右侧面板直接修改其基础资料、配置商业角色或重置安全凭证。
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
            
            {/* Header info */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                  🔧 资料与身份控制台
                </h3>
                <p className="text-[10px] text-slate-450 mt-0.5">用户 ID: {selectedUser.id}</p>
              </div>
              <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                {selectedUser.role}
              </span>
            </div>

            {/* Profile Fields */}
            <div className="space-y-4">
              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">昵称 / 真实姓名</span>
                <input 
                  type="text" 
                  value={editNickname}
                  onChange={e => setEditNickname(e.target.value)}
                  placeholder="请输入姓名"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>

              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">注册与接收邮箱</span>
                <input 
                  type="email" 
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  placeholder="请输入邮箱"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>

              {/* System Admin toggle */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">系统核心权限 (System Role)</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-350">
                    <input 
                      type="radio" 
                      name="systemRole" 
                      value="USER"
                      checked={editRole === 'USER'}
                      onChange={() => setEditRole('USER')}
                      className="text-blue-650 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>USER (普通成员)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-350">
                    <input 
                      type="radio" 
                      name="systemRole" 
                      value="ADMIN"
                      checked={editRole === 'ADMIN'}
                      onChange={() => setEditRole('ADMIN')}
                      className="text-blue-650 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-indigo-600 dark:text-indigo-400">ADMIN (系统管理)</span>
                  </label>
                </div>
              </div>

              {/* Business role badges selection */}
              <div className="space-y-2.5 pt-1.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">商业角色职能 (Business Roles)</span>
                <div className="grid grid-cols-2 gap-2">
                  <label 
                    onClick={() => handleToggleBusinessRoleLocal('BRAND_OWNER')}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-extrabold cursor-pointer transition-all ${
                      editBusinessRoles.includes('BRAND_OWNER')
                        ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-slate-150 dark:border-slate-800 hover:bg-slate-50/30 dark:hover:bg-slate-850/10 text-slate-500'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={editBusinessRoles.includes('BRAND_OWNER')}
                      onChange={() => {}} // handled by label onClick
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>品牌主 / 业主</span>
                  </label>

                  <label 
                    onClick={() => handleToggleBusinessRoleLocal('AMC_PRINCIPAL')}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-extrabold cursor-pointer transition-all ${
                      editBusinessRoles.includes('AMC_PRINCIPAL')
                        ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-950/10 text-blue-600 dark:text-blue-400'
                        : 'border-slate-150 dark:border-slate-800 hover:bg-slate-50/30 dark:hover:bg-slate-850/10 text-slate-500'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={editBusinessRoles.includes('AMC_PRINCIPAL')}
                      onChange={() => {}} // handled by label onClick
                      className="rounded border-slate-300 text-blue-650 focus:ring-blue-550 cursor-pointer"
                    />
                    <span>运营主理人</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Profile Action Buttons */}
            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile || !editEmail.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-650 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm rounded-xl cursor-pointer"
              >
                {isSavingProfile ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                <span>{isSavingProfile ? '正在保存...' : '保存账户资料修改'}</span>
              </button>
            </div>

            {/* API Key Credentials section */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-55 dark:bg-slate-955/20 p-4 space-y-3.5">
              <div>
                <h4 className="text-[11px] font-black text-slate-700 dark:text-slate-350">🔑 智能体委任 API 密钥 (Bearer Token)</h4>
                <p className="text-[10px] text-slate-455 leading-relaxed mt-0.5">
                  重置后，智能体程序可以使用此 Token 代理该用户的身份边界完成外部连接及数据交互。
                </p>
              </div>

              {/* Show key plaintext alert box if regenerated */}
              {regeneratedKey && (
                <div className="bg-rose-50/50 dark:bg-rose-955/10 border border-rose-100 dark:border-rose-950/30 rounded-xl p-3 space-y-2 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-455 text-[10px] font-black">
                    <AlertCircle size={12} />
                    <span>新生成 API 密钥 (请务必立即复制，关闭后将无法再次查看)</span>
                  </div>
                  <div className="bg-white dark:bg-slate-950 px-3 py-2 border border-slate-150 dark:border-slate-850 rounded-lg flex items-center justify-between gap-2 font-mono text-[10px] text-slate-800 dark:text-slate-100">
                    <span className="select-all break-all pr-2">
                      {showKeyPlaintext ? regeneratedKey : '••••••••••••••••••••••••••••••••••••••••'}
                    </span>
                    <button 
                      onClick={() => setShowKeyPlaintext(!showKeyPlaintext)}
                      className="text-slate-400 hover:text-slate-655 cursor-pointer"
                      title={showKeyPlaintext ? "隐藏" : "显示"}
                    >
                      {showKeyPlaintext ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleRegenerateApiKey}
                  disabled={isRegeneratingKey}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-black text-slate-750 dark:text-slate-300 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer shadow-sm"
                >
                  <RefreshCw size={11} className={isRegeneratingKey ? 'animate-spin' : ''} />
                  <span>重置 API Key</span>
                </button>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold text-slate-750 dark:text-slate-350 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-sm"
                >
                  <Key size={11} className="text-amber-500" />
                  <span>密码初始化</span>
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center justify-center p-2 border border-rose-150 dark:border-rose-955 bg-rose-50 hover:bg-rose-100 dark:bg-rose-955/10 text-rose-600 dark:text-rose-455 transition-all shadow-sm rounded-xl cursor-pointer"
                  title="注销账号"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* Assigned assets scope info */}
            <div className="rounded-2xl border border-slate-150 dark:border-slate-850 p-4 space-y-2">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">当前监管资产 (Crews & Brands)</h4>
              <div className="text-[11px] font-medium text-slate-550 dark:text-slate-400 space-y-1">
                <p>• 拥有所有权的品牌: <strong className="text-slate-700 dark:text-slate-300">{formatBrandNames(uniqueBrandsFromOwnerLinks([...(selectedUser.ownedBrands || []), ...(selectedUser.legacyOwnedBrands || [])]))}</strong></p>
                <p>• 代理智能体监管数: <strong className="text-slate-700 dark:text-slate-300">{selectedUser.permittedAgents.length} 个</strong></p>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Modal 1: 新建成员 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <UserPlus size={16} className="text-blue-500" />
                <span>新建人类成员账号</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">输入邮箱并选择角色，系统会即时生成一个登录激活链接与初始临时密码。</p>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">系统功能权限 (Role)</label>
                <select 
                  value={newRole} 
                  onChange={e => setNewRole(e.target.value)} 
                  className="w-full border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-850 dark:text-white rounded-xl px-3 py-2 text-xs focus:outline-none"
                >
                  <option value="USER">USER（普通运营成员）</option>
                  <option value="ADMIN">ADMIN（System Admin 系统管理）</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">成员注册邮箱</label>
                <input 
                  required 
                  type="email" 
                  value={newEmail} 
                  onChange={e => setNewEmail(e.target.value)} 
                  placeholder="请输入邮箱地址" 
                  className="w-full border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-850 dark:text-white rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-blue-650 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {creating ? '注册中...' : '注册成员账号'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: 重置密码确认 */}
      {showResetConfirm && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertCircle size={20} />
              <h2 className="text-base font-black">重设用户密码确认</h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              确认要为成员 <strong className="text-slate-800 dark:text-white">{selectedUser.nickname || selectedUser.email}</strong> 重置密码吗？
              重置后，系统将自动生成一个新的临时密码并发送至该邮箱。
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleResetPasswordLocal}
                className="px-5 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all cursor-pointer"
              >
                确认重设
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: 删除账号确认 */}
      {showDeleteConfirm && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-rose-500">
              <AlertCircle size={20} />
              <h2 className="text-base font-black">销户与删除确认</h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              您确定要彻底注销并删除成员账户 <strong className="text-slate-850 dark:text-white">{selectedUser.nickname || selectedUser.email}</strong> 吗？
              该操作将清除其关联的所有品牌拥有权和 AI 监管范围，<span className="text-rose-550 font-bold">此操作无法撤销</span>。
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleDeleteUserLocal}
                className="px-5 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all cursor-pointer"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
