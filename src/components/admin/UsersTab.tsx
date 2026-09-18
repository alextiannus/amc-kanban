'use client'

import React, { useState } from 'react'
import { 
  Users, User, RefreshCw
} from 'lucide-react'
import UserAccountsPanel from './UserAccountsPanel'
import UserGroupsPanel from './UserGroupsPanel'
import EditUserModal from './EditUserModal'
import AccessOverviewPanel from './AccessOverviewPanel'
import type { AppRole } from '@/lib/permissions'
import type { RoleDefinition } from '@/lib/role-permissions/contract'

export interface UserRecord {
  id: string
  email: string
  nickname: string | null
  role: string // 'ADMIN' | 'USER'
  type: string // 'HUMAN' | 'AI_AGENT'
  insights?: string | null
  introduction?: string | null
  workflow?: string | null
  themeColor?: string | null
  chatLink?: string | null
  driveFolder?: string | null
  businessRoles: Array<{
    role: string
    definition?: { name: string; enabled: boolean; builtIn: boolean }
  }>
  ownedBrands: Array<{
    brand: { id: string; name: string; status: string }
  }>
  legacyOwnedBrands: Array<{
    brand: { id: string; name: string; status: string }
  }>
  permittedAgents: Array<{
    agent: { id: string; nickname: string | null; email: string }
  }>
  assignedToHumans: Array<{
    human: { id: string; nickname: string | null; email: string }
  }>
  ownerId?: string | null
  owner?: { id: string; email: string; nickname: string | null } | null
  brandMemberships?: Array<{
    brand: { id: string; name: string; status: string }
  }>
  apiKeys?: Array<{
    id: string
    name: string | null
    token: string | null
    prefix: string | null
    createdAt: string
    lastUsedAt: string | null
    expiresAt: string | null
    revokedAt: string | null
  }>
}

interface UsersTabProps {
  users: UserRecord[]
  loading: boolean
  creating: boolean
  actionLoading: Record<string, string>
  onCreateUser: (email: string, type: string, role: string) => Promise<void>
  onRoleToggle: (user: UserRecord) => Promise<void>
  onToggleBusinessRole: (user: UserRecord, roleName: 'BRAND_OWNER' | 'AMC_PRINCIPAL' | 'BD' | 'RESEARCHER') => void
  onResetPassword: (user: UserRecord) => Promise<void>
  onDeleteUser: (user: UserRecord) => Promise<void>
  onSavePermissions: (humanId: string, agentIds: string[]) => Promise<void>
  onFetchUsers: () => Promise<void>
  savingPerms: boolean
}

type SubTab = 'humans' | 'groups' | 'access'

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
  onSavePermissions,
  onFetchUsers,
  savingPerms,
}: UsersTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('humans')
  const [accessTarget, setAccessTarget] = useState<{ userId?: string; role?: string }>({})
  const [editingHumanUser, setEditingHumanUser] = useState<UserRecord | null>(null)
  const [roleCatalog, setRoleCatalog] = useState<RoleDefinition[]>([])
  const [roleCatalogError, setRoleCatalogError] = useState(false)

  React.useEffect(() => {
    if (subTab !== 'humans') return
    let active = true
    setRoleCatalogError(false)
    fetch('/api/admin/roles', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('角色目录不可用')
        return response.json()
      })
      .then(data => { if (active) setRoleCatalog(data.roles) })
      .catch(() => { if (active) setRoleCatalogError(true) })
    return () => { active = false }
  }, [subTab])

  const humans = users.filter(u => u.type === 'HUMAN')

  const handleEditHumanUserSave = async (updated: { id: string; email: string; nickname: string | null; role: string; type: string; businessRoles?: Array<{ role: string }> }) => {
    void updated
    await onFetchUsers()
    setEditingHumanUser(null)
  }

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      {/* Module Title */}
      <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4`}>
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users size={18} className="text-blue-500" /> 用户与权限管理中心 (Identity & Access Control)
          </h2>
          <details className="text-xs text-slate-500 mt-1"><summary className="cursor-pointer">管理说明</summary><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            管理成员、预设及自定义角色，查看 Kanban、Content 菜单及操作权限，并执行主理人委托与品牌资产分配授权。
          </p></details>
        </div>
        <button 
          onClick={onFetchUsers} 
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-slate-55 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>刷新数据</span>
        </button>
      </div>

      {/* Sub-tab Switcher Segment */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 overflow-x-auto pb-px">
        <button
          onClick={() => setSubTab('humans')}
          className={`px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            subTab === 'humans'
              ? 'border-blue-600 text-blue-600 dark:text-blue-550'
              : 'border-transparent text-slate-500 hover:text-slate-850 dark:hover:text-slate-200'
          }`}
        >
          <User size={14} />
          <span>账号管理 ({humans.length})</span>
        </button>
        <button
          onClick={() => setSubTab('groups')}
          className={`px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            subTab === 'groups'
              ? 'border-blue-600 text-blue-600 dark:text-blue-550'
              : 'border-transparent text-slate-500 hover:text-slate-850 dark:hover:text-slate-200'
          }`}
        >
          <Users size={14} />
          <span>用户组与角色</span>
        </button>
        <button type="button" onClick={() => { setAccessTarget({}); setSubTab('access') }} className={`px-4 py-2.5 text-xs font-black border-b-2 whitespace-nowrap ${subTab === 'access' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>权限总览</button>
      </div>

      {/* Render selected sub-panel */}
      {subTab === 'humans' && (
        <UserAccountsPanel 
          roleCatalog={roleCatalog}
          roleCatalogError={roleCatalogError}
          users={users}
          loading={loading}
          creating={creating}
          actionLoading={actionLoading}
          onCreateUser={onCreateUser}
          onRoleToggle={onRoleToggle}
          onToggleBusinessRole={onToggleBusinessRole}
          onResetPassword={onResetPassword}
          onDeleteUser={onDeleteUser}
          onEditUser={setEditingHumanUser}
          onViewAccess={user => { setAccessTarget({ userId: user.id }); setSubTab('access') }}
          onFetchUsers={onFetchUsers}
          onSavePermissions={onSavePermissions}
          savingPerms={savingPerms}
        />
      )}

      {subTab === 'groups' && (
        <UserGroupsPanel onRefresh={onFetchUsers}
          users={users}
          loading={loading}
          actionLoading={actionLoading}
          onRoleToggle={onRoleToggle}
          onToggleBusinessRole={onToggleBusinessRole}
          onViewAccess={role => { setAccessTarget({ role }); setSubTab('access') }}
        />
      )}
      {subTab === 'access' && <AccessOverviewPanel key={`${accessTarget.userId || ''}:${accessTarget.role || ''}`} users={humans} initialUserId={accessTarget.userId} initialRole={accessTarget.role} />}
      {/* Edit Human User Modal */}
      {editingHumanUser && (
        <EditUserModal 
          user={editingHumanUser}
          roleCatalog={roleCatalog}
          roleCatalogError={roleCatalogError}
          onClose={() => setEditingHumanUser(null)}
          onSaved={handleEditHumanUserSave}
        />
      )}
    </div>
  )
}
