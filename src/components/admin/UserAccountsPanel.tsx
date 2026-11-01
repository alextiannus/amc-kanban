'use client'

import React, { useEffect, useState } from 'react'
import {
  Check,
  Edit3,
  Key,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Bot,
} from 'lucide-react'
import { type UserRecord } from './UsersTab'
import type { RoleDefinition } from '@/lib/role-permissions/contract'

interface UserAccountsPanelProps {
  roleCatalog: RoleDefinition[]
  roleCatalogError: boolean
  users: UserRecord[]
  loading: boolean
  creating: boolean
  actionLoading: Record<string, string>
  onCreateUser: (email: string, type: string, role: string) => Promise<void>
  onRoleToggle: (user: UserRecord) => Promise<void>
  onToggleBusinessRole: (user: UserRecord, roleName: 'BRAND_OWNER' | 'AMC_PRINCIPAL' | 'BD' | 'RESEARCHER') => void
  onResetPassword: (user: UserRecord) => Promise<void>
  onDeleteUser: (user: UserRecord) => Promise<void>
  onEditUser: (user: UserRecord) => void
  onViewAccess: (user: UserRecord) => void
  onFetchUsers?: () => Promise<void>
  onSavePermissions?: (humanId: string, agentIds: string[]) => Promise<void>
  savingPerms?: boolean
}

type UserDraft = {
  nickname: string
  email: string
  role: string
  businessRoles: string[]
}

export default function UserAccountsPanel({
  roleCatalog,
  roleCatalogError,
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
  onViewAccess,
  onFetchUsers,
  onSavePermissions,
  savingPerms = false,
}: UserAccountsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [draft, setDraft] = useState<UserDraft>({ nickname: '', email: '', role: 'USER', businessRoles: [] })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('USER')
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null)
  const [selectedHumanForPerms, setSelectedHumanForPerms] = useState<UserRecord | null>(null)
  const [assignedAgentIds, setAssignedAgentIds] = useState<string[]>([])

  const handleOpenPermissions = (user: UserRecord) => {
    setSelectedHumanForPerms(user)
    setAssignedAgentIds((user.permittedAgents || []).map(pa => pa.agent.id))
  }

  const allAgents = users.filter(u => u.type === 'AI_AGENT' && !['copywriter@platform.amc', 'designer@platform.amc', 'researcher@platform.amc'].includes(u.email))

  const humans = users.filter((u) => u.type === 'HUMAN')
  const visibleOwnedBrands = (user: UserRecord) => {
    const byId = new Map<string, { id: string; name: string; status: string }>()
    for (const item of [...(user.ownedBrands || []), ...(user.legacyOwnedBrands || [])]) {
      const brand = item.brand
      if (!brand || brand.status === 'ARCHIVED') continue
      byId.set(brand.id, brand)
    }
    return Array.from(byId.values())
  }
  const filteredHumans = humans.filter((u) => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return true
    return u.email.toLowerCase().includes(query) || (u.nickname || '').toLowerCase().includes(query)
  })

  useEffect(() => {
    if (!editingUserId) return
    const user = humans.find((u) => u.id === editingUserId)
    if (!user) {
      setEditingUserId(null)
      return
    }
    setDraft({
      nickname: user.nickname || '',
      email: user.email || '',
      role: user.role || 'USER',
      businessRoles: (user.businessRoles || []).map((r) => r.role).filter(id => id !== 'ADMIN'),
    })
  }, [editingUserId, users])

  const toggleDraftBusinessRole = (role: string) => {
    setDraft((prev) => ({
      ...prev,
      businessRoles: prev.businessRoles.includes(role)
        ? prev.businessRoles.filter((r) => r !== role)
        : [...prev.businessRoles, role],
    }))
  }

  const handleSaveDraft = async () => {
    if (!editingUserId || !draft.email.trim()) return
    if (roleCatalogError || !roleCatalog.length) { alert('角色目录不可用，请刷新后重试'); return }
    setSavingId(editingUserId)
    try {
      const res = await fetch(`/api/admin/users/${editingUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: draft.nickname.trim() || null,
          email: draft.email.trim(),
          role: draft.role,
          businessRoles: draft.businessRoles,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '保存账户失败')
        return
      }
      await onFetchUsers?.()
      setEditingUserId(null)
    } catch (e) {
      console.error(e)
      alert('保存失败，请检查网络')
    } finally {
      setSavingId(null)
    }
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return
    await onCreateUser(newEmail.trim(), 'HUMAN', newRole)
    setNewEmail('')
    setNewRole('USER')
    setShowCreateModal(false)
  }

  const roleBadges = (user: UserRecord) => {
    const roles = new Set((user.businessRoles || []).map((r) => r.role))
    return (
      <div className="flex flex-wrap gap-1.5">
        {user.role === 'ADMIN' && <span className="admin-badge admin-badge-indigo">Admin</span>}
        {roles.has('AMC_PRINCIPAL') && <span className="admin-badge admin-badge-blue">主理人</span>}
        {roles.has('BRAND_OWNER') && <span className="admin-badge admin-badge-green">品牌主</span>}
        {roles.has('BD') && <span className="admin-badge admin-badge-amber">BD</span>}
        {roles.has('RESEARCHER') && <span className="admin-badge admin-badge-slate">Researcher</span>}
        {user.businessRoles?.filter(r => r.definition && !r.definition.builtIn).map(r => <span key={r.role} className="admin-badge admin-badge-slate">{r.definition!.name}{!r.definition!.enabled && '（已停用）'}</span>)}
        {user.role !== 'ADMIN' && roles.size === 0 && <span className="text-slate-400">普通成员</span>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="admin-toolbar">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索姓名或邮箱"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="admin-input pl-9"
          />
        </div>
        <button onClick={() => setShowCreateModal(true)} className="admin-primary-button">
          <Plus size={14} />
          <span>新建成员</span>
        </button>
      </div>

      <div className="admin-list">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              <th className="text-left">成员</th>
              <th className="text-left">邮箱</th>
              <th className="text-left">系统身份</th>
              <th className="text-left">业务角色</th>
              <th className="text-left">关联AI</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
                  <RefreshCw className="mr-2 inline animate-spin" size={15} />
                  正在加载成员
                </td>
              </tr>
            ) : filteredHumans.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">暂无匹配成员</td>
              </tr>
            ) : (
              filteredHumans.map((user) => {
                const isEditing = editingUserId === user.id
                const myOwnedBrands = visibleOwnedBrands(user)
                const ownedBrandCount = myOwnedBrands.length
                const apiKeys = user.apiKeys || []
                const activeKeyCount = apiKeys.filter((key) => !key.revokedAt).length
                return (
                  <React.Fragment key={user.id}>
                    <tr className={isEditing ? 'bg-blue-50/40 dark:bg-blue-950/10' : undefined}>
                      <td>
                        {isEditing ? (
                          <input
                            value={draft.nickname}
                            onChange={(e) => setDraft((prev) => ({ ...prev, nickname: e.target.value }))}
                            className="admin-input"
                            placeholder="姓名"
                          />
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {(user.nickname || user.email).charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900 dark:text-white">{user.nickname || '未命名成员'}</p>
                              <p className="font-mono text-[10px] text-slate-400">{user.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            type="email"
                            value={draft.email}
                            onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
                            className="admin-input font-mono"
                          />
                        ) : (
                          <span className="font-mono text-slate-500 dark:text-slate-400">{user.email}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <select
                            value={draft.role}
                            onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value }))}
                            className="admin-input"
                          >
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        ) : (
                          roleBadges(user)
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="flex flex-wrap gap-2">
                            {roleCatalog.filter(item => item.id !== 'ADMIN').map(item => <label key={item.id} className="admin-check">
                              <input type="checkbox" checked={draft.businessRoles.includes(item.id)} disabled={!item.enabled && !draft.businessRoles.includes(item.id)} onChange={() => toggleDraftBusinessRole(item.id)} />
                              <span>{item.name}{!item.enabled && '（已停用）'}</span>
                            </label>)}
                            {roleCatalogError && <span className="text-red-600 text-xs">角色目录加载失败</span>}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="font-semibold text-slate-700 dark:text-slate-350">
                              {ownedBrandCount > 0 ? `${ownedBrandCount} 品牌` : '无绑定品牌'}
                            </span>
                            {(() => {
                              const brandNames = myOwnedBrands.map(b => b.name).join(', ')
                              return brandNames && (
                                <p className="text-[10px] text-slate-400 truncate max-w-[180px]" title={brandNames}>
                                  {brandNames}
                                </p>
                              )
                            })()}
                          </div>
                        )}
                      </td>
                      <td className="text-slate-500 dark:text-slate-400">
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-700 dark:text-slate-350">
                            {activeKeyCount > 0 ? `${activeKeyCount} active / ${apiKeys.length} total` : '无 Key'}
                          </div>
                          {(() => {
                            const permittedAgents = user.permittedAgents || []
                            const agentNames = permittedAgents.map(pa => pa.agent?.nickname || pa.agent?.email).filter(Boolean).join(', ')
                            return permittedAgents.length > 0 && (
                              <p className="text-[10px] text-slate-400 truncate max-w-[180px]" title={agentNames}>
                                授权AI: {agentNames}
                              </p>
                            )
                          })()}
                        </div>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => setEditingUserId(null)}
                                className="admin-secondary-button"
                                type="button"
                              >
                                取消
                              </button>
                              <button
                                onClick={handleSaveDraft}
                                disabled={savingId === user.id || !draft.email.trim()}
                                className="admin-primary-button"
                                type="button"
                              >
                                {savingId === user.id ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                                <span>保存</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => onEditUser(user)} className="admin-icon-button" title="编辑成员详情">
                                <Edit3 size={14} />
                              </button>
                              <button type="button" onClick={() => onViewAccess(user)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs whitespace-nowrap text-blue-600" title="查看菜单与操作权限">查看权限</button>
                              <button
                                onClick={() => handleOpenPermissions(user)}
                                className="admin-icon-button"
                                title="授权 AI 运营权限"
                              >
                                <Bot size={14} className="text-indigo-500" />
                              </button>
                              <button onClick={() => setResetTarget(user)} className="admin-icon-button" title="重置密码">
                                <Key size={14} />
                              </button>
                              <button onClick={() => setDeleteTarget(user)} className="admin-icon-button admin-danger-icon" title="删除成员">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal max-w-md">
            <div className="admin-modal-header">
              <div>
                <h2>新建成员</h2>
                <p>输入邮箱，系统会生成登录邀请。</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="admin-icon-button" type="button">×</button>
            </div>
            <form onSubmit={handleCreateSubmit} className="space-y-4 p-5">
              <label className="admin-field">
                <span>系统身份</span>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="admin-input">
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              <label className="admin-field">
                <span>邮箱</span>
                <input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="admin-input" placeholder="name@example.com" />
              </label>
              <div className="admin-modal-footer">
                <button type="button" onClick={() => setShowCreateModal(false)} className="admin-secondary-button">取消</button>
                <button type="submit" disabled={creating} className="admin-primary-button">
                  {creating ? <RefreshCw size={13} className="animate-spin" /> : <UserPlus size={13} />}
                  <span>{creating ? '创建中' : '创建成员'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal max-w-sm">
            <div className="p-5">
              <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">重置密码</h2>
              <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                确认为 {resetTarget.nickname || resetTarget.email} 发送密码重置链接？
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setResetTarget(null)} className="admin-secondary-button">取消</button>
                <button
                  onClick={async () => {
                    await onResetPassword(resetTarget)
                    setResetTarget(null)
                  }}
                  className="admin-primary-button"
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal max-w-sm">
            <div className="p-5">
              <h2 className="mb-2 text-sm font-semibold text-rose-600">删除成员</h2>
              <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                确认删除 {deleteTarget.nickname || deleteTarget.email}？此操作不可撤销。
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setDeleteTarget(null)} className="admin-secondary-button">取消</button>
                <button
                  onClick={async () => {
                    await onDeleteUser(deleteTarget)
                    setDeleteTarget(null)
                  }}
                  className="admin-danger-button"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedHumanForPerms && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal max-w-md">
            <div className="admin-modal-header">
              <div>
                <h2 className="text-slate-900 dark:text-white">配置 AI 代理人授权权限</h2>
                <p className="text-xs text-slate-400 mt-1">设置人类用户 <b>{selectedHumanForPerms.email}</b> 的授权监管 AI 范围：</p>
              </div>
              <button onClick={() => setSelectedHumanForPerms(null)} className="admin-icon-button" type="button">×</button>
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2 p-5 bg-white dark:bg-slate-900">
              {allAgents.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">暂无可用 AI Agent，请先在 AI 序列配置中创建</p>
              ) : (
                allAgents.map(agent => (
                  <label key={agent.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-all border border-slate-105 dark:border-slate-800">
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
                      <p className="text-[10px] text-slate-400 font-mono">{agent.email}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="admin-modal-footer p-5 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
              <button 
                type="button"
                onClick={() => setSelectedHumanForPerms(null)} 
                className="admin-secondary-button"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onSavePermissions) {
                    await onSavePermissions(selectedHumanForPerms.id, assignedAgentIds)
                  }
                  setSelectedHumanForPerms(null)
                }}
                disabled={savingPerms}
                className="admin-primary-button"
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
