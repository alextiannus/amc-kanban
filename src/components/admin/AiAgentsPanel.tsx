'use client'

import React, { useState } from 'react'
import { 
  Bot, Plus, Search, Edit3, Trash2, Key, RefreshCw, FolderOpen, Link, Save, Users, Info
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
  const [email, setEmail] = useState('')
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
  const [selectedAgent, setSelectedAgent] = useState<UserRecord | null>(null)
  const [selectedAgentHumanIds, setSelectedAgentHumanIds] = useState<string[]>([])

  const humans = users.filter(u => u.type === 'HUMAN')
  const agents = users.filter(u => u.type === 'AI_AGENT' && !['copywriter@platform.amc', 'designer@platform.amc', 'researcher@platform.amc'].includes(u.email))
  
  const filteredAgents = agents.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.nickname && u.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    onCreateUser(email.trim(), 'AI_AGENT', 'USER').then(() => {
      setEmail('')
    })
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

  const handleOpenAgentEditor = (agent: UserRecord) => {
    setEditingAgent(agent)
    setAgentDraft({
      nickname: agent.nickname || '',
      insights: agent.insights || '',
      introduction: agent.introduction || '',
      workflow: agent.workflow || '',
      themeColor: agent.themeColor || '#6366f1',
      chatLink: agent.chatLink || '',
      driveFolder: agent.driveFolder || '',
    })
  }

  const handleSaveAgentDraftLocal = async () => {
    if (!editingAgent) return
    const success = await onSaveAgentDraft(editingAgent.id, agentDraft)
    if (success) {
      setEditingAgent(null)
    }
  }

  const handleOpenPrincipalsModal = (agent: UserRecord) => {
    setSelectedAgent(agent)
    setSelectedAgentHumanIds(agent.assignedToHumans.map(link => link.human.id))
  }

  const handleSavePrincipalsLocal = async () => {
    if (!selectedAgent) return
    await onSaveAgentPrincipals(selectedAgent.id, selectedAgentHumanIds)
    setSelectedAgent(null)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
      {/* Left: Create Agent form */}
      <div className="lg:col-span-1">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-205 dark:border-slate-800 p-6 shadow-sm sticky top-6 space-y-4">
          <h3 className="text-sm font-black text-slate-855 dark:text-slate-100 flex items-center gap-2">
            <Plus size={16} className="text-blue-500" />
            <span>添加新 AI Agent 序列</span>
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Agent 标识邮箱</label>
              <input 
                required 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="例如: copywriter-ny@openclaw.ai" 
                className="w-full border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-850 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button 
              type="submit" 
              disabled={creating} 
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-650 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm rounded-xl cursor-pointer"
            >
              {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus size={13} />}
              <span>{creating ? '初始化序列中...' : '注册 AI 序列账号'}</span>
            </button>
          </form>
          <p className="text-[10px] text-slate-405 leading-relaxed font-semibold">
            提示：注册完成后，系统会为该 Agent 分配专有的 API 授权 Key，可用于对接外部 MCP 服务或者在多模型调度池中执行派单任务。
          </p>
        </div>
      </div>

      {/* Right: AI Agents list */}
      <div className="lg:col-span-2 space-y-4">
        {/* Search filter */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-202 dark:border-slate-800 p-4 shadow-sm flex items-center gap-3">
          <Search size={16} className="text-slate-400" />
          <input 
            type="text" 
            placeholder="搜索 AI 昵称、服务标识..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none dark:text-white"
          />
        </div>

        {/* List */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-202 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Bot size={15} className="text-blue-500" /> AI 代理人设序列 ({filteredAgents.length})
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-450">
              <RefreshCw className="animate-spin inline-block mr-2 text-slate-400" size={16} />
              加载 AI 员工中...
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-450">
              没有找到符合条件的 AI 代理
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAgents.map(agent => {
                const member = poolMemberForAgent(agent.id)
                const operatingBrands = uniqueBrandsFromAgentLinks(agent.brandMemberships)
                const isDeleting = !!actionLoading[agent.id + '_del']

                return (
                  <li key={agent.id} className="px-6 py-4 space-y-4 hover:bg-slate-50/30 dark:hover:bg-slate-850/10 transition-colors">
                    <div className="flex items-start gap-4 flex-col sm:flex-row justify-between">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div 
                          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner"
                          style={{ backgroundColor: agent.themeColor || '#6366f1' }}
                        >
                          <Bot size={18} className="text-white" />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-black text-slate-850 dark:text-white leading-none">{agent.nickname || '未命名 Agent'}</h4>
                            {member && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/30">
                                派单池在线: {member.currentLoad}/{member.capacity}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono leading-none truncate">{agent.email}</p>
                          <div className="space-y-0.5 pt-1 text-[10px] text-slate-450 font-bold">
                            <p>
                              <span>指派主理人:</span>{' '}
                              <span className="text-slate-700 dark:text-slate-300">
                                {agent.assignedToHumans.length 
                                  ? agent.assignedToHumans.map(link => link.human.nickname || link.human.email).join('、') 
                                  : '未指定'
                                }
                              </span>
                            </p>
                            <p>
                              <span>绑定品牌:</span>{' '}
                              <span className="text-slate-700 dark:text-slate-300">{formatBrandNames(operatingBrands)}</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-auto flex-shrink-0">
                        <button
                          onClick={() => handleOpenPrincipalsModal(agent)}
                          className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold text-slate-700 dark:text-slate-350 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer"
                        >
                          委派主理人
                        </button>

                        <button 
                          onClick={() => handleOpenAgentEditor(agent)} 
                          className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                          title="编辑人设与系统指令"
                        >
                          <Edit3 size={12} />
                        </button>
                        
                        <button 
                          onClick={() => onDeleteUser(agent)}
                          disabled={isDeleting}
                          className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-450 hover:text-rose-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                          title="删除 Agent"
                        >
                          <Trash2 size={12} className={isDeleting ? 'animate-spin' : ''} />
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

      {/* Editing Dialog Modal */}
      {editingAgent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-5 scrollbar-thin">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">配置【{editingAgent.nickname}】人设参数</h2>
              <p className="text-xs text-slate-400 mt-1">设置此 Agent 运行时的基调、系统指令及托管参数：</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Agent 昵称</span>
                <input 
                  value={agentDraft.nickname} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, nickname: e.target.value }))} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none" 
                />
              </label>
              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">主题色调 (Hex)</span>
                <input 
                  value={agentDraft.themeColor} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, themeColor: e.target.value }))} 
                  placeholder="#6366f1"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block flex items-center gap-1"><Link size={11} /> 专属网页聊天链接</span>
                <input 
                  value={agentDraft.chatLink} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, chatLink: e.target.value }))} 
                  placeholder="https://example.com/bot"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block flex items-center gap-1"><FolderOpen size={11} /> Google Drive 上传目录</span>
                <input 
                  value={agentDraft.driveFolder} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, driveFolder: e.target.value }))} 
                  placeholder="请输入 Google Drive Folder ID"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Workflow 工作摘要</span>
                <textarea 
                  value={agentDraft.insights} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, insights: e.target.value }))} 
                  rows={3} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2 text-sm dark:text-white focus:outline-none" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">人设基本描述</span>
                <textarea 
                  value={agentDraft.introduction} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, introduction: e.target.value }))} 
                  rows={3} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-955 px-3 py-2 text-sm dark:text-white focus:outline-none" 
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
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-350 hover:bg-slate-105 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSaveAgentDraftLocal}
                disabled={!!actionLoading[editingAgent.id + '_edit']}
                className="px-5 py-2 rounded-xl text-xs font-black bg-blue-650 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition-all cursor-pointer"
              >
                {actionLoading[editingAgent.id + '_edit'] ? '保存中...' : '保存 Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delegate Supervisors Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">配置【{selectedAgent.nickname || selectedAgent.email}】的主理人</h2>
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
                onClick={() => setSelectedAgent(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-350 hover:bg-slate-105 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
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
    </div>
  )
}
