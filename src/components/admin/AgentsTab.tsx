'use client'

import React, { useState } from 'react'
import { Bot, Users, Trash2, Edit3, Save, Plus, RefreshCw, Star, Info, Settings, ShieldAlert, Link, FolderOpen } from 'lucide-react'
import { type UserRecord } from './UsersTab'
import { type AssignmentPoolMember } from './PoolTab'

interface AgentsTabProps {
  agents: UserRecord[]
  poolMembers: AssignmentPoolMember[]
  poolDrafts: Record<string, { capacity: number; priority: number; industries: string; regions: string }>
  actionLoading: Record<string, string>
  loading: boolean
  humans: UserRecord[]
  savingPerms: boolean
  onUpdatePoolDraft: (agentId: string, patch: any) => void
  onPatchPoolMember: (member: AssignmentPoolMember, patch: any) => Promise<void>
  onDeletePoolMember: (member: AssignmentPoolMember) => Promise<void>
  onCreatePoolMember: (agent: UserRecord) => Promise<void>
  onDeleteAgent: (user: UserRecord) => Promise<void>
  onSaveAgentPrincipals: (agentId: string, humanIds: string[]) => Promise<void>
  onSaveAgentDraft: (agentId: string, draft: any) => Promise<boolean>
  onFetchUsers: () => Promise<void>
}

export default function AgentsTab({
  agents,
  poolMembers,
  poolDrafts,
  actionLoading,
  loading,
  humans,
  savingPerms,
  onUpdatePoolDraft,
  onPatchPoolMember,
  onDeletePoolMember,
  onCreatePoolMember,
  onDeleteAgent,
  onSaveAgentPrincipals,
  onSaveAgentDraft,
  onFetchUsers
}: AgentsTabProps) {
  const [editingAgent, setEditingAgent] = useState<UserRecord | null>(null)
  const [agentDraft, setAgentDraft] = useState({
    email: '',
    nickname: '',
    insights: '',
    introduction: '',
    workflow: '',
    themeColor: '',
    chatLink: '',
    driveFolder: '',
  })

  // Principal Selection Modal state
  const [selectedAgent, setSelectedAgent] = useState<UserRecord | null>(null)
  const [selectedAgentHumanIds, setSelectedAgentHumanIds] = useState<string[]>([])

  const poolMemberForAgent = (agentId: string) => poolMembers.find(member => member.agentId === agentId)

  const formatBrandNames = (brandsList: { name: string }[], max = 3) => {
    if (brandsList.length === 0) return '暂无绑定品牌'
    const head = brandsList.slice(0, max).map((brand) => brand.name).join('、')
    return brandsList.length > max ? `${head} 等 ${brandsList.length} 个品牌` : head
  }

  const uniqueBrandsFromAgentLinks = (links: { brand: { id: string; name: string; status: string } }[] = []) => {
    const map = new Map<string, { id: string; name: string; status: string }>()
    for (const link of links) map.set(link.brand.id, link.brand)
    return Array.from(map.values())
  }

  const handleOpenEditor = (agent: UserRecord) => {
    setEditingAgent(agent)
    setAgentDraft({
      email: agent.email,
      nickname: agent.nickname || '',
      insights: agent.insights || '',
      introduction: agent.introduction || '',
      workflow: agent.workflow || '',
      themeColor: agent.themeColor || '',
      chatLink: agent.chatLink || '',
      driveFolder: agent.driveFolder || '',
    })
  }

  const handleOpenPrincipals = (agent: UserRecord) => {
    setSelectedAgent(agent)
    setSelectedAgentHumanIds(agent.assignedToHumans.map(link => link.human.id))
  }

  const handleSaveDraft = async () => {
    if (!editingAgent) return
    const success = await onSaveAgentDraft(editingAgent.id, agentDraft)
    if (success) {
      setEditingAgent(null)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Bot size={18} className="text-indigo-500" /> AI 代理人配置 (AI Agents Registry)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            在此管理 AI 员工的身份（昵称、主题色）、专属工作指令（个人简介、工作流、摘要），以及设定其在自动分配池中的负荷上限与标签属性。
          </p>
        </div>
        <button 
          onClick={onFetchUsers} 
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 transition-all cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>刷新</span>
        </button>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-450 shadow-sm">
          <RefreshCw className="animate-spin inline-block mr-2 text-slate-450" size={18} />
          加载 AI 员工中...
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-450 shadow-sm">
          暂无已注册的 AI Agent 账号，请在“新建用户”中选择类型为 AI Agent 注册。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {agents.map((agent) => {
            const member = poolMemberForAgent(agent.id)
            const operatingBrands = uniqueBrandsFromAgentLinks(agent.brandMemberships)
            const draft = poolDrafts[agent.id] || {
              capacity: member?.capacity ?? 30,
              priority: member?.priority ?? 100,
              industries: member?.industries.join(', ') ?? '',
              regions: member?.regions.join(', ') ?? '',
            }
            const isDeleting = !!actionLoading[agent.id + '_del']
            const isSavingPool = !!actionLoading[agent.id + '_pool']

            return (
              <div 
                key={agent.id} 
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200"
              >
                {/* Agent Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-start gap-4">
                    <div 
                      className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner"
                      style={{ backgroundColor: agent.themeColor || '#6366f1' }}
                    >
                      <Bot size={22} className="text-white" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-black text-slate-850 dark:text-white leading-none">{agent.nickname || '未命名 Agent'}</h3>
                        {agent.themeColor && (
                          <span className="text-[9px] font-mono font-bold bg-slate-105 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                            {agent.themeColor}
                          </span>
                        )}
                        {member && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/30">
                            已加入调度池
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium font-mono">{agent.email}</p>
                      <div className="space-y-0.5 pt-1 text-[11px] text-slate-500 dark:text-slate-450">
                        <p>
                          <span className="text-slate-400">负责主理人 (Humans):</span>{' '}
                          {agent.assignedToHumans.length 
                            ? agent.assignedToHumans.map(link => link.human.nickname || link.human.email).join('、') 
                            : '未指定'
                          }
                        </p>
                        <p>
                          <span className="text-slate-400">负责品牌 (Brands):</span>{' '}
                          {formatBrandNames(operatingBrands)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end md:self-auto">
                    <button 
                      onClick={() => handleOpenEditor(agent)} 
                      className="inline-flex items-center gap-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer"
                      title="编辑工作提示词"
                    >
                      <Edit3 size={13} className="text-indigo-500" />
                      <span>配置工作流</span>
                    </button>
                    <button 
                      onClick={() => handleOpenPrincipals(agent)} 
                      className="inline-flex items-center gap-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer"
                      title="关联人类主理人"
                    >
                      <Users size={13} className="text-emerald-500" />
                      <span>分配人类</span>
                    </button>
                    <button 
                      onClick={() => onDeleteAgent(agent)} 
                      disabled={isDeleting} 
                      className="inline-flex items-center gap-1 px-3 py-2 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-white hover:bg-rose-50 dark:bg-slate-900 dark:hover:bg-rose-950/20 transition-all disabled:opacity-50 cursor-pointer"
                      title="删除 AI 员工"
                    >
                      <Trash2 size={13} />
                      <span>删除</span>
                    </button>
                  </div>
                </div>

                {/* Display brief content summaries */}
                {(agent.introduction || agent.workflow) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {agent.introduction && (
                      <div className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-150/60 dark:border-slate-850 p-4 rounded-2xl space-y-1.5">
                        <p className="font-bold text-slate-500 flex items-center gap-1"><Info size={12} /> 个人设定 (Introduction)</p>
                        <p className="text-slate-650 dark:text-slate-400 leading-relaxed line-clamp-3 whitespace-pre-wrap">{agent.introduction}</p>
                      </div>
                    )}
                    {agent.workflow && (
                      <div className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-150/60 dark:border-slate-850 p-4 rounded-2xl space-y-1.5">
                        <p className="font-bold text-slate-500 flex items-center gap-1"><Settings size={12} /> 工作执行流 (Workflow)</p>
                        <p className="text-slate-650 dark:text-slate-400 leading-relaxed line-clamp-3 whitespace-pre-wrap">{agent.workflow}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Dispatch settings */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/45 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-150 dark:border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                        member 
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border-emerald-100 dark:border-emerald-900/30' 
                          : 'bg-slate-250 text-slate-600 dark:bg-slate-800 dark:text-slate-350 border-slate-350 dark:border-slate-700'
                      }`}>
                        {member ? '自动分配已激活' : '自动分配未激活'}
                      </span>
                      {member && (
                        <span className="text-[11px] text-slate-400 font-bold">
                          实时负载: {member.currentLoad}/{member.capacity} (个商户) · 分配权重: {member.priority}
                        </span>
                      )}
                    </div>
                    {member && (
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-2 text-xs font-black text-slate-600 dark:text-slate-300 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={member.active} 
                            onChange={e => onPatchPoolMember(member, { active: e.target.checked })} 
                            className="rounded border-slate-350 text-indigo-650 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                          /> 
                          <span>状态在线</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="space-y-1 block">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">负荷上限 (Capacity)</span>
                      <input 
                        type="number" 
                        value={draft.capacity} 
                        onChange={e => onUpdatePoolDraft(agent.id, { capacity: Number(e.target.value) || 30 })} 
                        placeholder="最大承接商户数" 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">分配优先级 (Priority)</span>
                      <input 
                        type="number" 
                        value={draft.priority} 
                        onChange={e => onUpdatePoolDraft(agent.id, { priority: Number(e.target.value) || 100 })} 
                        placeholder="数字越大越优先分配" 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">擅长行业 (Industries)</span>
                      <input 
                        type="text" 
                        value={draft.industries} 
                        onChange={e => onUpdatePoolDraft(agent.id, { industries: e.target.value })} 
                        placeholder="逗号分隔，例如: fnb, cafe" 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">擅长地区 (Regions)</span>
                      <input 
                        type="text" 
                        value={draft.regions} 
                        onChange={e => onUpdatePoolDraft(agent.id, { regions: e.target.value })} 
                        placeholder="逗号分隔，例如: singapore, kl" 
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    {member ? (
                      <>
                        <button 
                          onClick={() => onPatchPoolMember(member, { capacity: draft.capacity, priority: draft.priority, industries: draft.industries.split(',').map(s => s.trim()).filter(Boolean), regions: draft.regions.split(',').map(s => s.trim()).filter(Boolean) })} 
                          disabled={isSavingPool}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm cursor-pointer"
                        >
                          <Save size={12} />
                          <span>保存调度策略</span>
                        </button>
                        <button 
                          onClick={() => onDeletePoolMember(member)} 
                          className="px-4 py-2 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-white hover:bg-rose-50 dark:bg-slate-900 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                        >
                          移出自动分配池
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => onCreatePoolMember(agent)} 
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-all shadow-sm cursor-pointer"
                      >
                        <Plus size={12} />
                        <span>添加到自动分配池</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Editing Agent Workflow Prompts Modal */}
      {editingAgent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-5 scrollbar-thin">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Settings size={18} className="text-indigo-500" />
                <span>配置 AI Agent 提示词设定</span>
              </h2>
              <p className="text-[10px] font-mono text-slate-400 mt-1">ID: {editingAgent.id}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">对外绑定邮箱</span>
                <input 
                  value={agentDraft.email} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, email: e.target.value }))} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                />
              </label>
              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">AI 员工昵称</span>
                <input 
                  value={agentDraft.nickname} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, nickname: e.target.value }))} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                />
              </label>
              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">主题色 (支持 HEX, 例: #6366f1)</span>
                <div className="flex gap-2">
                  <div 
                    className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner flex-shrink-0"
                    style={{ backgroundColor: agentDraft.themeColor || '#6366f1' }}
                  />
                  <input 
                    value={agentDraft.themeColor} 
                    onChange={e => setAgentDraft(prev => ({ ...prev, themeColor: e.target.value }))} 
                    placeholder="#6366f1" 
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                  />
                </div>
              </label>
              <label className="space-y-1.5 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block flex items-center gap-1"><Link size={11} /> 语音聊天机器人链接 (Chat Link)</span>
                <input 
                  value={agentDraft.chatLink} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, chatLink: e.target.value }))} 
                  placeholder="https://example.com/bot"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block flex items-center gap-1"><FolderOpen size={11} /> 对应 Google Drive 上传目录</span>
                <input 
                  value={agentDraft.driveFolder} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, driveFolder: e.target.value }))} 
                  placeholder="请输入 Google Drive Folder ID"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Workflow 工作摘要</span>
                <textarea 
                  value={agentDraft.insights} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, insights: e.target.value }))} 
                  rows={3} 
                  placeholder="给主理人或BD看的工作摘要简述"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">个人基本设定 / 角色扮演人设</span>
                <textarea 
                  value={agentDraft.introduction} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, introduction: e.target.value }))} 
                  rows={4} 
                  placeholder="你是一个专业的文案策划员工，名字是..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y" 
                />
              </label>
              <label className="space-y-1.5 md:col-span-2 block">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">工作流系统指令 (System Prompts / Execution Flow)</span>
                <textarea 
                  value={agentDraft.workflow} 
                  onChange={e => setAgentDraft(prev => ({ ...prev, workflow: e.target.value }))} 
                  rows={4} 
                  placeholder="你的日常工作执行流程：第一步收集素材；第二步确认品牌基调..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y" 
                />
              </label>
            </div>
            
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setEditingAgent(null)} 
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900"
              >
                取消
              </button>
              <button 
                onClick={handleSaveDraft} 
                disabled={!!actionLoading[editingAgent.id + '_edit']} 
                className="px-5 py-2 rounded-xl text-xs font-black bg-blue-650 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition-all"
              >
                {actionLoading[editingAgent.id + '_edit'] ? '保存中...' : '保存 Agent 配置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Human Assignment permissions modal */}
      {selectedAgent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4 border border-slate-150 dark:border-slate-850">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">配置人类主理人 (AMC Principals)</h2>
              <p className="text-xs text-slate-400 mt-1">关联或分配谁作为 <b>{selectedAgent.nickname || selectedAgent.email}</b> 的人类主理人监督者：</p>
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-100 dark:border-slate-800 rounded-xl p-3 scrollbar-thin">
              {humans.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">暂无人类主理人账号，请在“新建用户”中创建</p>
              ) : (
                humans.map(human => (
                  <label key={human.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-all">
                    <input
                      type="checkbox"
                      checked={selectedAgentHumanIds.includes(human.id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedAgentHumanIds(prev => [...prev, human.id])
                        else setSelectedAgentHumanIds(prev => prev.filter(id => id !== human.id))
                      }}
                      className="rounded border-slate-350 dark:border-slate-700 text-indigo-650 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="text-xs">
                      <p className="font-extrabold text-slate-750 dark:text-slate-200">{human.nickname || '未命名主理人'}</p>
                      <p className="text-[10px] text-slate-400">{human.email}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setSelectedAgent(null)} 
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await onSaveAgentPrincipals(selectedAgent.id, selectedAgentHumanIds)
                  setSelectedAgent(null)
                }}
                disabled={savingPerms}
                className="px-5 py-2 rounded-xl text-xs font-black bg-blue-650 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition-all"
              >
                {savingPerms ? '保存中...' : '保存关联'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
