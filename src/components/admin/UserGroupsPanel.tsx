'use client'

import React, { useState } from 'react'
import { 
  Users, Shield, User, Bot, Plus, Trash2, PlusCircle, Search
} from 'lucide-react'
import { type UserRecord } from './UsersTab'

interface UserGroupsPanelProps {
  users: UserRecord[]
  loading: boolean
  actionLoading: Record<string, string>
  onRoleToggle: (user: UserRecord) => Promise<void>
  onToggleBusinessRole: (user: UserRecord, roleName: 'BRAND_OWNER' | 'AMC_PRINCIPAL') => void
}

interface GroupDef {
  id: 'admins' | 'principals' | 'owners'
  name: string
  description: string
  roleType: 'system' | 'business'
  systemRole?: 'ADMIN'
  businessRole?: 'AMC_PRINCIPAL' | 'BRAND_OWNER'
}

const GROUPS: GroupDef[] = [
  {
    id: 'admins',
    name: '系统管理员组 (System Administrators)',
    description: '拥有 AMC 平台最高管理权限，可修改全局大模型秘钥、SMTP 邮件设置、调试巡检器以及对其他用户授权。',
    roleType: 'system',
    systemRole: 'ADMIN'
  },
  {
    id: 'principals',
    name: '平台运营主理人组 (AMC Principals)',
    description: '负责多个托管品牌的一站式代运营专员。可管理其代管范围内的全部 AI 员工、查看发帖计划与工作日志。',
    roleType: 'business',
    businessRole: 'AMC_PRINCIPAL'
  },
  {
    id: 'owners',
    name: '托管品牌业主组 (Brand Owners)',
    description: '商户的资产所有者。仅能查看其下辖的品牌故事、审批 AI 生成的推文/活动，以及接收异常提醒。',
    roleType: 'business',
    businessRole: 'BRAND_OWNER'
  }
]

export default function UserGroupsPanel({
  users,
  loading,
  actionLoading,
  onRoleToggle,
  onToggleBusinessRole
}: UserGroupsPanelProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<'admins' | 'principals' | 'owners'>('admins')
  const [addingUserId, setAddingUserId] = useState('')

  const activeGroup = GROUPS.find(g => g.id === selectedGroupId)!

  // Helper check membership
  const getGroupMembers = (group: GroupDef) => {
    return users.filter(u => {
      if (u.type !== 'HUMAN') return false
      if (group.roleType === 'system') {
        return u.role === group.systemRole
      } else {
        return u.businessRoles?.some(r => r.role === group.businessRole)
      }
    })
  }

  const getNonGroupMembers = (group: GroupDef) => {
    return users.filter(u => {
      if (u.type !== 'HUMAN') return false
      if (group.roleType === 'system') {
        return u.role !== group.systemRole
      } else {
        return !u.businessRoles?.some(r => r.role === group.businessRole)
      }
    })
  }

  const groupMembers = getGroupMembers(activeGroup)
  const nonGroupMembers = getNonGroupMembers(activeGroup)

  const handleAddMember = async () => {
    if (!addingUserId) return
    const user = users.find(u => u.id === addingUserId)
    if (!user) return

    if (activeGroup.roleType === 'system') {
      await onRoleToggle(user)
    } else if (activeGroup.businessRole) {
      onToggleBusinessRole(user, activeGroup.businessRole)
    }
    setAddingUserId('')
  }

  const handleRemoveMember = async (user: UserRecord) => {
    if (!confirm(`确认要将 ${user.nickname || user.email} 移出该用户组吗？`)) return

    if (activeGroup.roleType === 'system') {
      await onRoleToggle(user)
    } else if (activeGroup.businessRole) {
      onToggleBusinessRole(user, activeGroup.businessRole)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
      {/* Left List of Groups */}
      <div className="lg:col-span-1 space-y-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-205 dark:border-slate-800 p-4 shadow-sm">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-3">系统预设用户组 (Pre-defined Groups)</h3>
          <div className="space-y-1">
            {GROUPS.map((group) => {
              const members = getGroupMembers(group)
              const isSelected = selectedGroupId === group.id
              return (
                <button
                  key={group.id}
                  onClick={() => { setSelectedGroupId(group.id); setAddingUserId('') }}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl text-left transition-all border cursor-pointer ${
                    isSelected
                      ? 'bg-blue-650 text-white border-blue-600 shadow-sm'
                      : 'bg-white hover:bg-slate-50 border-slate-150 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-350 dark:hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <p className="text-xs font-black leading-snug">{group.name.split(' (')[0]}</p>
                    <p className={`text-[9px] mt-0.5 ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>{group.name.split(' (')[1]?.replace(')', '')}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isSelected ? 'bg-blue-700/50 border-blue-500/30' : 'bg-slate-50 border-slate-150 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                  }`}>
                    {members.length} 人
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right List of Members in Selected Group */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-205 dark:border-slate-800 p-6 shadow-sm space-y-5">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Users size={16} className="text-blue-500" />
              <span>{activeGroup.name}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-medium">
              {activeGroup.description}
            </p>
          </div>

          {/* Add member box */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-955/30 p-4 flex flex-col sm:flex-row items-end sm:items-center justify-between gap-3">
            <div className="space-y-1 flex-1 w-full min-w-0">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">将成员加入该用户组</span>
              <select
                value={addingUserId}
                onChange={e => setAddingUserId(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">-- 选择非数组成员 --</option>
                {nonGroupMembers.map(user => (
                  <option key={user.id} value={user.id}>{user.nickname ? `${user.nickname} (${user.email})` : user.email}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAddMember}
              disabled={!addingUserId}
              className="inline-flex items-center gap-1 bg-blue-650 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              <PlusCircle size={12} />
              <span>确认加入用户组</span>
            </button>
          </div>

          {/* Members list */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">组成员列表 ({groupMembers.length})</h4>
            {groupMembers.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 border border-dashed rounded-xl text-center">暂无分组成员。可通过上方选择成员并添加至用户组。</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groupMembers.map((member) => (
                  <div 
                    key={member.id}
                    className="p-3.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shadow-inner hover:border-slate-250 transition-all"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 dark:text-white truncate">{member.nickname || '新成员'}</p>
                      <p className="text-[9px] text-slate-400 font-mono truncate mt-0.5">{member.email}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveMember(member)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/20 transition-all cursor-pointer flex-shrink-0"
                      title="移出用户组"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
