'use client'

import React, { useState } from 'react'
import { 
  User, Plus, Search, Shield, RefreshCw, Key, Trash2, Edit3, Check, Users, UserPlus, AlertCircle
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  
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

  const handleRoleToggleLocal = async () => {
    if (!selectedUser) return
    await onRoleToggle(selectedUser)
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
    <div className="space-y-4">
      {/* Top Toolbar Action Area */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search bar */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="搜索成员姓名、邮箱..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
          />
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Create Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1 px-3.5 py-2 bg-blue-650 hover:bg-blue-700 text-white font-extrabold text-xs transition-all shadow-sm rounded-xl cursor-pointer"
          >
            <UserPlus size={13} />
            <span>新建成员</span>
          </button>

          {/* Edit Button */}
          <button
            onClick={() => {
              if (selectedUser) {
                onEditUser({
                  id: selectedUser.id,
                  email: selectedUser.email,
                  nickname: selectedUser.nickname,
                  role: selectedUser.role,
                  type: selectedUser.type
                })
              }
            }}
            disabled={!selectedUserId}
            className="inline-flex items-center gap-1 px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer shadow-sm"
          >
            <Edit3 size={13} className="text-blue-500" />
            <span>修改资料</span>
          </button>

          {/* Toggle Admin Role */}
          <button
            onClick={handleRoleToggleLocal}
            disabled={!selectedUserId || !!actionLoading[selectedUserId + '_role']}
            className="inline-flex items-center gap-1 px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer shadow-sm"
          >
            <Shield size={13} className="text-indigo-500" />
            <span>{selectedUser?.role === 'ADMIN' ? '取消 Admin' : '设为 Admin'}</span>
          </button>

          {/* Reset Password Button */}
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={!selectedUserId || !!actionLoading[selectedUserId + '_reset']}
            className="inline-flex items-center gap-1 px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer shadow-sm"
          >
            <Key size={13} className="text-amber-500" />
            <span>重设密码</span>
          </button>

          {/* Delete Button */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!selectedUserId || !!actionLoading[selectedUserId + '_del']}
            className="inline-flex items-center gap-1 px-3.5 py-2 border border-rose-150 dark:border-rose-955 bg-rose-50 hover:bg-rose-100 dark:bg-rose-955/20 text-rose-600 dark:text-rose-450 disabled:opacity-40 transition-all shadow-sm rounded-xl cursor-pointer"
          >
            <Trash2 size={13} />
            <span>删除用户</span>
          </button>
        </div>
      </div>

      {/* Selected member notification banner */}
      {selectedUser && (
        <div className="bg-blue-50/50 dark:bg-slate-900/30 border border-blue-100 dark:border-slate-800 px-4 py-2.5 rounded-xl text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-550 animate-ping" />
            已选择成员：<strong className="text-slate-850 dark:text-slate-200">{selectedUser.nickname || selectedUser.email}</strong>（{selectedUser.email}）
          </span>
          <button onClick={() => setSelectedUserId(null)} className="text-blue-650 hover:underline dark:text-blue-400 cursor-pointer">清除选择</button>
        </div>
      )}

      {/* Main List Container */}
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
                  <th className="w-12 px-4 py-3 text-center">选择</th>
                  <th className="text-left px-4 py-3">昵称 / 姓名</th>
                  <th className="text-left px-4 py-3">注册邮箱</th>
                  <th className="text-left px-4 py-3">系统身份</th>
                  <th className="text-left px-4 py-3">托管资产范围</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-300">
                {filteredHumans.map(user => {
                  const isSelected = selectedUserId === user.id
                  const explicitRoles = new Set((user.businessRoles || []).map((r) => r.role))
                  const myOwnedBrands = uniqueBrandsFromOwnerLinks([...(user.ownedBrands || []), ...(user.legacyOwnedBrands || [])])

                  return (
                    <tr 
                      key={user.id}
                      onClick={() => setSelectedUserId(isSelected ? null : user.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-blue-50/30 dark:bg-slate-800/40 border-l-2 border-l-blue-600' 
                          : 'hover:bg-slate-50/30 dark:hover:bg-slate-850/10'
                      }`}
                    >
                      {/* Checkbox column */}
                      <td className="px-4 py-3.5 text-center">
                        <input 
                          type="radio" 
                          checked={isSelected}
                          onChange={() => {}} // Controlled by row onClick
                          className="w-3.5 h-3.5 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Nickname column */}
                      <td className="px-4 py-3.5 font-black text-slate-850 dark:text-white">
                        {user.nickname || '未完善人设'}
                      </td>

                      {/* Email column */}
                      <td className="px-4 py-3.5 font-mono text-slate-400">
                        {user.email}
                      </td>

                      {/* Badges column */}
                      <td className="px-4 py-3.5 space-x-1 space-y-1">
                        {user.role === 'ADMIN' && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-50 dark:bg-indigo-900/20 text-indigo-650 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/30">
                            System Admin
                          </span>
                        )}
                        {explicitRoles.has('AMC_PRINCIPAL') && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-50 dark:bg-blue-900/20 text-blue-650 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                            运营主理人
                          </span>
                        )}
                        {explicitRoles.has('BRAND_OWNER') && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 dark:bg-emerald-900/20 text-emerald-650 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">
                            品牌业主
                          </span>
                        )}
                      </td>

                      {/* Assets column */}
                      <td className="px-4 py-3.5 font-medium text-slate-405">
                        {formatBrandNames(myOwnedBrands)} (监管 {user.permittedAgents.length} 个 AI)
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
