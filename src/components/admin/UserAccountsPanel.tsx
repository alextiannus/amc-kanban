'use client'

import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Key,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Bot,
} from 'lucide-react'
import { type UserRecord } from './UsersTab'

interface UserAccountsPanelProps {
  users: UserRecord[]
  loading: boolean
  creating: boolean
  actionLoading: Record<string, string>
  onCreateUser: (email: string, type: string, role: string) => Promise<void>
  onRoleToggle: (user: UserRecord) => Promise<void>
  onToggleBusinessRole: (user: UserRecord, roleName: 'BRAND_OWNER' | 'AMC_PRINCIPAL' | 'BD' | 'RESEARCHER') => void
  onResetPassword: (user: UserRecord) => Promise<void>
  onDeleteUser: (user: UserRecord) => Promise<void>
  onEditUser: (user: { id: string; email: string; nickname: string | null; role: string; type: string }) => void
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
  users,
  loading,
  creating,
  actionLoading,
  onCreateUser,
  onRoleToggle,
  onToggleBusinessRole,
  onResetPassword,
  onDeleteUser,
  onFetchUsers,
  onSavePermissions,
  savingPerms = false,
}: UserAccountsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [expandedKeyUserId, setExpandedKeyUserId] = useState<string | null>(null)
  const [draft, setDraft] = useState<UserDraft>({ nickname: '', email: '', role: 'USER', businessRoles: [] })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creatingKeyId, setCreatingKeyId] = useState<string | null>(null)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)
  const [createdKeys, setCreatedKeys] = useState<Record<string, { token: string; keyId: string }>>({})
  const [keyNameDrafts, setKeyNameDrafts] = useState<Record<string, string>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showKeyPlaintext, setShowKeyPlaintext] = useState(false)
  const [visibleApiKeys, setVisibleApiKeys] = useState<Record<string, boolean>>({})
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
      businessRoles: (user.businessRoles || []).map((r) => r.role),
    })
  }, [editingUserId, users])

  const startEdit = (user: UserRecord) => {
    setEditingUserId(user.id)
    setShowKeyPlaintext(false)
    setDraft({
      nickname: user.nickname || '',
      email: user.email || '',
      role: user.role || 'USER',
      businessRoles: (user.businessRoles || []).map((r) => r.role),
    })
  }

  const toggleDraftBusinessRole = (role: 'BRAND_OWNER' | 'AMC_PRINCIPAL' | 'BD' | 'RESEARCHER') => {
    setDraft((prev) => ({
      ...prev,
      businessRoles: prev.businessRoles.includes(role)
        ? prev.businessRoles.filter((r) => r !== role)
        : [...prev.businessRoles, role],
    }))
  }

  const handleSaveDraft = async () => {
    if (!editingUserId || !draft.email.trim()) return
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

  const copyToClipboard = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  const handleCreateApiKey = async (user: UserRecord) => {
    setCreatingKeyId(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          createApiKey: true,
          name: keyNameDrafts[user.id] || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.apiKey && data.key?.id) {
        setCreatedKeys((prev) => ({ ...prev, [user.id]: { token: data.apiKey, keyId: data.key.id } }))
        setKeyNameDrafts((prev) => ({ ...prev, [user.id]: '' }))
        setShowKeyPlaintext(true)
        await onFetchUsers?.()
      } else {
        alert(data.error || '生成密钥失败')
      }
    } catch (e) {
      console.error(e)
      alert('生成密钥失败，请检查网络')
    } finally {
      setCreatingKeyId(null)
    }
  }

  const handleRevokeApiKey = async (user: UserRecord, keyId: string) => {
    if (!confirm(`确定撤销 ${user.email} 的这个 API Key？正在使用该 Key 的 AI Staff 会立即断开。`)) return
    setRevokingKeyId(keyId)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revokeApiKeyId: keyId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || '撤销密钥失败')
        return
      }
      await onFetchUsers?.()
    } catch (e) {
      console.error(e)
      alert('撤销密钥失败，请检查网络')
    } finally {
      setRevokingKeyId(null)
    }
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-'
    return new Date(value).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const displayKeyPrefix = (key: { prefix?: string | null; token?: string | null }) => {
    return key.prefix || key.token?.slice(0, 12) || '-'
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
                const ownedBrandCount = (user.ownedBrands || []).length + (user.legacyOwnedBrands || []).length
                const apiKeys = user.apiKeys || []
                const activeKeyCount = apiKeys.filter((key) => !key.revokedAt).length
                const isKeyExpanded = expandedKeyUserId === user.id
                return (
                  <React.Fragment key={user.id}>
                    <tr className={isEditing || isKeyExpanded ? 'bg-blue-50/40 dark:bg-blue-950/10' : undefined}>
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
                            <label className="admin-check">
                              <input
                                type="checkbox"
                                checked={draft.businessRoles.includes('BRAND_OWNER')}
                                onChange={() => toggleDraftBusinessRole('BRAND_OWNER')}
                              />
                              <span>品牌主</span>
                            </label>
                            <label className="admin-check">
                              <input
                                type="checkbox"
                                checked={draft.businessRoles.includes('AMC_PRINCIPAL')}
                                onChange={() => toggleDraftBusinessRole('AMC_PRINCIPAL')}
                              />
                              <span>主理人</span>
                            </label>
                            <label className="admin-check">
                              <input
                                type="checkbox"
                                checked={draft.businessRoles.includes('BD')}
                                onChange={() => toggleDraftBusinessRole('BD')}
                              />
                              <span>BD</span>
                            </label>
                            <label className="admin-check">
                              <input
                                type="checkbox"
                                checked={draft.businessRoles.includes('RESEARCHER')}
                                onChange={() => toggleDraftBusinessRole('RESEARCHER')}
                              />
                              <span>Researcher</span>
                            </label>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="font-semibold text-slate-700 dark:text-slate-350">
                              {ownedBrandCount > 0 ? `${ownedBrandCount} 品牌` : '无绑定品牌'}
                            </span>
                            {(() => {
                              const myOwnedBrands = Array.from(new Set([
                                ...(user.ownedBrands || []).map(b => b.brand),
                                ...(user.legacyOwnedBrands || []).map(b => b.brand)
                              ].filter(Boolean)))
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
                              <button onClick={() => startEdit(user)} className="admin-icon-button" title="编辑成员">
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleOpenPermissions(user)}
                                className="admin-icon-button"
                                title="授权 AI 运营权限"
                              >
                                <Bot size={14} className="text-indigo-500" />
                              </button>
                              <button
                                onClick={() => setExpandedKeyUserId(isKeyExpanded ? null : user.id)}
                                className="admin-icon-button"
                                title="管理 API Keys"
                              >
                                <Shield size={14} />
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
                    {isKeyExpanded && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50/70 dark:bg-slate-950/30">
                          <div className="space-y-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                              <input
                                value={keyNameDrafts[user.id] || ''}
                                onChange={(e) => setKeyNameDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                                className="admin-input md:max-w-xs"
                                placeholder="Key 名称，例如 AI Staff - Alex MacBook"
                              />
                              <button
                                onClick={() => handleCreateApiKey(user)}
                                disabled={creatingKeyId === user.id}
                                className="admin-primary-button"
                                type="button"
                              >
                                {creatingKeyId === user.id ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                                <span>生成新 Key</span>
                              </button>
                            </div>

                            {createdKeys[user.id] && (
                              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                                <div className="mb-2 flex items-center gap-2 font-semibold">
                                  <AlertCircle size={14} />
                                  <span>新 API Key 只显示一次。用于 AI Staff 连接时，请复制完整 Bearer Token。</span>
                                </div>
                                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-900 dark:border-amber-900/40 dark:bg-slate-950 dark:text-slate-100">
                                  <span className="min-w-0 flex-1 select-all break-all">
                                    {showKeyPlaintext ? createdKeys[user.id].token : '••••••••••••••••••••••••••••••••'}
                                  </span>
                                  <button onClick={() => setShowKeyPlaintext((v) => !v)} className="admin-icon-button" title={showKeyPlaintext ? '隐藏' : '显示'}>
                                    {showKeyPlaintext ? <EyeOff size={14} /> : <Eye size={14} />}
                                  </button>
                                  <button
                                    onClick={() => copyToClipboard(createdKeys[user.id].token, createdKeys[user.id].keyId)}
                                    className="admin-icon-button"
                                    title="复制完整 API Key"
                                  >
                                    {copiedKey === createdKeys[user.id].keyId ? <Check size={14} /> : <Copy size={14} />}
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="admin-list bg-white dark:bg-slate-900">
                              <table className="min-w-full text-xs">
                                <thead>
                                  <tr>
                                    <th className="text-left">名称</th>
                                    <th className="text-left">API Key</th>
                                    <th className="text-left">创建时间</th>
                                    <th className="text-left">最近使用</th>
                                    <th className="text-left">状态</th>
                                    <th className="text-right">操作</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {apiKeys.length === 0 ? (
                                    <tr>
                                      <td colSpan={6} className="py-6 text-center text-slate-400">暂无 API Key</td>
                                    </tr>
                                  ) : (
                                    apiKeys.map((key) => {
                                      const isRevoked = !!key.revokedAt
                                      const canReadToken = !!key.token
                                      const isTokenVisible = !!visibleApiKeys[key.id]
                                      return (
                                        <tr key={key.id}>
                                          <td className="font-semibold text-slate-800 dark:text-slate-100">{key.name || '未命名 Key'}</td>
                                          <td className="max-w-[320px]">
                                            {canReadToken ? (
                                              <div className="flex items-center gap-2">
                                                <span className="min-w-0 flex-1 select-all truncate font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                                  {isTokenVisible ? key.token : `${displayKeyPrefix(key)}_••••••••••••••••••••••••`}
                                                </span>
                                                <button
                                                  onClick={() => setVisibleApiKeys((prev) => ({ ...prev, [key.id]: !prev[key.id] }))}
                                                  className="admin-icon-button"
                                                  title={isTokenVisible ? '隐藏完整 API Key' : '查看完整 API Key'}
                                                  type="button"
                                                >
                                                  {isTokenVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </button>
                                                <button
                                                  onClick={() => copyToClipboard(key.token!, key.id)}
                                                  className="admin-icon-button"
                                                  title="复制完整 API Key"
                                                  type="button"
                                                >
                                                  {copiedKey === key.id ? <Check size={14} /> : <Copy size={14} />}
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="space-y-0.5">
                                                <p className="font-mono text-slate-500">{displayKeyPrefix(key)}</p>
                                                <p className="text-[10px] text-amber-600 dark:text-amber-300">旧 Key 无法查看完整值，请生成新 Key 后复制给 AI。</p>
                                              </div>
                                            )}
                                          </td>
                                          <td className="text-slate-500">{formatDateTime(key.createdAt)}</td>
                                          <td className="text-slate-500">{formatDateTime(key.lastUsedAt)}</td>
                                          <td>
                                            <span className={isRevoked ? 'admin-badge' : 'admin-badge admin-badge-green'}>
                                              {isRevoked ? 'Revoked' : 'Active'}
                                            </span>
                                          </td>
                                          <td>
                                            <div className="flex justify-end">
                                              <button
                                                onClick={() => handleRevokeApiKey(user, key.id)}
                                                disabled={isRevoked || revokingKeyId === key.id}
                                                className="admin-secondary-button disabled:cursor-not-allowed disabled:opacity-50"
                                                type="button"
                                              >
                                                {revokingKeyId === key.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                                <span>撤销</span>
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      )
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
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
