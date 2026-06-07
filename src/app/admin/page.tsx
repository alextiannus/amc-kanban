'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, User, Bot, Trash2, RefreshCw, Copy, Check, Plus, ArrowLeft } from 'lucide-react'

interface UserRecord {
  id: string
  email: string
  nickname: string | null
  type: 'HUMAN' | 'AI_AGENT'
  role: 'ADMIN' | 'USER'
  createdAt: string
  permittedAgents: { agent: { id: string; email: string; nickname: string | null } }[]
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
  const [assignedAgentIds, setAssignedAgentIds] = useState<string[]>([])
  const [savingPerms, setSavingPerms] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [poolConfig, setPoolConfig] = useState<AssignmentPoolConfig | null>(null)
  const [poolMembers, setPoolMembers] = useState<AssignmentPoolMember[]>([])
  const [poolDecisions, setPoolDecisions] = useState<AssignmentDecision[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolSaving, setPoolSaving] = useState(false)
  const [newPoolAgentId, setNewPoolAgentId] = useState('')
  const [newPoolCapacity, setNewPoolCapacity] = useState(30)
  const [newPoolPriority, setNewPoolPriority] = useState(100)
  const [newPoolIndustries, setNewPoolIndustries] = useState('')
  const [newPoolRegions, setNewPoolRegions] = useState('')

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
      if (membersRes.ok) setPoolMembers(await membersRes.json())
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

  const savePoolConfig = async () => {
    if (!poolConfig) return
    setPoolSaving(true)
    try {
      const res = await fetch('/api/admin/agent-assignment-pool/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: poolConfig.enabled,
          overflowPolicy: poolConfig.overflowPolicy,
          rebalancePolicy: poolConfig.rebalancePolicy,
          matchingOrder: poolConfig.matchingOrder,
          fallbackAgentId: poolConfig.fallbackAgentId,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '保存分配池配置失败')
        return
      }
      await fetchPoolData()
      await fetchDecisionLogs()
    } finally {
      setPoolSaving(false)
    }
  }

  const createPoolMember = async () => {
    if (!newPoolAgentId.trim()) {
      alert('请填写 agentId')
      return
    }

    const res = await fetch('/api/admin/agent-assignment-pool/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: newPoolAgentId.trim(),
        capacity: newPoolCapacity,
        priority: newPoolPriority,
        industries: newPoolIndustries.split(',').map(s => s.trim()).filter(Boolean),
        regions: newPoolRegions.split(',').map(s => s.trim()).filter(Boolean),
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || '新增池成员失败')
      return
    }

    setNewPoolAgentId('')
    setNewPoolIndustries('')
    setNewPoolRegions('')
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
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
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
                <span className="ml-auto text-xs text-slate-400">{agents.length} 个</span>
              </div>
              {loading ? (
                <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
              ) : agents.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">暂无 AI Agent</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {agents.map(agent => (
                    <li key={agent.id} className="px-6 py-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
                        <Bot size={14} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{agent.nickname || agent.email}</p>
                        <p className="text-[11px] text-slate-400 truncate">{agent.nickname ? agent.email : agent.id}</p>
                      </div>
                      <button onClick={() => handleDelete(agent)} disabled={!!actionLoading[agent.id + '_del']} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">Agent 分配池配置</h2>
              <button onClick={fetchPoolData} className="text-xs text-blue-600 hover:text-blue-700">刷新</button>
            </div>
            {poolLoading || !poolConfig ? (
              <p className="text-sm text-slate-400">加载中...</p>
            ) : (
              <div className="space-y-3">
                <label className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
                  启用自动分配
                  <input
                    type="checkbox"
                    checked={poolConfig.enabled}
                    onChange={e => setPoolConfig({ ...poolConfig, enabled: e.target.checked })}
                  />
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">overflowPolicy</label>
                    <select
                      value={poolConfig.overflowPolicy}
                      onChange={e => setPoolConfig({ ...poolConfig, overflowPolicy: e.target.value as AssignmentPoolConfig['overflowPolicy'] })}
                      className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-2 text-sm"
                    >
                      <option value="fallback_only">fallback_only</option>
                      <option value="pending_queue">pending_queue</option>
                      <option value="allow_soft_overflow">allow_soft_overflow</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">rebalancePolicy</label>
                    <select
                      value={poolConfig.rebalancePolicy}
                      onChange={e => setPoolConfig({ ...poolConfig, rebalancePolicy: e.target.value as AssignmentPoolConfig['rebalancePolicy'] })}
                      className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-2 text-sm"
                    >
                      <option value="manual_only">manual_only</option>
                      <option value="scheduled_daily">scheduled_daily</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">matchingOrder</label>
                    <select
                      value={poolConfig.matchingOrder}
                      onChange={e => setPoolConfig({ ...poolConfig, matchingOrder: e.target.value as AssignmentPoolConfig['matchingOrder'] })}
                      className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-2 text-sm"
                    >
                      <option value="industry_first">industry_first</option>
                      <option value="region_first">region_first</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">fallbackAgentId</label>
                    <select
                      value={poolConfig.fallbackAgentId || ''}
                      onChange={e => setPoolConfig({ ...poolConfig, fallbackAgentId: e.target.value || null })}
                      className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-2 text-sm"
                    >
                      <option value="">(none)</option>
                      {poolMembers.map(m => (
                        <option key={m.agentId} value={m.agentId}>
                          {m.agentNickname || m.agentId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={savePoolConfig}
                  disabled={poolSaving}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {poolSaving ? '保存中...' : '保存分配池配置'}
                </button>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">新增池成员</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={newPoolAgentId}
                onChange={e => setNewPoolAgentId(e.target.value)}
                placeholder="agentId"
                className="border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={newPoolCapacity}
                onChange={e => setNewPoolCapacity(Number(e.target.value) || 30)}
                placeholder="capacity"
                className="border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={newPoolPriority}
                onChange={e => setNewPoolPriority(Number(e.target.value) || 100)}
                placeholder="priority"
                className="border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={newPoolIndustries}
                onChange={e => setNewPoolIndustries(e.target.value)}
                placeholder="industries: food,beauty"
                className="border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={newPoolRegions}
                onChange={e => setNewPoolRegions(e.target.value)}
                placeholder="regions: sg,new york"
                className="border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm md:col-span-2"
              />
            </div>
            <button onClick={createPoolMember} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
              添加到分配池
            </button>
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

      {invitationData && (
        renderInviteModal({ title: '用户创建成功！', data: { email: invitationData.user.email, temporaryPassword: invitationData.temporaryPassword, invitationLink: invitationData.invitationLink }, onClose: () => setInvitationData(null) })
      )}
      {resetData && (
        renderInviteModal({ title: '密码已重置', data: resetData, onClose: () => setResetData(null) })
      )}
    </div>
  )
}
