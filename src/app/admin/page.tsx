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

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
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

  const InviteModal = ({ title, data, onClose }: { title: string; data: { email: string; temporaryPassword: string; invitationLink: string }; onClose: () => void }) => (
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
        <InviteModal title="用户创建成功！" data={{ email: invitationData.user.email, temporaryPassword: invitationData.temporaryPassword, invitationLink: invitationData.invitationLink }} onClose={() => setInvitationData(null)} />
      )}
      {resetData && (
        <InviteModal title="密码已重置" data={resetData} onClose={() => setResetData(null)} />
      )}
    </div>
  )
}
