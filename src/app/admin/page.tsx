'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, User, Bot, Trash2, RefreshCw, Copy, Check, Plus, ArrowLeft, Edit3, Save, Users } from 'lucide-react'

interface UserRecord {
  id: string
  email: string
  nickname: string | null
  type: 'HUMAN' | 'AI_AGENT'
  role: 'ADMIN' | 'USER'
  insights?: string | null
  introduction?: string | null
  workflow?: string | null
  themeColor?: string | null
  chatLink?: string | null
  driveFolder?: string | null
  createdAt: string
  permittedAgents: { agent: { id: string; email: string; nickname: string | null } }[]
  assignedToHumans: { human: { id: string; email: string; nickname: string | null } }[]
}

interface InvitationResult {
  user: { id: string; email: string; type: string }
  temporaryPassword: string
  invitationLink: string
}

interface AssignmentPoolConfig {
  id: string
  enabled: boolean
  overflowPolicy: 'fallback_only' | 'pending_queue' | 'allow_soft_overflow'
  rebalancePolicy: 'manual_only' | 'scheduled_daily'
  matchingOrder: 'industry_first' | 'region_first'
  fallbackAgentId: string | null
}

interface AssignmentPoolMember {
  id: string
  agentId: string
  agentNickname: string | null
  agentEmail: string | null
  active: boolean
  capacity: number
  priority: number
  industries: string[]
  regions: string[]
  currentLoad: number
  availableSlots: number
  overloaded: boolean
}

interface AssignmentDecision {
  id: string
  subjectType: string
  subjectId: string
  matchedBy: string | null
  selectedAgentId: string | null
  reason: string | null
  overflowHandled: boolean
  fallbackUsed: boolean
  createdAt: string
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Create form
  const [email, setEmail] = useState('')
  const [type, setType] = useState('HUMAN')
  const [role, setRole] = useState('ADMIN')
  const [creating, setCreating] = useState(false)

  // Modals
  const [invitationData, setInvitationData] = useState<InvitationResult | null>(null)
  const [resetData, setResetData] = useState<{ email: string; temporaryPassword: string; invitationLink: string } | null>(null)
  const [selectedHuman, setSelectedHuman] = useState<UserRecord | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<UserRecord | null>(null)
  const [selectedAgentHumanIds, setSelectedAgentHumanIds] = useState<string[]>([])
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
  const [assignedAgentIds, setAssignedAgentIds] = useState<string[]>([])
  const [savingPerms, setSavingPerms] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [poolConfig, setPoolConfig] = useState<AssignmentPoolConfig | null>(null)
  const [poolMembers, setPoolMembers] = useState<AssignmentPoolMember[]>([])
  const [poolDecisions, setPoolDecisions] = useState<AssignmentDecision[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolDrafts, setPoolDrafts] = useState<Record<string, { capacity: number; priority: number; industries: string; regions: string }>>({})

  const fetchUsers = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  const fetchPoolData = async () => {
    setPoolLoading(true)
    try {
      const [configRes, membersRes] = await Promise.all([
        fetch('/api/admin/agent-assignment-pool/config'),
        fetch('/api/admin/agent-assignment-pool/members'),
      ])
      if (configRes.ok) setPoolConfig(await configRes.json())
      if (membersRes.ok) {
        const members = await membersRes.json() as AssignmentPoolMember[]
        setPoolMembers(members)
        setPoolDrafts(Object.fromEntries(members.map((member) => [member.agentId, {
          capacity: member.capacity,
          priority: member.priority,
          industries: member.industries.join(', '),
          regions: member.regions.join(', '),
        }])))
      }
    } finally {
      setPoolLoading(false)
    }
  }

  const fetchDecisionLogs = async () => {
    const res = await fetch('/api/admin/agent-assignment/decisions?page=1&pageSize=20')
    if (!res.ok) return
    const data = await res.json()
    setPoolDecisions(data.data || [])
  }

  useEffect(() => {
    queueMicrotask(() => {
      void fetchUsers()
      void fetchPoolData()
      void fetchDecisionLogs()
    })
  }, [])

  const createPoolMember = async (agent: UserRecord) => {
    const draft = poolDrafts[agent.id] || { capacity: 30, priority: 100, industries: '', regions: '' }
    const res = await fetch('/api/admin/agent-assignment-pool/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: agent.id,
        capacity: draft.capacity,
        priority: draft.priority,
        industries: draft.industries.split(',').map(s => s.trim()).filter(Boolean),
        regions: draft.regions.split(',').map(s => s.trim()).filter(Boolean),
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || '新增池成员失败')
      return
    }

    await fetchPoolData()
  }

  const patchPoolMember = async (member: AssignmentPoolMember, patch: Partial<AssignmentPoolMember>) => {
    const res = await fetch(`/api/admin/agent-assignment-pool/members/${member.agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || '更新池成员失败')
      return
    }
    await fetchPoolData()
  }

  const poolMemberForAgent = (agentId: string) => poolMembers.find(member => member.agentId === agentId)

  const updatePoolDraft = (agentId: string, patch: Partial<{ capacity: number; priority: number; industries: string; regions: string }>) => {
    setPoolDrafts(prev => ({
      ...prev,
      [agentId]: {
        capacity: prev[agentId]?.capacity ?? 30,
        priority: prev[agentId]?.priority ?? 100,
        industries: prev[agentId]?.industries ?? '',
        regions: prev[agentId]?.regions ?? '',
        ...patch,
      },
    }))
  }

  const openAgentEditor = (agent: UserRecord) => {
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

  const saveAgentDraft = async () => {
    if (!editingAgent) return
    setActionLoading(p => ({ ...p, [editingAgent.id + '_edit']: '1' }))
    try {
      const res = await fetch(`/api/admin/users/${editingAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || '保存 Agent 失败')
        return
      }
      setEditingAgent(null)
      await fetchUsers()
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[editingAgent.id + '_edit']; return n })
    }
  }

  const openAgentPrincipalModal = (agent: UserRecord) => {
    setSelectedAgent(agent)
    setSelectedAgentHumanIds(agent.assignedToHumans.map(link => link.human.id))
  }

  const saveAgentPrincipals = async () => {
    if (!selectedAgent) return
    setSavingPerms(true)
    try {
      for (const human of humans) {
        const currentAgentIds = human.permittedAgents.map(pa => pa.agent.id)
        const shouldHaveAgent = selectedAgentHumanIds.includes(human.id)
        const nextAgentIds = shouldHaveAgent
          ? Array.from(new Set([...currentAgentIds, selectedAgent.id]))
          : currentAgentIds.filter(id => id !== selectedAgent.id)

        if (nextAgentIds.length === currentAgentIds.length && nextAgentIds.every(id => currentAgentIds.includes(id))) continue

        const res = await fetch('/api/admin/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ humanId: human.id, agentIds: nextAgentIds }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          alert(data.error || '保存主理人分配失败')
          return
        }
      }
      setSelectedAgent(null)
      await fetchUsers()
    } finally {
      setSavingPerms(false)
    }
  }

  const deletePoolMember = async (member: AssignmentPoolMember) => {
    if (!confirm(`确认将 ${member.agentNickname || member.agentId} 从分配池移除？`)) return
    const res = await fetch(`/api/admin/agent-assignment-pool/members/${member.agentId}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || '移除池成员失败')
      return
    }
    await fetchPoolData()
  }

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type, role }),
      })
      const data = await res.json()
      if (res.ok) { setInvitationData(data); setEmail(''); fetchUsers() }
      else alert(data.error || '创建失败')
    } finally { setCreating(false) }
  }

  const handleRoleToggle = async (user: UserRecord) => {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN'
    setActionLoading(p => ({ ...p, [user.id + '_role']: '1' }))
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
    } finally { setActionLoading(p => { const n = { ...p }; delete n[user.id + '_role']; return n }) }
  }

  const handleResetPassword = async (user: UserRecord) => {
    if (!confirm(`重置 ${user.email} 的密码？`)) return
    setActionLoading(p => ({ ...p, [user.id + '_reset']: '1' }))
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetPassword: true }),
      })
      if (res.ok) {
        const data = await res.json()
        setResetData({ email: user.email, temporaryPassword: data.temporaryPassword, invitationLink: data.invitationLink })
      }
    } finally { setActionLoading(p => { const n = { ...p }; delete n[user.id + '_reset']; return n }) }
  }

  const handleDelete = async (user: UserRecord) => {
    if (!confirm(`确认删除用户 ${user.email}？此操作不可撤销。`)) return
    setActionLoading(p => ({ ...p, [user.id + '_del']: '1' }))
    try {
      const res = await fetch(user.type === 'AI_AGENT' ? `/api/agents/${user.id}` : `/api/admin/users/${user.id}`, { method: 'DELETE' })
      if (res.ok) setUsers(prev => prev.filter(u => u.id !== user.id))
      else { const d = await res.json(); alert(d.error || '删除失败') }
    } finally { setActionLoading(p => { const n = { ...p }; delete n[user.id + '_del']; return n }) }
  }

  const savePermissions = async () => {
    if (!selectedHuman) return
    setSavingPerms(true)
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ humanId: selectedHuman.id, agentIds: assignedAgentIds }),
      })
      if (res.ok) { setSelectedHuman(null); fetchUsers() }
    } finally { setSavingPerms(false) }
  }

  const humans = users.filter(u => u.type === 'HUMAN')
  const agents = users.filter(u => u.type === 'AI_AGENT')

  const RoleBadge = ({ role }: { role: string }) =>
    role === 'ADMIN' ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
        <Shield size={10} /> ADMIN
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
        <User size={10} /> USER
      </span>
    )

  const CopyField = ({ label, value, fieldKey }: { label: string; value: string; fieldKey: string }) => (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400">{label}</label>
      <div className="flex gap-2">
        <input readOnly value={value} className="flex-1 border dark:border-gray-600 bg-slate-50 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 font-mono text-sm min-w-0" />
        <button onClick={() => copyText(value, fieldKey)} className="px-3 py-2 bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-300 rounded-lg hover:bg-slate-300 dark:hover:bg-gray-600 transition flex-shrink-0">
          {copied === fieldKey ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )

  const renderInviteModal = ({ title, data, onClose }: { title: string; data: { email: string; temporaryPassword: string; invitationLink: string }; onClose: () => void }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 w-full max-w-xl rounded-2xl shadow-2xl p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">请复制邀请链接发送给用户，链接有效期 7 天</p>
        </div>
        <div className="space-y-4">
          <CopyField label="用户邮箱" value={data.email} fieldKey="modal_email" />
          <CopyField label="临时密码" value={data.temporaryPassword} fieldKey="modal_pw" />
          <CopyField label="邀请链接" value={data.invitationLink} fieldKey="modal_link" />
        </div>
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
          ⚠️ 临时密码只显示一次，请立即复制。
        </div>
        <div className="flex justify-between">
          <button
            onClick={() => copyText(`邮箱: ${data.email}\n临时密码: ${data.temporaryPassword}\n邀请链接: ${data.invitationLink}`, 'all')}
            className="px-4 py-2 text-sm border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 transition flex items-center gap-2"
          >
            {copied === 'all' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />} 复制全部
          </button>
          <button onClick={onClose} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">完成</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">用户管理</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{humans.length} 个人类用户 · {agents.length} 个 AI Agent</p>
          </div>
          <button onClick={() => router.push('/board')} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
            <ArrowLeft size={16} /> 返回看板
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Create Form */}
          <div className="md:col-span-1">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm sticky top-8">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Plus size={16} className="text-blue-500" /> 新建用户
              </h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">账号类型</label>
                  <select value={type} onChange={e => setType(e.target.value)} className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40">
                    <option value="HUMAN">人类用户</option>
                    <option value="AI_AGENT">AI Agent</option>
                  </select>
                </div>
                {type === 'HUMAN' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">初始权限</label>
                    <select value={role} onChange={e => setRole(e.target.value)} className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40">
                      <option value="ADMIN">ADMIN（管理员）</option>
                      <option value="USER">USER（普通用户）</option>
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">邮箱地址</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                </div>
                <button type="submit" disabled={creating} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition">
                  {creating ? '创建中...' : '创建并生成邀请链接'}
                </button>
              </form>
            </div>
          </div>

          {/* User Lists */}
          <div className="md:col-span-2 space-y-5">
            {/* Human Users */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <User size={15} className="text-slate-500" />
                <span className="text-sm font-black text-slate-800 dark:text-slate-100">人类用户</span>
                <span className="ml-auto text-xs text-slate-400">{humans.length} 人</span>
              </div>
              {loading ? (
                <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
              ) : humans.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">暂无人类用户</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {humans.map(user => (
                    <li key={user.id} className="px-6 py-4 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{user.email}</span>
                          <RoleBadge role={user.role} />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(user.createdAt).toLocaleDateString('zh-CN')} · {user.permittedAgents.length} 个 Agent
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => { setSelectedHuman(user); setAssignedAgentIds(user.permittedAgents.map(pa => pa.agent.id)) }} className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                          Agent 权限
                        </button>
                        <button onClick={() => handleRoleToggle(user)} disabled={!!actionLoading[user.id + '_role']} className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition disabled:opacity-50">
                          {actionLoading[user.id + '_role'] ? '...' : user.role === 'ADMIN' ? '降为 USER' : '升为 ADMIN'}
                        </button>
                        <button onClick={() => handleResetPassword(user)} disabled={!!actionLoading[user.id + '_reset']} title="重置密码" className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition disabled:opacity-50">
                          <RefreshCw size={14} className={actionLoading[user.id + '_reset'] ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => handleDelete(user)} disabled={!!actionLoading[user.id + '_del']} title="删除" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* AI Agents */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <Bot size={15} className="text-slate-500" />
                <span className="text-sm font-black text-slate-800 dark:text-slate-100">AI Agents</span>
                <span className="ml-auto text-xs text-slate-400">{agents.length} 个 · {poolMembers.length} 个在自动分配池</span>
              </div>
              {loading ? (
                <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
              ) : agents.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">暂无 AI Agent</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {agents.map(agent => {
                    const member = poolMemberForAgent(agent.id)
                    const draft = poolDrafts[agent.id] || {
                      capacity: member?.capacity ?? 30,
                      priority: member?.priority ?? 100,
                      industries: member?.industries.join(', ') ?? '',
                      regions: member?.regions.join(', ') ?? '',
                    }

                    return (
                    <li key={agent.id} className="px-6 py-4 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
                          <Bot size={14} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{agent.nickname || agent.email}</p>
                          <p className="text-[11px] text-slate-400 truncate">{agent.nickname ? agent.email : agent.id}</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            已分配主理人：{agent.assignedToHumans.length ? agent.assignedToHumans.map(link => link.human.nickname || link.human.email).join('、') : '未分配'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button onClick={() => openAgentEditor(agent)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition" title="编辑 Agent">
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => openAgentPrincipalModal(agent)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition" title="分配给 AMC 主理人">
                            <Users size={14} />
                          </button>
                          <button onClick={() => handleDelete(agent)} disabled={!!actionLoading[agent.id + '_del']} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50" title="删除 Agent">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-bold ${member ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {member ? '自动分配池中' : '未加入自动分配池'}
                          </span>
                          {member && <span className="text-slate-400">Load {member.currentLoad}/{member.capacity} · Priority {member.priority}</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          <input type="number" value={draft.capacity} onChange={e => updatePoolDraft(agent.id, { capacity: Number(e.target.value) || 30 })} placeholder="Capacity" className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs dark:text-white" />
                          <input type="number" value={draft.priority} onChange={e => updatePoolDraft(agent.id, { priority: Number(e.target.value) || 100 })} placeholder="Priority" className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs dark:text-white" />
                          <input value={draft.industries} onChange={e => updatePoolDraft(agent.id, { industries: e.target.value })} placeholder="Industries" className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs dark:text-white" />
                          <input value={draft.regions} onChange={e => updatePoolDraft(agent.id, { regions: e.target.value })} placeholder="Regions" className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs dark:text-white" />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {member ? (
                            <>
                              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                <input type="checkbox" checked={member.active} onChange={e => patchPoolMember(member, { active: e.target.checked })} /> Active
                              </label>
                              <button onClick={() => patchPoolMember(member, { capacity: draft.capacity, priority: draft.priority, industries: draft.industries.split(',').map(s => s.trim()).filter(Boolean), regions: draft.regions.split(',').map(s => s.trim()).filter(Boolean) })} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
                                <Save size={12} /> 保存池设置
                              </button>
                              <button onClick={() => deletePoolMember(member)} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-300">
                                移出分配池
                              </button>
                            </>
                          ) : (
                            <button onClick={() => createPoolMember(agent)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                              <Plus size={12} /> 添加到自动分配池
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">分配池成员</h2>
            <span className="text-xs text-slate-400">{poolMembers.length} 条</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Agent</th>
                  <th className="text-left px-4 py-2">Capacity</th>
                  <th className="text-left px-4 py-2">Load</th>
                  <th className="text-left px-4 py-2">Priority</th>
                  <th className="text-left px-4 py-2">Active</th>
                  <th className="text-left px-4 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {poolMembers.map(m => (
                  <tr key={m.agentId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{m.agentNickname || m.agentId}</div>
                      <div className="text-xs text-slate-400">{m.agentEmail || m.agentId}</div>
                    </td>
                    <td className="px-4 py-2">{m.capacity}</td>
                    <td className={`px-4 py-2 ${m.overloaded ? 'text-rose-500 font-semibold' : ''}`}>{m.currentLoad}</td>
                    <td className="px-4 py-2">{m.priority}</td>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={m.active}
                        onChange={e => patchPoolMember(m, { active: e.target.checked })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => deletePoolMember(m)} className="text-xs text-rose-500 hover:text-rose-600">移除</button>
                    </td>
                  </tr>
                ))}
                {poolMembers.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-400" colSpan={6}>暂无分配池成员</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">分配决策日志</h2>
            <button onClick={fetchDecisionLogs} className="text-xs text-blue-600 hover:text-blue-700">刷新</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">时间</th>
                  <th className="text-left px-4 py-2">类型</th>
                  <th className="text-left px-4 py-2">Subject</th>
                  <th className="text-left px-4 py-2">Agent</th>
                  <th className="text-left px-4 py-2">匹配来源</th>
                  <th className="text-left px-4 py-2">原因</th>
                </tr>
              </thead>
              <tbody>
                {poolDecisions.map(log => (
                  <tr key={log.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-2">{log.subjectType}</td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs text-slate-500">{log.subjectId.slice(0, 12)}...</span>
                    </td>
                    <td className="px-4 py-2">{log.selectedAgentId ? <span className="font-mono text-xs">{log.selectedAgentId.slice(0, 12)}...</span> : <span className="text-slate-400">(none)</span>}</td>
                    <td className="px-4 py-2">{log.matchedBy || '-'}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{log.reason || '-'}</td>
                  </tr>
                ))}
                {poolDecisions.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-400" colSpan={6}>暂无决策日志</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Agent Permission Modal */}
      {selectedHuman && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-900 dark:text-white mb-1">Agent 权限</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{selectedHuman.email}</p>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-5">
              {agents.map(agent => (
                <label key={agent.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer select-none">
                  <input type="checkbox" checked={assignedAgentIds.includes(agent.id)} onChange={() => setAssignedAgentIds(prev => prev.includes(agent.id) ? prev.filter(id => id !== agent.id) : [...prev, agent.id])} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{agent.nickname || agent.email}</p>
                    {agent.nickname && <p className="text-[11px] text-slate-400 truncate">{agent.email}</p>}
                  </div>
                </label>
              ))}
              {agents.length === 0 && <p className="text-sm text-slate-400 text-center py-4">暂无可分配的 AI Agent</p>}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setSelectedHuman(null)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">取消</button>
              <button onClick={savePermissions} disabled={savingPerms} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50">
                {savingPerms ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-900 dark:text-white mb-1">分配给 AMC 主理人</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{selectedAgent.nickname || selectedAgent.email}</p>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-5">
              {humans.map(human => (
                <label key={human.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedAgentHumanIds.includes(human.id)}
                    onChange={() => setSelectedAgentHumanIds(prev => prev.includes(human.id) ? prev.filter(id => id !== human.id) : [...prev, human.id])}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{human.nickname || human.email}</p>
                    {human.nickname && <p className="text-[11px] text-slate-400 truncate">{human.email}</p>}
                  </div>
                </label>
              ))}
              {humans.length === 0 && <p className="text-sm text-slate-400 text-center py-4">暂无可分配的主理人</p>}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setSelectedAgent(null)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">取消</button>
              <button onClick={saveAgentPrincipals} disabled={savingPerms} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50">
                {savingPerms ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-900 dark:text-white mb-1">编辑 AMC Agent</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{editingAgent.id}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500">邮箱</span>
                <input value={agentDraft.email} onChange={e => setAgentDraft(prev => ({ ...prev, email: e.target.value }))} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500">昵称</span>
                <input value={agentDraft.nickname} onChange={e => setAgentDraft(prev => ({ ...prev, nickname: e.target.value }))} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500">主题色</span>
                <input value={agentDraft.themeColor} onChange={e => setAgentDraft(prev => ({ ...prev, themeColor: e.target.value }))} placeholder="#6366f1" className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500">Chat Link</span>
                <input value={agentDraft.chatLink} onChange={e => setAgentDraft(prev => ({ ...prev, chatLink: e.target.value }))} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-bold text-slate-500">Drive Folder</span>
                <input value={agentDraft.driveFolder} onChange={e => setAgentDraft(prev => ({ ...prev, driveFolder: e.target.value }))} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-bold text-slate-500">Workflow 摘要</span>
                <textarea value={agentDraft.insights} onChange={e => setAgentDraft(prev => ({ ...prev, insights: e.target.value }))} rows={3} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-bold text-slate-500">个人简介</span>
                <textarea value={agentDraft.introduction} onChange={e => setAgentDraft(prev => ({ ...prev, introduction: e.target.value }))} rows={5} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-bold text-slate-500">执行流</span>
                <textarea value={agentDraft.workflow} onChange={e => setAgentDraft(prev => ({ ...prev, workflow: e.target.value }))} rows={5} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white" />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditingAgent(null)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">取消</button>
              <button onClick={saveAgentDraft} disabled={!!actionLoading[editingAgent.id + '_edit']} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50">
                {actionLoading[editingAgent.id + '_edit'] ? '保存中...' : '保存 Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {invitationData && (
        renderInviteModal({ title: '用户创建成功！', data: { email: invitationData.user.email, temporaryPassword: invitationData.temporaryPassword, invitationLink: invitationData.invitationLink }, onClose: () => setInvitationData(null) })
      )}
      {resetData && (
        renderInviteModal({ title: '密码已重置', data: resetData, onClose: () => setResetData(null) })
      )}
    </div>
  )
}
