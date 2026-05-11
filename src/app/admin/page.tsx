'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([])
  const [email, setEmail] = useState('')
  const [type, setType] = useState('HUMAN')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const [selectedHuman, setSelectedHuman] = useState<any | null>(null)
  const [assignedAgentIds, setAssignedAgentIds] = useState<string[]>([])
  
  // 邀请链接相关状态
  const [invitationData, setInvitationData] = useState<any | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    const res = await fetch('/api/admin/users')
    if (res.ok) {
      const data = await res.json()
      setUsers(data)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type })
      })
      if (res.ok) {
        const data = await res.json()
        setInvitationData(data)
        setEmail('')
        fetchUsers()
      } else {
        alert('Error adding user')
      }
    } catch(err) {
      alert('Network error')
    }
    
    setLoading(false)
  }

  const openPermissionModal = (human: any) => {
    setSelectedHuman(human)
    setAssignedAgentIds(human.permittedAgents.map((pa: any) => pa.agent.id))
  }

  const savePermissions = async () => {
    if (!selectedHuman) return
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ humanId: selectedHuman.id, agentIds: assignedAgentIds })
      })
      if (res.ok) {
        setSelectedHuman(null)
        fetchUsers()
      }
    } catch(err) {
      alert('Network error')
    }
  }

  const toggleAgent = (agentId: string) => {
    if (assignedAgentIds.includes(agentId)) {
      setAssignedAgentIds(assignedAgentIds.filter(id => id !== agentId))
    } else {
      setAssignedAgentIds([...assignedAgentIds, agentId])
    }
  }

  const humans = users.filter(u => u.type === 'HUMAN')
  const agents = users.filter(u => u.type === 'AI_AGENT')

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
        <button onClick={() => router.push('/board')} className="text-blue-600 dark:text-blue-400 hover:underline">
          &larr; Back to Board
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-gray-200">Add New Entity</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-gray-300">Type</label>
                <select 
                  value={type} 
                  onChange={e => setType(e.target.value)}
                  className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white rounded-md px-3 py-2"
                >
                  <option value="HUMAN">Human User</option>
                  <option value="AI_AGENT">AI Agent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-gray-300">Email Address (ID)</label>
                <input 
                  type="email" 
                  required 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white rounded-md px-3 py-2"
                />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors">
                {loading ? 'Adding...' : 'Add'}
              </button>
              <p className="text-xs text-slate-600 dark:text-gray-400 mt-2">A secure temporary password will be shown once after user creation.</p>
            </form>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-gray-200">Human Users</h2>
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {humans.map(h => (
                <li key={h.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{h.email}</p>
                    <p className="text-xs text-slate-600 dark:text-gray-400">Permitted Agents: {h.permittedAgents.length}</p>
                  </div>
                  <button onClick={() => openPermissionModal(h)} className="text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-1 rounded">
                    Manage Permissions
                  </button>
                </li>
              ))}
              {humans.length === 0 && <p className="text-slate-600 dark:text-gray-400 text-sm">No human users found.</p>}
            </ul>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-gray-200">AI Agents</h2>
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {agents.map(a => (
                <li key={a.id} className="py-3">
                  <p className="font-medium text-slate-900 dark:text-white">{a.nickname || a.email}</p>
                  <p className="text-xs text-slate-600 dark:text-gray-400">{a.nickname ? a.email : `ID: ${a.id}`}</p>
                </li>
              ))}
              {agents.length === 0 && <p className="text-slate-600 dark:text-gray-400 text-sm">No AI agents found.</p>}
            </ul>
          </div>
        </div>
      </div>

      {selectedHuman && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-xl shadow-xl p-6">
            <h2 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">Manage Agents for {selectedHuman.email}</h2>
            <div className="space-y-3 max-h-64 overflow-y-auto mb-6">
              {agents.map(agent => (
                <label key={agent.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={assignedAgentIds.includes(agent.id)}
                    onChange={() => toggleAgent(agent.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-gray-200 truncate">{agent.nickname || agent.email}</p>
                    {agent.nickname && <p className="text-xs text-slate-600 dark:text-gray-400 truncate">{agent.email}</p>}
                  </div>
                </label>
              ))}
              {agents.length === 0 && <p className="text-sm text-slate-600 dark:text-gray-400">No agents available to assign.</p>}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setSelectedHuman(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">Cancel</button>
              <button onClick={savePermissions} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save Permissions</button>
            </div>
          </div>
        </div>
      )}

      {invitationData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-xl shadow-xl p-8">
            <h2 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">用户创建成功！</h2>
            <p className="text-slate-600 dark:text-gray-400 mb-6">已生成邀请链接，请复制并发送给新用户</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-gray-300">用户邮箱</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={invitationData.user.email}
                    readOnly
                    className="flex-1 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white rounded-md px-3 py-2 font-mono text-sm"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(invitationData.user.email)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    {copied ? '✓' : '复制'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-gray-300">临时密码</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={invitationData.temporaryPassword}
                    readOnly
                    className="flex-1 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white rounded-md px-3 py-2 font-mono text-sm"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(invitationData.temporaryPassword)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    {copied ? '✓' : '复制'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-gray-300">邀请链接</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={invitationData.invitationLink}
                    readOnly
                    className="flex-1 border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white rounded-md px-3 py-2 font-mono text-sm break-all"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(invitationData.invitationLink)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition whitespace-nowrap"
                  >
                    {copied ? '✓ 已复制' : '复制链接'}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <span className="font-semibold">⚠️ 重要提示：</span> 这个邀请链接有效期为7天，请立即发送给新用户。用户点击链接后可以看到完整的登录信息和欢迎语。
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  const fullText = `邀请链接: ${invitationData.invitationLink}\n\n用户邮箱: ${invitationData.user.email}\n临时密码: ${invitationData.temporaryPassword}`
                  navigator.clipboard.writeText(fullText)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                复制全部信息
              </button>
              <button 
                onClick={() => setInvitationData(null)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
