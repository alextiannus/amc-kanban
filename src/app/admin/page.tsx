'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, User, Bot, Trash2, RefreshCw, Copy, Check, Plus, ArrowLeft, Edit3, Save, Users, Store, CreditCard, Sparkles, MessageSquare } from 'lucide-react'
import TrainingDataSection from '@/components/TrainingDataSection'
import SchedulerPanel from '@/components/admin/SchedulerPanel'
import EditUserModal from '@/components/admin/EditUserModal'
import EmailConfigPanel from '@/components/admin/EmailConfigPanel'

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
  businessRoles?: { role: string }[]
  brandMemberships: { brand: { id: string; name: string; status: string } }[]
  ownedBrands: { brand: { id: string; name: string; status: string } }[]
  legacyOwnedBrands: { brand: { id: string; name: string; status: string } }[]
  permittedAgents: { agent: { id: string; email: string; nickname: string | null; brandMemberships: { brand: { id: string; name: string; status: string } }[] } }[]
  assignedToHumans: { human: { id: string; email: string; nickname: string | null } }[]
}

interface BrandRecord {
  id: string
  name: string
  location: string | null
  timezone: string
  status: string
  autoPilot: boolean
  owners: { userId: string; role: string; user: { id: string; email: string; nickname: string | null } }[]
  brandAgents: { agentId: string; role: string; agent: { id: string; email: string; nickname: string | null } }[]
  subscriptions: { id: string; planId: string; planName: string; status: string; durationMonths: number; contractStartDate: string | null; contractEndDate: string | null; totalDueUsd: number }[]
  _count: { actionItems: number; contents: number }
  updatedAt: string
}

type AdminTab = 'users' | 'brands' | 'agents' | 'pool' | 'system' | 'llm' | 'conversation-log'

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
  const [brands, setBrands] = useState<BrandRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [brandsLoading, setBrandsLoading] = useState(true)
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('users')
  const router = useRouter()

  // Create form
  const [email, setEmail] = useState('')
  const [type, setType] = useState('HUMAN')
  const [role, setRole] = useState('USER')
  const [creating, setCreating] = useState(false)

  // Modals
  const [invitationData, setInvitationData] = useState<InvitationResult | null>(null)
  const [resetData, setResetData] = useState<{ email: string; temporaryPassword: string; invitationLink: string; emailSent?: boolean } | null>(null)
  const [editingUser, setEditingUser] = useState<{ id: string; email: string; nickname: string | null; role: string; type: string } | null>(null)
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
  const [brandDrafts, setBrandDrafts] = useState<Record<string, { name: string; location: string; status: string; ownerUserId: string; planId: string; subscriptionStatus: string; durationMonths: number; agentIds: string[] }>>({})

  // System config & audit logs states
  interface SystemConfigAuditLog {
    id: string
    timestamp: string
    actorId: string | null
    actorType: string
    actorName: string | null
    action: string
    resourceId: string
    resourceType: string
    oldValue: any
    newValue: any
    reason: string | null
    metadata: any
  }
  const [systemConfig, setSystemConfig] = useState<{
    geminiApiKey: string
    geminiConfigured: boolean
    azureSpeechKey: string
    azureSpeechRegion: string
    azureSpeechConfigured: boolean
    // SMTP
    smtpHost: string
    smtpPort: number | null
    smtpUser: string
    smtpPassword: string
    smtpFrom: string
    smtpFromName: string
    smtpSecure: boolean
    smtpConfigured: boolean
  } | null>(null)
  const [systemLogs, setSystemLogs] = useState<SystemConfigAuditLog[]>([])
  const [systemLogsLoading, setSystemLogsLoading] = useState(false)
  const [savingSystemConfig, setSavingSystemConfig] = useState(false)

  const fetchSystemConfig = async () => {
    try {
      const res = await fetch('/api/admin/system-config')
      if (res.ok) {
        setSystemConfig(await res.json())
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchSystemLogs = async () => {
    setSystemLogsLoading(true)
    try {
      const res = await fetch('/api/admin/logs?limit=50')
      if (res.ok) {
        const data = await res.json()
        setSystemLogs(data.logs || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSystemLogsLoading(false)
    }
  }

  const saveSystemConfig = async () => {
    if (!systemConfig) return
    setSavingSystemConfig(true)
    try {
      const res = await fetch('/api/admin/system-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: systemConfig.geminiApiKey,
          azureSpeechKey: systemConfig.azureSpeechKey,
          azureSpeechRegion: systemConfig.azureSpeechRegion,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setSystemConfig(updated)
        alert('系统配置保存成功')
        void fetchSystemLogs()
      } else {
        alert('保存失败，请重试')
      }
    } catch (e) {
      console.error(e)
      alert('保存失败')
    } finally {
      setSavingSystemConfig(false)
    }
  }

  // LLM Configurations state & handlers
  interface LLMConfigRecord {
    id: string
    provider: string
    displayName: string
    modelName: string
    apiKey: string | null
    baseUrl: string | null
    isEnabled: boolean
    isDefault: boolean
    taskTags: string[]
    createdAt: string
    updatedAt: string
  }

  const [llmConfigs, setLlmConfigs] = useState<LLMConfigRecord[]>([])
  const [llmConfigsLoading, setLlmConfigsLoading] = useState(false)
  const [llmConfigModalOpen, setLlmConfigModalOpen] = useState(false)
  const [editingLLMConfig, setEditingLLMConfig] = useState<LLMConfigRecord | null>(null)
  const [savingLLMConfig, setSavingLLMConfig] = useState(false)
  const [llmForm, setLlmForm] = useState({
    provider: 'google',
    displayName: '',
    modelName: '',
    apiKey: '',
    baseUrl: '',
    isEnabled: true,
    isDefault: false,
    taskTagsStr: '',
  })
  const [llmFormError, setLlmFormError] = useState<string | null>(null)

  const fetchLLMConfigs = async () => {
    setLlmConfigsLoading(true)
    try {
      const res = await fetch('/api/admin/llm-configs')
      if (res.ok) {
        const data = await res.json()
        setLlmConfigs(data.configs || [])
      }
    } catch (e) {
      console.error('[fetchLLMConfigs error]', e)
    } finally {
      setLlmConfigsLoading(false)
    }
  }

  const saveLLMConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingLLMConfig(true)
    setLlmFormError(null)
    try {
      const url = editingLLMConfig 
        ? `/api/admin/llm-configs/${editingLLMConfig.id}`
        : '/api/admin/llm-configs'
      const method = editingLLMConfig ? 'PATCH' : 'POST'
      
      const tags = llmForm.taskTagsStr
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)

      const body = {
        provider: llmForm.provider,
        displayName: llmForm.displayName,
        modelName: llmForm.modelName,
        apiKey: llmForm.apiKey,
        baseUrl: llmForm.baseUrl || null,
        isEnabled: llmForm.isEnabled,
        isDefault: llmForm.isDefault,
        taskTags: tags,
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setLlmConfigModalOpen(false)
        setEditingLLMConfig(null)
        setLlmFormError(null)
        void fetchLLMConfigs()
        void fetchSystemLogs()
      } else {
        const errData = await res.json().catch(() => ({}))
        setLlmFormError(errData.error || '保存失败，请检查输入')
      }
    } catch (e) {
      console.error('[saveLLMConfig error]', e)
      setLlmFormError('发生未知网络错误，请稍后重试')
    } finally {
      setSavingLLMConfig(false)
    }
  }

  const deleteLLMConfig = async (id: string) => {
    if (!confirm('确定要删除这个大模型配置吗？')) return
    try {
      const res = await fetch(`/api/admin/llm-configs/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        void fetchLLMConfigs()
        void fetchSystemLogs()
      } else {
        alert('删除失败')
      }
    } catch (e) {
      console.error('[deleteLLMConfig error]', e)
      alert('删除失败')
    }
  }

  const toggleLLMConfigEnabled = async (config: LLMConfigRecord) => {
    try {
      const res = await fetch(`/api/admin/llm-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !config.isEnabled }),
      })
      if (res.ok) {
        void fetchLLMConfigs()
        void fetchSystemLogs()
      }
    } catch (e) {
      console.error('[toggleLLMConfigEnabled error]', e)
    }
  }

  const toggleLLMConfigDefault = async (config: LLMConfigRecord) => {
    try {
      const res = await fetch(`/api/admin/llm-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: !config.isDefault }),
      })
      if (res.ok) {
        void fetchLLMConfigs()
        void fetchSystemLogs()
      }
    } catch (e) {
      console.error('[toggleLLMConfigDefault error]', e)
    }
  }

  const fetchUsers = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  const fetchBrands = async () => {
    setBrandsLoading(true)
    try {
      const res = await fetch('/api/admin/brands')
      if (!res.ok) return
      const data = await res.json() as BrandRecord[]
      setBrands(data)
      setBrandDrafts(Object.fromEntries(data.map((brand) => {
        const subscription = brand.subscriptions[0]
        return [brand.id, {
          name: brand.name,
          location: brand.location || '',
          status: brand.status,
          ownerUserId: brand.owners[0]?.userId || '',
          planId: subscription?.planId || 'essential',
          subscriptionStatus: subscription?.status || 'ACTIVE',
          durationMonths: subscription?.durationMonths || 12,
          agentIds: brand.brandAgents.map((link) => link.agentId),
        }]
      })))
    } finally {
      setBrandsLoading(false)
    }
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
      void fetchBrands()
      void fetchPoolData()
      void fetchDecisionLogs()
      void fetchSystemConfig()
      void fetchSystemLogs()
      void fetchLLMConfigs()
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
      const res = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent.id, humanIds: selectedAgentHumanIds }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '保存主理人分配失败')
        return
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
      else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '更新角色失败')
      }
    } finally { setActionLoading(p => { const n = { ...p }; delete n[user.id + '_role']; return n }) }
  }

  const saveBusinessRoles = async (user: UserRecord, nextRoles: string[]) => {
    setActionLoading(p => ({ ...p, [user.id + '_biz']: '1' }))
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessRoles: nextRoles }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || '更新身份失败')
        return
      }
      await fetchUsers()
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[user.id + '_biz']; return n })
    }
  }

  const toggleBusinessRole = (user: UserRecord, roleName: 'BRAND_OWNER' | 'AMC_PRINCIPAL') => {
    const roles = new Set((user.businessRoles || []).map((role) => role.role))
    if (roles.has(roleName)) roles.delete(roleName)
    else roles.add(roleName)
    void saveBusinessRoles(user, Array.from(roles))
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
        setResetData({ email: user.email, temporaryPassword: data.temporaryPassword, invitationLink: data.invitationLink, emailSent: data.emailSent })
      }
    } finally { setActionLoading(p => { const n = { ...p }; delete n[user.id + '_reset']; return n }) }
  }

  const handleDelete = async (user: UserRecord) => {
    if (!confirm(`确认删除用户 ${user.email}？此操作不可撤销。`)) return
    setActionLoading(p => ({ ...p, [user.id + '_del']: '1' }))
    try {
      const res = await fetch(user.type === 'AI_AGENT' ? `/api/agents/${user.id}` : `/api/admin/users/${user.id}`, { method: 'DELETE' })
      if (res.ok) setUsers(prev => prev.filter(u => u.id !== user.id))
      else { const d = await res.json().catch(() => ({})); alert(d.error || '删除失败') }
    } finally { setActionLoading(p => { const n = { ...p }; delete n[user.id + '_del']; return n }) }
  }

  const updateBrandDraft = (brandId: string, patch: Partial<{ name: string; location: string; status: string; ownerUserId: string; planId: string; subscriptionStatus: string; durationMonths: number; agentIds: string[] }>) => {
    setBrandDrafts(prev => ({
      ...prev,
      [brandId]: {
        name: prev[brandId]?.name || '',
        location: prev[brandId]?.location || '',
        status: prev[brandId]?.status || 'ACTIVE',
        ownerUserId: prev[brandId]?.ownerUserId || '',
        planId: prev[brandId]?.planId || 'essential',
        subscriptionStatus: prev[brandId]?.subscriptionStatus || 'ACTIVE',
        durationMonths: prev[brandId]?.durationMonths || 12,
        agentIds: prev[brandId]?.agentIds || [],
        ...patch,
      },
    }))
  }

  const saveBrandDraft = async (brand: BrandRecord) => {
    const draft = brandDrafts[brand.id]
    if (!draft) return
    setActionLoading(p => ({ ...p, [brand.id + '_brand']: '1' }))
    try {
      const res = await fetch(`/api/admin/brands/${brand.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || '保存品牌失败')
        return
      }
      await Promise.all([fetchBrands(), fetchUsers()])
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[brand.id + '_brand']; return n })
    }
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

  const uniqueBrandsFromAgentLinks = (links: { brand: { id: string; name: string; status: string } }[] = []) => {
    const map = new Map<string, { id: string; name: string; status: string }>()
    for (const link of links) map.set(link.brand.id, link.brand)
    return Array.from(map.values())
  }

  const uniqueBrandsFromPermittedAgents = (links: UserRecord['permittedAgents']) => {
    const map = new Map<string, { id: string; name: string; status: string }>()
    for (const link of links) {
      for (const brandLink of link.agent.brandMemberships || []) map.set(brandLink.brand.id, brandLink.brand)
    }
    return Array.from(map.values())
  }

  const uniqueBrandsFromOwnerLinks = (links: Array<{ brand: { id: string; name: string; status: string } }> = []) => {
    const map = new Map<string, { id: string; name: string; status: string }>()
    for (const link of links) map.set(link.brand.id, link.brand)
    return Array.from(map.values())
  }

  const formatBrandNames = (brands: { name: string }[], max = 3) => {
    if (brands.length === 0) return '暂无绑定品牌'
    const head = brands.slice(0, max).map((brand) => brand.name).join('、')
    return brands.length > max ? `${head} 等 ${brands.length} 个品牌` : head
  }

  const UserClassificationBadges = ({ user }: { user: UserRecord }) => {
    const explicitRoles = new Set((user.businessRoles || []).map((role) => role.role))
    const isPrincipal = user.type === 'HUMAN' && (explicitRoles.has('AMC_PRINCIPAL') || user.permittedAgents.length > 0)
    const isBrandOwner = user.type === 'HUMAN' && (explicitRoles.has('BRAND_OWNER') || uniqueBrandsFromOwnerLinks([...(user.ownedBrands || []), ...(user.legacyOwnedBrands || [])]).length > 0)
    return (
      <>
        {user.role === 'ADMIN' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
            <Shield size={10} /> System Admin
          </span>
        )}
        {isBrandOwner && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
            <Store size={10} /> Brand Owner
          </span>
        )}
        {isPrincipal && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
            <Users size={10} /> AMC Principal
          </span>
        )}
        {user.role !== 'ADMIN' && !isBrandOwner && !isPrincipal && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            <User size={10} /> Standard User
          </span>
        )}
      </>
    )
  }

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
    <div className="admin-page min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <style>{`
        /* Force text colors to be black in light mode */
        html:not(.dark) .admin-page,
        html:not(.dark) .admin-page input,
        html:not(.dark) .admin-page select,
        html:not(.dark) .admin-page textarea {
          color: #000000;
        }
        html:not(.dark) .admin-page .text-slate-900,
        html:not(.dark) .admin-page .text-slate-800,
        html:not(.dark) .admin-page .text-slate-700,
        html:not(.dark) .admin-page .text-slate-600,
        html:not(.dark) .admin-page .text-slate-500 {
          color: #000000 !important;
        }
        html:not(.dark) .admin-page .text-slate-400 {
          color: rgba(0, 0, 0, 0.6) !important;
        }
      `}</style>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Admin Console</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{humans.length} 个人类用户 · {brands.length} 个品牌 · {agents.length} 个 AI Agent · {llmConfigs.length} 个模型配置</p>
          </div>
          <button onClick={() => router.push('/board')} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
            <ArrowLeft size={16} /> 返回看板
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-7">
          {([
            ['users', User, '用户管理'],
            ['brands', Store, '品牌管理'],
            ['agents', Bot, 'AI Agent 管理'],
            ['pool', CreditCard, '分配池'],
            ['system', Shield, '系统设置'],
            ['llm', Sparkles, '多模型管理'],
            ['conversation-log', MessageSquare, 'AI 对话日志'],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => {
                setActiveAdminTab(id)
                if (id === 'system') {
                  void fetchSystemConfig()
                  void fetchSystemLogs()
                }
                if (id === 'llm') {
                  void fetchLLMConfigs()
                }
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${activeAdminTab === id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {(activeAdminTab === 'users' || activeAdminTab === 'agents') && <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">人类账号角色</label>
                    <select value={role} onChange={e => setRole(e.target.value)} className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40">
                      <option value="USER">USER（无系统管理权限）</option>
                      <option value="ADMIN">ADMIN（System Admin 权限）</option>
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
            {activeAdminTab === 'users' && (
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
                  {humans.map(user => {
                    const derivedBrands = uniqueBrandsFromPermittedAgents(user.permittedAgents)
                    const ownedBrands = uniqueBrandsFromOwnerLinks([...(user.ownedBrands || []), ...(user.legacyOwnedBrands || [])])
                    return (
                    <li key={user.id} className="px-6 py-4 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{user.email}</span>
                          <UserClassificationBadges user={user} />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(user.createdAt).toLocaleDateString('zh-CN')} · 拥有 {ownedBrands.length} 个品牌 · 运营 {derivedBrands.length} 个品牌 · {user.permittedAgents.length} 个 Agent
                        </p>
                        {ownedBrands.length > 0 && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                            拥有品牌：{formatBrandNames(ownedBrands)}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                          运营品牌：{formatBrandNames(derivedBrands)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => { setSelectedHuman(user); setAssignedAgentIds(user.permittedAgents.map(pa => pa.agent.id)) }} className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                          运营权限
                        </button>
                        <button onClick={() => toggleBusinessRole(user, 'BRAND_OWNER')} disabled={!!actionLoading[user.id + '_biz']} className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition disabled:opacity-50">
                          {(user.businessRoles || []).some((item) => item.role === 'BRAND_OWNER') ? '移除 Brand Owner' : '设为 Brand Owner'}
                        </button>
                        <button onClick={() => toggleBusinessRole(user, 'AMC_PRINCIPAL')} disabled={!!actionLoading[user.id + '_biz']} className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition disabled:opacity-50">
                          {(user.businessRoles || []).some((item) => item.role === 'AMC_PRINCIPAL') ? '移除 AMC Principal' : '设为 AMC Principal'}
                        </button>
                        <button onClick={() => handleRoleToggle(user)} disabled={!!actionLoading[user.id + '_role']} className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition disabled:opacity-50">
                          {actionLoading[user.id + '_role'] ? '...' : user.role === 'ADMIN' ? '移除 System Admin' : '授予 System Admin'}
                        </button>
                        <button onClick={() => setEditingUser({ id: user.id, email: user.email, nickname: user.nickname, role: user.role, type: user.type })} title="编辑用户信息" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => handleResetPassword(user)} disabled={!!actionLoading[user.id + '_reset']} title="重置密码" className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition disabled:opacity-50">
                          <RefreshCw size={14} className={actionLoading[user.id + '_reset'] ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => handleDelete(user)} disabled={!!actionLoading[user.id + '_del']} title="删除" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                    )
                  })}
                </ul>
              )}
            </div>
            )}

            {activeAdminTab === 'agents' && (
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
                    const operatingBrands = uniqueBrandsFromAgentLinks(agent.brandMemberships)
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
                            对应 AMC 主理人：{agent.assignedToHumans.length ? agent.assignedToHumans.map(link => link.human.nickname || link.human.email).join('、') : '未分配'}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                            运营品牌：{formatBrandNames(operatingBrands)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button onClick={() => openAgentEditor(agent)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition" title="编辑 Agent">
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => openAgentPrincipalModal(agent)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition" title="对应 AMC 主理人">
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
            )}
          </div>
        </div>}

        {activeAdminTab === 'brands' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Store size={15} className="text-slate-500" />
              <span className="text-sm font-black text-slate-800 dark:text-slate-100">品牌管理</span>
              <button onClick={fetchBrands} className="ml-auto text-xs font-bold text-blue-600 hover:text-blue-700">刷新</button>
            </div>
            {brandsLoading ? (
              <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {brands.map((brand) => {
                  const draft = brandDrafts[brand.id]
                  const subscription = brand.subscriptions[0]
                  return (
                    <div key={brand.id} className="p-5 space-y-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-black text-slate-900 dark:text-white">{brand.name}</h2>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{brand.status}</span>
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">{subscription?.planName || '未绑定计划'}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">Owner: {brand.owners[0]?.user.email || '未设置'} · Agent: {brand.brandAgents.length} · Action: {brand._count.actionItems}</p>
                        </div>
                        <button onClick={() => saveBrandDraft(brand)} disabled={!!actionLoading[brand.id + '_brand']} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                          <Save size={14} /> {actionLoading[brand.id + '_brand'] ? '保存中...' : '保存品牌'}
                        </button>
                      </div>

                      {draft && (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                          <label className="space-y-1.5 lg:col-span-2">
                            <span className="text-xs font-bold text-slate-500">品牌名</span>
                            <input value={draft.name} onChange={e => updateBrandDraft(brand.id, { name: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white" />
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-bold text-slate-500">状态</span>
                            <select value={draft.status} onChange={e => updateBrandDraft(brand.id, { status: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white">
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="PAUSED">PAUSED</option>
                              <option value="ARCHIVED">ARCHIVED</option>
                            </select>
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-bold text-slate-500">地点</span>
                            <input value={draft.location} onChange={e => updateBrandDraft(brand.id, { location: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white" />
                          </label>
                          <label className="space-y-1.5 lg:col-span-2">
                            <span className="text-xs font-bold text-slate-500">Brand Owner</span>
                            <select value={draft.ownerUserId} onChange={e => updateBrandDraft(brand.id, { ownerUserId: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white">
                              <option value="">未设置</option>
                              {humans.map((human) => <option key={human.id} value={human.id}>{human.nickname || human.email}</option>)}
                            </select>
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-bold text-slate-500">Plan</span>
                            <select value={draft.planId} onChange={e => updateBrandDraft(brand.id, { planId: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white">
                              <option value="starter">STARTER</option>
                              <option value="essential">ESSENTIAL</option>
                              <option value="advanced">ADVANCED</option>
                            </select>
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-bold text-slate-500">Subscription</span>
                            <select value={draft.subscriptionStatus} onChange={e => updateBrandDraft(brand.id, { subscriptionStatus: e.target.value })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white">
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="PENDING">PENDING</option>
                              <option value="FAILED">FAILED</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                          </label>
                          <label className="space-y-1.5">
                            <span className="text-xs font-bold text-slate-500">周期</span>
                            <select value={draft.durationMonths} onChange={e => updateBrandDraft(brand.id, { durationMonths: Number(e.target.value) })} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white">
                              <option value={3}>3 months</option>
                              <option value={6}>6 months</option>
                              <option value={12}>12 months</option>
                            </select>
                          </label>
                        </div>
                      )}

                      {draft && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                          <p className="mb-2 text-xs font-bold text-slate-500">绑定 AI Agent</p>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {agents.map((agent) => (
                              <label key={`${brand.id}-${agent.id}`} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                <input
                                  type="checkbox"
                                  checked={draft.agentIds.includes(agent.id)}
                                  onChange={() => updateBrandDraft(brand.id, { agentIds: draft.agentIds.includes(agent.id) ? draft.agentIds.filter(id => id !== agent.id) : [...draft.agentIds, agent.id] })}
                                />
                                <span className="truncate">{agent.nickname || agent.email}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeAdminTab === 'pool' && <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
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
        </div>}

        {activeAdminTab === 'pool' && <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
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
        </div>}

        {activeAdminTab === 'llm' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header / Intro Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles size={18} className="text-blue-500" /> 多模型配置与容灾路由
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    在此配置平台运行所需的各个 AI API 接口。当调用首选模型遇到故障（如触发 429 频率限制、Token 额度用完、接口密钥失效等）时，
                    系统会自动启动容灾路由，按顺序尝试下一个匹配标签的配置或默认配置，直至成功，最大程度保证文案创作与后台任务的连续性。
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingLLMConfig(null)
                    setLlmForm({
                      provider: 'google',
                      displayName: '',
                      modelName: 'gemini-2.0-flash',
                      apiKey: '',
                      baseUrl: '',
                      isEnabled: true,
                      isDefault: false,
                      taskTagsStr: '',
                    })
                    setLlmFormError(null)
                    setLlmConfigModalOpen(true)
                  }}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition flex-shrink-0"
                >
                  <Plus size={16} /> 新增大模型配置
                </button>
              </div>
            </div>

            {/* Config List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {llmConfigsLoading ? (
                <div className="col-span-full py-12 text-center text-slate-500 dark:text-slate-400">
                  <RefreshCw className="animate-spin inline-block mr-2" size={16} /> 加载配置列表中...
                </div>
              ) : llmConfigs.length === 0 ? (
                <div className="col-span-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-500 dark:text-slate-400">
                  暂无大模型配置，系统目前将回退使用全局设置或服务器环境变量中的默认大模型密钥。
                </div>
              ) : (
                llmConfigs.map((config) => (
                  <div key={config.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col justify-between hover:border-blue-500/50 dark:hover:border-blue-500/40 transition">
                    <div className="space-y-4">
                      {/* Title Bar */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            {config.displayName}
                          </h3>
                          <p className="text-xs text-slate-400 mt-1 font-mono uppercase tracking-wider">
                            {config.provider} / {config.modelName}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {config.isDefault && (
                            <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 px-2 py-0.5 rounded-full font-bold">
                              默认
                            </span>
                          )}
                          <button
                            onClick={() => toggleLLMConfigEnabled(config)}
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold border transition ${
                              config.isEnabled
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-450 border-emerald-250 dark:border-emerald-800/50'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {config.isEnabled ? '已启用' : '已禁用'}
                          </button>
                        </div>
                      </div>

                      {/* Content details */}
                      <div className="text-xs space-y-1.5 border-t border-slate-100 dark:border-slate-800/80 pt-3 text-slate-600 dark:text-slate-400">
                        {config.baseUrl && (
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-16 flex-shrink-0">代理地址:</span>
                            <span className="font-mono break-all">{config.baseUrl}</span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <span className="text-slate-400 w-16 flex-shrink-0">API 密钥:</span>
                          <span className="font-mono text-slate-500 dark:text-slate-455">{config.apiKey || '未配置'}</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="text-slate-400 w-16 flex-shrink-0 mt-0.5">任务标签:</span>
                          <div className="flex flex-wrap gap-1">
                            {config.taskTags.length === 0 ? (
                              <span className="text-slate-400 italic">全部任务</span>
                            ) : (
                              config.taskTags.map((tag) => (
                                <span key={tag} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                                  {tag}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions footer */}
                    <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 mt-5 pt-4">
                      <button
                        onClick={() => toggleLLMConfigDefault(config)}
                        disabled={config.isDefault}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:no-underline font-semibold"
                      >
                        {config.isDefault ? '当前已设为默认' : '设为默认模型'}
                      </button>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setEditingLLMConfig(config)
                            setLlmForm({
                              provider: config.provider,
                              displayName: config.displayName,
                              modelName: config.modelName,
                              apiKey: config.apiKey || '',
                              baseUrl: config.baseUrl || '',
                              isEnabled: config.isEnabled,
                              isDefault: config.isDefault,
                              taskTagsStr: config.taskTags.join(', '),
                            })
                            setLlmFormError(null)
                            setLlmConfigModalOpen(true)
                          }}
                          className="text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 font-semibold"
                        >
                          <Edit3 size={13} /> 编辑
                        </button>
                        <button
                          onClick={() => deleteLLMConfig(config.id)}
                          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-semibold"
                        >
                          <Trash2 size={13} /> 删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeAdminTab === 'system' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Global AI API key config */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
              <div>
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Shield size={16} className="text-blue-500" /> 全局 AI 接口配置
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  此 API Key 是全平台通用的 AI 接口令牌（System settings / Admin only）。
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Gemini API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={systemConfig?.geminiApiKey ?? ''}
                    onChange={e => setSystemConfig(prev => prev ? { ...prev, geminiApiKey: e.target.value } : { geminiApiKey: e.target.value, geminiConfigured: false, azureSpeechKey: '', azureSpeechRegion: 'eastasia', azureSpeechConfigured: false, smtpHost: '', smtpPort: null, smtpUser: '', smtpPassword: '', smtpFrom: '', smtpFromName: '', smtpSecure: true, smtpConfigured: false })}
                    placeholder="请输入 Gemini API Key"
                    className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <button
                    onClick={saveSystemConfig}
                    disabled={savingSystemConfig || !systemConfig}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex-shrink-0 flex items-center gap-2"
                  >
                    {savingSystemConfig ? '保存中...' : '保存配置'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  说明：系统调用 AI 模块时优先使用此 Key。留空则退回 process.env.GEMINI_API_KEY。
                </p>
              </div>

              {/* Azure Speech TTS */}
              <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">
                  Microsoft Azure Speech TTS
                  {systemConfig?.azureSpeechConfigured && (
                    <span className="ml-2 text-emerald-500">● 已配置</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={systemConfig?.azureSpeechKey ?? ''}
                    onChange={e => setSystemConfig(prev => prev ? { ...prev, azureSpeechKey: e.target.value } : null)}
                    placeholder="Azure Speech Key 1（留空则使用浏览器内置 TTS）"
                    className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <select
                    value={systemConfig?.azureSpeechRegion ?? 'eastasia'}
                    onChange={e => setSystemConfig(prev => prev ? { ...prev, azureSpeechRegion: e.target.value } : null)}
                    className="w-40 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="eastasia">East Asia（香港）</option>
                    <option value="southeastasia">SE Asia（新加坡）</option>
                    <option value="eastus">East US</option>
                    <option value="westeurope">West Europe</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-400">
                  配置后 amc-mm 语音助手将使用 Azure XiaoxiaoNeural（高质量中文女声）。
                  免费层：每月 5 小时 Neural TTS（F0 定价）。Key 存储于数据库，不写入 Render 环境变量。
                </p>
              </div>
            </div>

            {/* 邮件通知配置面板 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
              <EmailConfigPanel
                config={systemConfig}
                onSaved={(smtp) => setSystemConfig(prev => prev ? { ...prev, ...smtp } : null)}
              />
            </div>

            {/* Scheduler 智能排期巡检面板 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
              <SchedulerPanel />
            </div>

            {/* Detailed System Logs */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 font-bold">系统操作日志</h2>
                <button
                  onClick={fetchSystemLogs}
                  disabled={systemLogsLoading}
                  className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 font-bold"
                >
                  {systemLogsLoading ? '刷新中...' : '刷新'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-2">时间</th>
                      <th className="text-left px-4 py-2">操作人</th>
                      <th className="text-left px-4 py-2">动作 (Action)</th>
                      <th className="text-left px-4 py-2">关联资源</th>
                      <th className="text-left px-4 py-2">变更详情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemLogs.map(log => {
                      const displayActor = log.actorName || log.actorId || '系统';
                      const displayResource = `${log.resourceType}:${log.resourceId}`;
                      
                      // Format oldValue & newValue safely for visual review
                      let details = '-';
                      if (log.oldValue || log.newValue) {
                        try {
                          const changes: string[] = [];
                          const oldObj = log.oldValue || {};
                          const newObj = log.newValue || {};
                          
                          // Find changed keys
                          const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
                          for (const key of allKeys) {
                            if (key === 'createdAt' || key === 'updatedAt' || key === 'id') continue;
                            const oldVal = oldObj[key];
                            const newVal = newObj[key];
                            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                              changes.push(`${key}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`);
                            }
                          }
                          details = changes.length > 0 ? changes.join(' | ') : '无字段变更';
                        } catch {
                          details = '数据解析失败';
                        }
                      }
                      
                      return (
                        <tr key={log.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-2 text-xs text-slate-500">{new Date(log.timestamp).toLocaleString('zh-CN')}</td>
                          <td className="px-4 py-2 font-medium">{displayActor}</td>
                          <td className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-350">{log.action}</td>
                          <td className="px-4 py-2 text-xs text-slate-400 font-mono">{displayResource}</td>
                          <td className="px-4 py-2 text-xs text-slate-500 max-w-sm truncate" title={details}>{details}</td>
                        </tr>
                      );
                    })}
                    {systemLogs.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-400" colSpan={5}>暂无操作日志</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Agent Permission Modal */}
      {selectedHuman && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-900 dark:text-white mb-1">主理人运营权限</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {selectedHuman.email} · 勾选 Agent 后，该 AMC Principal 会运营这些 Agent 绑定运营的品牌。
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-5">
              {agents.map(agent => {
                const operatingBrands = uniqueBrandsFromAgentLinks(agent.brandMemberships)
                return (
                <label key={agent.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer select-none">
                  <input type="checkbox" checked={assignedAgentIds.includes(agent.id)} onChange={() => setAssignedAgentIds(prev => prev.includes(agent.id) ? prev.filter(id => id !== agent.id) : [...prev, agent.id])} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{agent.nickname || agent.email}</p>
                    {agent.nickname && <p className="text-[11px] text-slate-400 truncate">{agent.email}</p>}
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">运营品牌：{formatBrandNames(operatingBrands, 2)}</p>
                  </div>
                </label>
                )
              })}
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
            <h2 className="text-base font-black text-slate-900 dark:text-white mb-1">对应 AMC 主理人</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{selectedAgent.nickname || selectedAgent.email}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              该 Agent 运营品牌：{formatBrandNames(uniqueBrandsFromAgentLinks(selectedAgent.brandMemberships))}。被勾选的 AMC Principal 会成为这些品牌的运营主理人之一。
            </p>
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

      {/* LLM Config Modal */}
      {llmConfigModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-black text-slate-900 dark:text-white mb-1">
              {editingLLMConfig ? '编辑大模型配置' : '新增大模型配置'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              每个 API 接口独立运作，出错时系统自动调用可用链中的下一个接口。
            </p>
            <form onSubmit={saveLLMConfig} className="space-y-4">
              {llmFormError && (
                <div className="p-3 text-xs bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-xl leading-relaxed animate-in fade-in duration-200">
                  {llmFormError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold text-slate-500 block font-bold">配置显示名称</span>
                  <input
                    required
                    value={llmForm.displayName}
                    onChange={e => setLlmForm(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="例如: Google Gemini 2.0 Flash / 生产用备用 DeepSeek"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-500 block font-bold">AI 厂商 (Provider)</span>
                  <select
                    value={llmForm.provider}
                    onChange={e => {
                      const newProvider = e.target.value
                      setLlmForm(prev => {
                        const defaults: Record<string, string> = {
                          google: 'gemini-2.0-flash',
                          openai: 'gpt-4o',
                          anthropic: 'claude-3-5-sonnet-20241022',
                          deepseek: 'deepseek-chat',
                          custom_shim: 'custom-model',
                        }
                        const currentDefaults = [
                          'gemini-2.0-flash',
                          'gpt-4o',
                          'claude-3-5-sonnet-20241022',
                          'deepseek-chat',
                          'custom-model',
                          ''
                        ]
                        const modelName = (!prev.modelName || currentDefaults.includes(prev.modelName))
                          ? (defaults[newProvider] || '')
                          : prev.modelName

                        return {
                          ...prev,
                          provider: newProvider,
                          modelName,
                        }
                      })
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="google">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="custom_shim">Custom Shim (OpenAI Format)</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-500 block font-bold">模型标识符 (Model ID)</span>
                  <input
                    required
                    value={llmForm.modelName}
                    onChange={e => setLlmForm(prev => ({ ...prev, modelName: e.target.value }))}
                    placeholder="例如: gemini-2.0-flash, gpt-4o, claude-3-5-sonnet-20241022"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {llmForm.provider === 'google' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setLlmForm(prev => ({ ...prev, modelName: 'gemini-2.0-flash' }))}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                            llmForm.modelName === 'gemini-2.0-flash'
                              ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                          }`}
                        >
                          gemini-2.0-flash (推荐)
                        </button>
                        <button
                          type="button"
                          onClick={() => setLlmForm(prev => ({ ...prev, modelName: 'gemini-1.5-flash' }))}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                            llmForm.modelName === 'gemini-1.5-flash'
                              ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                          }`}
                        >
                          gemini-1.5-flash
                        </button>
                        <button
                          type="button"
                          onClick={() => setLlmForm(prev => ({ ...prev, modelName: 'gemini-1.5-pro' }))}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                            llmForm.modelName === 'gemini-1.5-pro'
                              ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                          }`}
                        >
                          gemini-1.5-pro
                        </button>
                      </>
                    )}
                    {llmForm.provider === 'openai' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setLlmForm(prev => ({ ...prev, modelName: 'gpt-4o' }))}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                            llmForm.modelName === 'gpt-4o'
                              ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                          }`}
                        >
                          gpt-4o (推荐)
                        </button>
                        <button
                          type="button"
                          onClick={() => setLlmForm(prev => ({ ...prev, modelName: 'gpt-4o-mini' }))}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                            llmForm.modelName === 'gpt-4o-mini'
                              ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                          }`}
                        >
                          gpt-4o-mini
                        </button>
                      </>
                    )}
                    {llmForm.provider === 'anthropic' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setLlmForm(prev => ({ ...prev, modelName: 'claude-3-5-sonnet-20241022' }))}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                            llmForm.modelName === 'claude-3-5-sonnet-20241022'
                              ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                          }`}
                        >
                          claude-3-5-sonnet (推荐)
                        </button>
                        <button
                          type="button"
                          onClick={() => setLlmForm(prev => ({ ...prev, modelName: 'claude-3-5-haiku-20241022' }))}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                            llmForm.modelName === 'claude-3-5-haiku-20241022'
                              ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                          }`}
                        >
                          claude-3-5-haiku
                        </button>
                      </>
                    )}
                    {llmForm.provider === 'deepseek' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setLlmForm(prev => ({ ...prev, modelName: 'deepseek-chat' }))}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                            llmForm.modelName === 'deepseek-chat'
                              ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                          }`}
                        >
                          deepseek-chat (V3 / R1)
                        </button>
                      </>
                    )}
                  </div>
                </label>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold text-slate-500 block font-bold">API 密钥 (API Key)</span>
                  <input
                    type="password"
                    required={!editingLLMConfig}
                    value={llmForm.apiKey}
                    onChange={e => setLlmForm(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={editingLLMConfig ? '•••••••• (若未修改请保留此值)' : '输入您的 API 密钥'}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold text-slate-500 block font-bold">代理/自定义接口端点 (Base URL)</span>
                  <input
                    value={llmForm.baseUrl}
                    required={llmForm.provider === 'custom_shim'}
                    onChange={e => setLlmForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder={
                      llmForm.provider === 'custom_shim'
                        ? "例如: https://my-custom-proxy.com/v1 (必填)"
                        : "非必填。留空使用官方默认接口"
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {llmForm.provider === 'google' && '（可选）留空使用官方接口: https://generativelanguage.googleapis.com'}
                    {llmForm.provider === 'openai' && '（可选）留空使用官方接口: https://api.openai.com/v1'}
                    {llmForm.provider === 'anthropic' && '（可选）留空使用官方接口: https://api.anthropic.com/v1'}
                    {llmForm.provider === 'deepseek' && '（可选）留空使用官方接口: https://api.deepseek.com/v1'}
                    {llmForm.provider === 'custom_shim' && '（必填）请输入您的自定义中转 API 地址'}
                  </p>
                </label>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold text-slate-500 block font-bold">匹配的任务类型标签 (Task Tags)</span>
                  <input
                    value={llmForm.taskTagsStr}
                    onChange={e => setLlmForm(prev => ({ ...prev, taskTagsStr: e.target.value }))}
                    placeholder="用英文逗号隔开，例如: copywriting, reasoning"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <p className="text-[10px] text-slate-400">
                    支持在后台按任务分类匹配。例如在 Copywriter 中填入 `copywriting`，在 AI 研究员中填入 `reasoning`。
                  </p>
                </label>
              </div>

              <div className="flex gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={llmForm.isEnabled}
                    onChange={e => setLlmForm(prev => ({ ...prev, isEnabled: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">启用此配置</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={llmForm.isDefault}
                    onChange={e => setLlmForm(prev => ({ ...prev, isDefault: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">设为兜底默认模型</span>
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLlmConfigModalOpen(false)
                    setEditingLLMConfig(null)
                  }}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingLLMConfig}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 font-bold"
                >
                  {savingLLMConfig ? '正在验证接口并保存...' : '验证并保存配置'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeAdminTab === 'conversation-log' && (
        <TrainingDataSection brands={brands.map(b => ({ id: b.id, name: b.name }))} />
      )}

      {invitationData && (
        renderInviteModal({ title: '用户创建成功！', data: { email: invitationData.user.email, temporaryPassword: invitationData.temporaryPassword, invitationLink: invitationData.invitationLink }, onClose: () => setInvitationData(null) })
      )}
      {resetData && (
        <div>
          {renderInviteModal({ title: '密码已重置', data: resetData, onClose: () => setResetData(null) })}
          {resetData.emailSent !== undefined && (
            <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium ${
              resetData.emailSent
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-200'
            }`}>
              {resetData.emailSent ? '📧 密码重置邮件已发送至用户邮箱' : '📭 SMTP 未配置，请手动将密码发送给用户'}
            </div>
          )}
        </div>
      )}

      {/* EditUserModal */}
      <EditUserModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSaved={(updated) => {
          setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, email: updated.email, nickname: updated.nickname, role: updated.role } as UserRecord : u))
          setEditingUser(null)
        }}
      />
    </div>
  )
}
