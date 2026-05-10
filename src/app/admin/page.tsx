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
        if (data.temporaryPassword) {
          alert(`Temporary password (shown once): ${data.temporaryPassword}`)
        }
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
    </div>
  )
}
