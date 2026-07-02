'use client'

import React, { useState } from 'react'
import { 
  Users, Shield, User, Bot, RefreshCw, Key
} from 'lucide-react'
import UserAccountsPanel from './UserAccountsPanel'
import UserGroupsPanel from './UserGroupsPanel'
import AiAgentsPanel from './AiAgentsPanel'
import { type BrandRecord } from './BrandsTab'
import { type AssignmentPoolMember } from '@/components/shared/types'
import EditUserModal from './EditUserModal'

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
    role: string // 'BRAND_OWNER' | 'AMC_PRINCIPAL'
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
  brandMemberships?: Array<{
    brand: { id: string; name: string; status: string }
  }>
  apiKeys?: Array<{ id: string; name: string }>
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
  onSaveAgentDraft: (agentId: string, draft: any) => Promise<boolean>
  onSavePermissions: (humanId: string, agentIds: string[]) => Promise<void>
  onSaveAgentPrincipals: (agentId: string, humanIds: string[]) => Promise<void>
  onFetchUsers: () => Promise<void>
  onFetchBrands: () => Promise<void>
  savingPerms: boolean
  brands: BrandRecord[]

  // Pool management
  poolMembers: AssignmentPoolMember[]
  poolDrafts: Record<string, { capacity: number; priority: number; industries: string; regions: string }>
  onUpdatePoolDraft: (agentId: string, patch: any) => void
  onPatchPoolMember: (member: AssignmentPoolMember, patch: any) => Promise<void>
  onDeletePoolMember: (member: AssignmentPoolMember) => Promise<void>
  onCreatePoolMember: (agent: UserRecord) => Promise<void>
}

type SubTab = 'humans' | 'groups' | 'agents'

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
  onSaveAgentDraft,
  onSavePermissions,
  onSaveAgentPrincipals,
  onFetchUsers,
  onFetchBrands,
  savingPerms,
  brands,
  poolMembers,
  poolDrafts,
  onUpdatePoolDraft,
  onPatchPoolMember,
  onDeletePoolMember,
  onCreatePoolMember
}: UsersTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('humans')
  const [editingHumanUser, setEditingHumanUser] = useState<{ id: string; email: string; nickname: string | null; role: string; type: string } | null>(null)

  const humans = users.filter(u => u.type === 'HUMAN')
  const agents = users.filter(u => u.type === 'AI_AGENT' && !['copywriter@platform.amc', 'designer@platform.amc', 'researcher@platform.amc'].includes(u.email))

  const handleEditHumanUserSave = async (updated: { id: string; email: string; nickname: string | null; role: string; type: string }) => {
    try {
      const res = await fetch(`/api/admin/users/${updated.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: updated.email,
          nickname: updated.nickname,
        }),
      })
      if (res.ok) {
        await onFetchUsers()
        setEditingHumanUser(null)
      } else {
        const data = await res.json()
        alert(data.error || '保存失败')
      }
    } catch (e) {
      console.error(e)
      alert('保存失败')
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Module Title */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users size={18} className="text-blue-500" /> 用户与权限管理中心 (Identity & Access Control)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            在此管理系统内的人类成员、AI 代理，划分预设用户组角色（Admin/Principal/Owner），并执行主理人委托与资产分配授权。
          </p>
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
          <span>人类账号管理 ({humans.length})</span>
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
        <button
          onClick={() => setSubTab('agents')}
          className={`px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            subTab === 'agents'
              ? 'border-blue-600 text-blue-600 dark:text-blue-550'
              : 'border-transparent text-slate-500 hover:text-slate-850 dark:hover:text-slate-200'
          }`}
        >
          <Bot size={14} />
          <span>AI 序列与 Prompt 人设 ({agents.length})</span>
        </button>
      </div>

      {/* Render selected sub-panel */}
      {subTab === 'humans' && (
        <UserAccountsPanel 
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
          onFetchUsers={onFetchUsers}
        />
      )}

      {subTab === 'groups' && (
        <UserGroupsPanel 
          users={users}
          loading={loading}
          actionLoading={actionLoading}
          onRoleToggle={onRoleToggle}
          onToggleBusinessRole={onToggleBusinessRole}
        />
      )}



      {subTab === 'agents' && (
        <AiAgentsPanel 
          users={users}
          loading={loading}
          creating={creating}
          actionLoading={actionLoading}
          onCreateUser={onCreateUser}
          onDeleteUser={onDeleteUser}
          onSaveAgentPrincipals={onSaveAgentPrincipals}
          onSaveAgentDraft={onSaveAgentDraft}
          onFetchUsers={onFetchUsers}
          savingPerms={savingPerms}
          poolMembers={poolMembers}
          poolDrafts={poolDrafts}
          onUpdatePoolDraft={onUpdatePoolDraft}
          onPatchPoolMember={onPatchPoolMember}
          onDeletePoolMember={onDeletePoolMember}
          onCreatePoolMember={onCreatePoolMember}
        />
      )}

      {/* Edit Human User Modal */}
      {editingHumanUser && (
        <EditUserModal 
          user={editingHumanUser}
          onClose={() => setEditingHumanUser(null)}
          onSaved={handleEditHumanUserSave}
        />
      )}
    </div>
  )
}
