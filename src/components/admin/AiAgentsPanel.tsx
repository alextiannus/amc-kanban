'use client'

import React, { useState } from 'react'
import { 
  Bot, Plus, Search, Edit3, Trash2, Key, RefreshCw, FolderOpen, Link, Save, Users, Info, Bot as BotIcon, AlertCircle
} from 'lucide-react'
import { type UserRecord } from './UsersTab'
import { type AssignmentPoolMember } from '@/components/shared/types'

interface AiAgentsPanelProps {
  users: UserRecord[]
  loading: boolean
  creating: boolean
  actionLoading: Record<string, string>
  onCreateUser: (email: string, type: string, role: string) => Promise<void>
  onDeleteUser: (user: UserRecord) => Promise<void>
  onSaveAgentPrincipals: (agentId: string, humanIds: string[]) => Promise<void>
  onSaveAgentDraft: (agentId: string, draft: any) => Promise<boolean>
  onFetchUsers: () => Promise<void>
  savingPerms: boolean

  // Pool management
  poolMembers: AssignmentPoolMember[]
  poolDrafts: Record<string, { capacity: number; priority: number; industries: string; regions: string }>
  onUpdatePoolDraft: (agentId: string, patch: any) => void
  onPatchPoolMember: (member: AssignmentPoolMember, patch: any) => Promise<void>
  onDeletePoolMember: (member: AssignmentPoolMember) => Promise<void>
  onCreatePoolMember: (agent: UserRecord) => Promise<void>
}

export default function AiAgentsPanel({
  users,
  loading,
  creating,
  actionLoading,
  onCreateUser,
  onDeleteUser,
  onSaveAgentPrincipals,
  onSaveAgentDraft,
  onFetchUsers,
  savingPerms,
  poolMembers,
  poolDrafts,
  onUpdatePoolDraft,
  onPatchPoolMember,
  onDeletePoolMember,
  onCreatePoolMember
}: AiAgentsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [editingAgent, setEditingAgent] = useState<UserRecord | null>(null)
  const [agentDraft, setAgentDraft] = useState({
    nickname: '',
    insights: '',
    introduction: '',
    workflow: '',
    themeColor: '',
    chatLink: '',
    driveFolder: '',
  })

  // Supervisor Selection State
  const [selectedAgentForPrincipals, setSelectedAgentForPrincipals] = useState<UserRecord | null>(null)
  const [selectedAgentHumanIds, setSelectedAgentHumanIds] = useState<string[]>([])

  const humans = users.filter(u => u.type === 'HUMAN')
  const agents = users.filter(u => u.type === 'AI_AGENT' && !['copywriter@platform.amc', 'designer@platform.amc', 'researcher@platform.amc'].includes(u.email))
  
  const filteredAgents = agents.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.nickname && u.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const selectedAgent = agents.find(a => a.id === selectedAgentId)

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return
    await onCreateUser(newEmail.trim(), 'AI_AGENT', 'USER')
    setNewEmail('')
    setShowCreateModal(false)
  }

  const poolMemberForAgent = (agentId: string) => poolMembers.find(member => member.agentId === agentId)

  const uniqueBrandsFromAgentLinks = (links: { brand: { id: string; name: string; status: string } }[] = []) => {
    const map = new Map<string, { id: string; name: string; status: string }>()
    for (const link of links) map.set(link.brand.id, link.brand)
    return Array.from(map.values())
  }

  const formatBrandNames = (brandsList: { name: string }[], max = 2) => {
    if (brandsList.length === 0) return '暂无绑定品牌'
    const head = brandsList.slice(0, max).map((brand) => brand.name).join('、')
    return brandsList.length > max ? `${head} 等 ${brandsList.length} 个` : head
  }

  const handleOpenAgentEditor = () => {
    if (!selectedAgent) return
    setEditingAgent(selectedAgent)
    setAgentDraft({
      nickname: selectedAgent.nickname || '',
      insights: selectedAgent.insights || '',
      introduction: selectedAgent.introduction || '',
      workflow: selectedAgent.workflow || '',
      themeColor: selectedAgent.themeColor || '#6366f1',
      chatLink: selectedAgent.chatLink || '',
      driveFolder: selectedAgent.driveFolder || '',
    })
  }

  const handleSaveAgentDraftLocal = async () => {
    if (!editingAgent) return
    const success = await onSaveAgentDraft(editingAgent.id, agentDraft)
    if (success) {
      setEditingAgent(null)
    }
  }

  const handleOpenPrincipalsModal = () => {
    if (!selectedAgent) return
    setSelectedAgentForPrincipals(selectedAgent)
    setSelectedAgentHumanIds(selectedAgent.assignedToHumans.map(link => link.human.id))
  }

  const handleSavePrincipalsLocal = async () => {
    if (!selectedAgentForPrincipals) return
    await onSaveAgentPrincipals(selectedAgentForPrincipals.id, selectedAgentHumanIds)
    setSelectedAgentForPrincipals(null)
  }

  const handleDeleteAgentLocal = async () => {
    if (!selectedAgent) return
    await onDeleteUser(selectedAgent)
    setSelectedAgentId(null)
    setShowDeleteConfirm(false)
  }

  return (
    <div className="space-y-4">
      {/* Top Action Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="搜索 AI 昵称、服务标识..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-55 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Create Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1 px-3.5 py-2 bg-blue-650 hover:bg-blue-700 text-white font-extrabold text-xs transition-all shadow-sm rounded-xl cursor-pointer"
          >
            <Plus size={13} />
            <span>新建 AI 序列</span>
          </button>

          {/* Edit Prompt Button */}
          <button
            onClick={handleOpenAgentEditor}
            disabled={!selectedAgentId}
            className="inline-flex items-center gap-1 px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer shadow-sm"
          >
            <Edit3 size={13} className="text-blue-500" />
            <span>配置人设指令</span>
          </button>

          {/* Delegate Principal Button */}
          <button
            onClick={handleOpenPrincipalsModal}
            disabled={!selectedAgentId}
            className="inline-flex items-center gap-1 px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 disabled:opacity-40 transition-all cursor-pointer shadow-sm"
          >
            <Users size={13} className="text-indigo-500" />
            <span>委派主理人</span>
          </button>

          {/* Delete Button */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!selectedAgentId || !!actionLoading[selectedAgentId + '_del']}
            className="inline-flex items-center gap-1 px-3.5 py-2 border border-rose-150 dark:border-rose-955 bg-rose-50 hover:bg-rose-100 dark:bg-rose-955/20 text-rose-600 dark:text-rose-455 disabled:opacity-40 transition-all shadow-sm rounded-xl cursor-pointer"
          >
            <Trash2 size={13} />
            <span>删除序列</span>
          </button>
        </div>
      </div>

      {/* Selection Active Banner */}
      {selectedAgent && (
        <div className="bg-blue-50/50 dark:bg-slate-900/30 border border-blue-100 dark:border-slate-800 px-4 py-2.5 rounded-xl text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-550 animate-ping" />
            已选择 AI 序列：<strong className="text-slate-850 dark:text-slate-200">{selectedAgent.nickname || selectedAgent.email}</strong>（{selectedAgent.email}）
          </span>
          <button onClick={() => setSelectedAgentId(null)} className="text-blue-650 hover:underline dark:text-blue-400 cursor-pointer">清除选择</button>
        </div>
      )}

      {/* Main Table List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-202 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-450">
            <RefreshCw className="animate-spin inline-block mr-2 text-slate-400" size={16} />
            正在载入 AI 序列列表...
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-450">
            暂无 AI 员工代理序列数据，请在上方“新建 AI 序列”
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-905 text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="w-12 px-4 py-3 text-center">选择</th>
                  <th className="text-left px-4 py-3">昵称 / 人设名称</th>
                  <th className="text-left px-4 py-3">服务识别邮箱</th>
                  <th className="text-left px-4 py-3">指派人类主理人</th>
                  <th className="text-left px-4 py-3">绑定托管品牌</th>
                  <th className="text-left px-4 py-3">智能派单负荷</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-300">
                {filteredAgents.map(agent => {
                  const isSelected = selectedAgentId === agent.id
                  const member = poolMemberForAgent(agent.id)
                  const operatingBrands = uniqueBrandsFromAgentLinks(agent.brandMemberships)

                  return (
                    <tr
                      key={agent.id}
                      onClick={() => setSelectedAgentId(isSelected ? null : agent.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-blue-50/30 dark:bg-slate-800/40 border-l-2 border-l-blue-600' 
                          : 'hover:bg-slate-50/30 dark:hover:bg-slate-850/10'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5 text-center">
                        <input 
                          type="radio" 
                          checked={isSelected}
                          onChange={() => {}} // Controlled by row onClick
                          className="w-3.5 h-3.5 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Nickname & Avatar */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-5.5 h-5.5 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: agent.themeColor || '#6366f1' }}
                          >
                            <Bot size={11} className="text-white" />
                          </div>
                          <span className="font-black text-slate-850 dark:text-white">
                            {agent.nickname || '未命名 Agent'}
                          </span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3.5 font-mono text-slate-400">
                        {agent.email}
                      </td>

                      {/* Supervisors */}
                      <td className="px-4 py-3.5 font-bold text-slate-700 dark:text-slate-350">
                        {agent.assignedToHumans.length 
                          ? agent.assignedToHumans.map(link => link.human.nickname || link.human.email).join('、') 
                          : '未指定主理人'
                        }
                      </td>

                      {/* Operating Brands */}
                      <td className="px-4 py-3.5 font-medium text-slate-405">
                        {formatBrandNames(operatingBrands)}
                      </td>

                      {/* Load */}
                      <td className="px-4 py-3.5">
                        {member ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">
                            在线: {member.currentLoad}/{member.capacity}
                          </span>
                        ) : (
                          <span className="text-slate-400">池外</span>
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

      {/* Modal 1: 新建 AI 序列 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <BotIcon size={16} className="text-blue-500" />
                <span>注册 AI 代理人设序列</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">设置专有的标识邮箱以创建全新的 AI 员工序列，注册后系统会自动发放 API 授权凭证。</p>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Agent 标识邮箱</label>
                <input 
                  required 
                  type="email" 
                  value={newEmail} 
                  onChange={e => setNewEmail(e.target.value)} 
                  placeholder="例如: brand-assistant@openclaw.ai" 
                  className="w-full border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-850 dark:text-white rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-555 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-blue-650 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {creating ? '初始化中...' : '注册 AI 序列'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: 详情人设修改 */}
      {editingAgent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-5 scrollbar-thin">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Edit3 size={15} className="text-indigo-500" />
                <span>配置【{editingAgent.nickname || editingAgent.email}】人设与系统指令</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">设置此 Agent 运行时的语气人设、敏感规避以及系统指令：</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Agent 昵称</span>
                <input 
                  value={agentDraft.nickname} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, nickname: e.target.value }))} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none" 
                />
              </label>
              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">主题色调 (Hex)</span>
                <input 
                  value={agentDraft.themeColor} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, themeColor: e.target.value }))} 
                  placeholder="#6366f1"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block flex items-center gap-1"><Link size={11} /> 专属网页聊天链接</span>
                <input 
                  value={agentDraft.chatLink} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, chatLink: e.target.value }))} 
                  placeholder="https://example.com/bot"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block flex items-center gap-1"><FolderOpen size={11} /> Google Drive 上传目录</span>
                <input 
                  value={agentDraft.driveFolder} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, driveFolder: e.target.value }))} 
                  placeholder="请输入 Google Drive Folder ID"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Workflow 工作摘要</span>
                <textarea 
                  value={agentDraft.insights} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, insights: e.target.value }))} 
                  rows={2} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2 text-xs dark:text-white focus:outline-none resize-none" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">人设基本描述</span>
                <textarea 
                  value={agentDraft.introduction} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, introduction: e.target.value }))} 
                  rows={2} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2 text-xs dark:text-white focus:outline-none" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">系统提示词指令 (System Prompts)</span>
                <textarea 
                  value={agentDraft.workflow} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, workflow: e.target.value }))} 
                  rows={5} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2 text-xs font-mono dark:text-white focus:outline-none leading-relaxed" 
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingAgent(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-555 dark:text-slate-350 hover:bg-slate-105 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSaveAgentDraftLocal}
                disabled={!!actionLoading[editingAgent.id + '_edit']}
                className="px-5 py-2 rounded-xl text-xs font-black bg-blue-650 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition-all cursor-pointer"
              >
                {actionLoading[editingAgent.id + '_edit'] ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Delegate Supervisors Modal */}
      {selectedAgentForPrincipals && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Users size={16} className="text-blue-500" />
                <span>配置【{selectedAgentForPrincipals.nickname || selectedAgentForPrincipals.email}】的主理人</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">选择指派监管此 Agent 的人类运营主理人：</p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
              {humans.length === 0 ? (
                <p className="text-xs text-slate-450 py-4 text-center">暂无人类主理人账号</p>
              ) : (
                humans.map(human => {
                  const isChecked = selectedAgentHumanIds.includes(human.id)
                  return (
                    <label 
                      key={human.id}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-bold cursor-pointer transition-all bg-white dark:bg-slate-905 ${
                        isChecked 
                          ? 'border-indigo-500 ring-1 ring-indigo-500/20 text-indigo-750 dark:text-indigo-300 font-extrabold' 
                          : 'border-slate-150 dark:border-slate-800 text-slate-650 dark:text-slate-405 hover:bg-slate-50/30'
                      }`}
                    >
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const nextIds = isChecked
                            ? selectedAgentHumanIds.filter(id => id !== human.id)
                            : [...selectedAgentHumanIds, human.id]
                          setSelectedAgentHumanIds(nextIds)
                        }}
                        className="rounded border-slate-350 text-indigo-650 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <span>{human.nickname || human.email}</span>
                    </label>
                  )
                })
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedAgentForPrincipals(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-555 dark:text-slate-355 hover:bg-slate-105 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSavePrincipalsLocal}
                disabled={savingPerms}
                className="px-5 py-2 rounded-xl text-xs font-black bg-blue-650 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {savingPerms ? '保存中...' : '保存主理人'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: 删除 Agent 确认 */}
      {showDeleteConfirm && selectedAgent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-rose-500">
              <AlertCircle size={20} />
              <h2 className="text-base font-black">删除 AI 序列确认</h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              确认要彻底删除 AI 员工序列账户 <strong className="text-slate-850 dark:text-white">{selectedAgent.nickname || selectedAgent.email}</strong> 吗？
              删除后其绑定的派单关系和人设将彻底被清除，此操作不可恢复。
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-555 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleDeleteAgentLocal}
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
