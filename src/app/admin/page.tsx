'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  Shield, User, Bot, RefreshCw, Copy, Check, ArrowLeft, Users, Store, CreditCard, Sparkles, MessageSquare, Menu, Settings
} from 'lucide-react'

// Import Tab Components
import UsersTab, { type UserRecord } from '@/components/admin/UsersTab'
import BrandsTab, { type BrandRecord } from '@/components/admin/BrandsTab'
import SystemTab, { type LLMConfigRecord } from '@/components/admin/SystemTab'
import { type AssignmentPoolConfig, type AssignmentPoolMember, type AssignmentDecision } from '@/components/shared/types'
import PlatformAiTab from '@/components/admin/PlatformAiTab'
import EditUserModal from '@/components/admin/EditUserModal'

type AdminTab = 'users' | 'brands' | 'system' | 'platform-ai'

interface InvitationResult {
  user: { id: string; email: string; type: string }
  temporaryPassword: string
  invitationLink: string
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-955 flex items-center justify-center text-xs text-slate-400 font-extrabold">
        正在初始化系统设置...
      </div>
    }>
      <AdminPageInner />
    </Suspense>
  )
}

function AdminPageInner() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [brands, setBrands] = useState<BrandRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [brandsLoading, setBrandsLoading] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>((tabParam as AdminTab) || 'users')

  // Modals state
  const [invitationData, setInvitationData] = useState<InvitationResult | null>(null)
  const [resetData, setResetData] = useState<{ email: string; resetLink: string; emailSent?: boolean } | null>(null)
  const [editingUser, setEditingUser] = useState<{ id: string; email: string; nickname: string | null; role: string; type: string } | null>(null)
  
  const [savingPerms, setSavingPerms] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  
  // Pool data states
  const [poolConfig, setPoolConfig] = useState<AssignmentPoolConfig | null>(null)
  const [poolMembers, setPoolMembers] = useState<AssignmentPoolMember[]>([])
  const [poolDecisions, setPoolDecisions] = useState<AssignmentDecision[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolDrafts, setPoolDrafts] = useState<Record<string, { capacity: number; priority: number; industries: string; regions: string }>>({})
  
  // Brand draft states
  const [brandDrafts, setBrandDrafts] = useState<Record<string, { name: string; location: string; status: string; ownerUserId: string; planId: string; subscriptionStatus: string; durationMonths: number; agentIds: string[] }>>({})

  // LLM Config state
  const [llmConfigs, setLlmConfigs] = useState<LLMConfigRecord[]>([])
  const [llmConfigsLoading, setLlmConfigsLoading] = useState(false)

  // System config & audit logs states
  const [systemConfig, setSystemConfig] = useState<{
    geminiApiKey: string
    geminiConfigured: boolean
    minimaxApiKey: string
    minimaxConfigured: boolean
    // SMTP
    smtpHost: string
    smtpPort: number | null
    smtpUser: string
    smtpPassword: string
    smtpFrom: string
    smtpFromName: string
    smtpSecure: boolean
    smtpConfigured: boolean
    // Direct Social integrations
    metaAppId: string
    metaAppSecret: string
    metaAppSecretConfigured: boolean
    metaRedirectUri: string
    googleClientId: string
    googleClientSecret: string
    googleClientSecretConfigured: boolean
    googleRedirectUri: string
    tiktokClientKey: string
    tiktokClientSecret: string
    tiktokClientSecretConfigured: boolean
    tiktokRedirectUri: string
    useDirectPublishing: boolean
  } | null>(null)
  const [systemLogs, setSystemLogs] = useState<any[]>([])
  const [systemLogsLoading, setSystemLogsLoading] = useState(false)
  const [savingSystemConfig, setSavingSystemConfig] = useState(false)
  const [creating, setCreating] = useState(false)

  // Fetching methods
  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) setUsers(await res.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
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
          planId: subscription?.planId || '',
          subscriptionStatus: subscription?.status || '',
          durationMonths: subscription?.durationMonths || 12,
          agentIds: brand.brandAgents.map((link) => link.agentId),
        }]
      })))
    } catch (e) {
      console.error(e)
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
    } catch (e) {
      console.error(e)
    } finally {
      setPoolLoading(false)
    }
  }

  const fetchDecisionLogs = async () => {
    try {
      const res = await fetch('/api/admin/agent-assignment/decisions?page=1&pageSize=20')
      if (res.ok) {
        const data = await res.json()
        setPoolDecisions(data.data || [])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchSystemConfig = async () => {
    try {
      const res = await fetch('/api/admin/system-config')
      if (res.ok) setSystemConfig(await res.json())
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

  const fetchLLMConfigs = async () => {
    setLlmConfigsLoading(true)
    try {
      const res = await fetch('/api/admin/llm-configs')
      if (res.ok) {
        const data = await res.json()
        setLlmConfigs(data.configs || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLlmConfigsLoading(false)
    }
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

  useEffect(() => {
    if (tabParam && ['users', 'brands', 'system', 'platform-ai'].includes(tabParam)) {
      setActiveAdminTab(tabParam as AdminTab)
    }
  }, [tabParam])

  // User tab mutate API handlers
  const handleCreateUser = async (emailStr: string, typeStr: string, roleStr: string) => {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailStr, type: typeStr, role: roleStr }),
      })
      const data = await res.json()
      if (res.ok) {
        setInvitationData(data)
        void fetchUsers()
      } else {
        alert(data.error || '创建用户失败')
      }
    } catch (e) {
      console.error(e)
      alert('网络连接错误')
    } finally {
      setCreating(false)
    }
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
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '更新角色失败')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[user.id + '_role']; return n })
    }
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
    } catch (e) {
      console.error(e)
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
    if (!confirm(`确认要为 ${user.email} 发送密码重置链接吗？`)) return
    setActionLoading(p => ({ ...p, [user.id + '_reset']: '1' }))
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetPassword: true }),
      })
      if (res.ok) {
        const data = await res.json()
        setResetData({ email: user.email, resetLink: data.resetLink, emailSent: data.emailSent })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[user.id + '_reset']; return n })
    }
  }

  const handleDeleteUser = async (user: UserRecord) => {
    if (!confirm(`确认删除用户 ${user.email}？此操作不可撤销。`)) return
    setActionLoading(p => ({ ...p, [user.id + '_del']: '1' }))
    try {
      const res = await fetch(user.type === 'AI_AGENT' ? `/api/agents/${user.id}` : `/api/admin/users/${user.id}`, { method: 'DELETE' })
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== user.id))
        void fetchPoolData()
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error || '删除失败')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[user.id + '_del']; return n })
    }
  }

  const handleSavePermissions = async (humanId: string, agentIds: string[]) => {
    setSavingPerms(true)
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ humanId, agentIds }),
      })
      if (res.ok) {
        void fetchUsers()
      } else {
        alert('保存运营权限失败')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSavingPerms(false)
    }
  }

  // Brands tab mutate API handlers
  const handleUpdateBrandDraft = (brandId: string, patch: any) => {
    setBrandDrafts(prev => ({
      ...prev,
      [brandId]: {
        ...prev[brandId],
        ...patch
      }
    }))
  }

  const handleSaveBrandDraft = async (brand: BrandRecord) => {
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
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[brand.id + '_brand']; return n })
    }
  }

  /**
   * Create a new brand + subscription in one step (kanban admin/principal entry).
   * Calls the same /api/mm/subscription endpoint used by MM side with paymentMode=BILLING.
   * - createdById: automatically set to session.user.id (admin/principal) by the API
   * - ownerId: resolved from ownerEmail by createBrandForActivatedSubscription
   */
  const handleCreateBrand = async (params: {
    brandName: string
    ownerEmail: string
    planId: string
    durationMonths: number
    location?: string
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/mm/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingBrandName: params.brandName,
          pendingBrandOwnerEmail: params.ownerEmail,
          pendingBrandLocation: params.location ?? '',
          planId: params.planId,
          durationMonths: params.durationMonths,
          paymentMode: 'BILLING',  // Direct activation, no Stripe — same as offline/admin activation
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, error: data.error || `创建失败 (${res.status})` }
      }
      await fetchBrands()
      return { ok: true }
    } catch (e) {
      console.error('[handleCreateBrand]', e)
      return { ok: false, error: '网络错误，请重试' }
    }
  }

  // Agents tab mutate API handlers
  const handleUpdatePoolDraft = (agentId: string, patch: any) => {
    setPoolDrafts(prev => ({
      ...prev,
      [agentId]: {
        capacity: prev[agentId]?.capacity ?? 30,
        priority: prev[agentId]?.priority ?? 100,
        industries: prev[agentId]?.industries ?? '',
        regions: prev[agentId]?.regions ?? '',
        ...patch,
      }
    }))
  }

  const handleCreatePoolMember = async (agent: UserRecord) => {
    const draft = poolDrafts[agent.id] || { capacity: 30, priority: 100, industries: '', regions: '' }
    setActionLoading(p => ({ ...p, [agent.id + '_pool']: '1' }))
    try {
      const res = await fetch('/api/admin/agent-assignment-pool/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          capacity: draft.capacity,
          priority: draft.priority,
          industries: typeof draft.industries === 'string' ? draft.industries.split(',').map(s => s.trim()).filter(Boolean) : draft.industries,
          regions: typeof draft.regions === 'string' ? draft.regions.split(',').map(s => s.trim()).filter(Boolean) : draft.regions,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '新增池成员失败')
        return
      }
      await fetchPoolData()
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[agent.id + '_pool']; return n })
    }
  }

  const handlePatchPoolMember = async (member: AssignmentPoolMember, patch: Partial<AssignmentPoolMember>) => {
    setActionLoading(p => ({ ...p, [member.agentId + '_pool']: '1' }))
    try {
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
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[member.agentId + '_pool']; return n })
    }
  }

  const handleDeletePoolMember = async (member: AssignmentPoolMember) => {
    if (!confirm(`确认将 ${member.agentNickname || member.agentId} 从分配池移除？`)) return
    try {
      const res = await fetch(`/api/admin/agent-assignment-pool/members/${member.agentId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '移除池成员失败')
        return
      }
      await fetchPoolData()
    } catch (e) {
      console.error(e)
    }
  }

  const handleSaveAgentPrincipals = async (agentId: string, humanIds: string[]) => {
    setSavingPerms(true)
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, humanIds }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '保存主理人分配失败')
        return
      }
      await fetchUsers()
    } catch (e) {
      console.error(e)
    } finally {
      setSavingPerms(false)
    }
  }

  const handleSaveAgentDraft = async (agentId: string, draft: any): Promise<boolean> => {
    setActionLoading(p => ({ ...p, [agentId + '_edit']: '1' }))
    try {
      const res = await fetch(`/api/admin/users/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || '保存 Agent 失败')
        return false
      }
      await fetchUsers()
      return true
    } catch (e) {
      console.error(e)
      return false
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[agentId + '_edit']; return n })
    }
  }

  // System Config mutate API handlers
  const handleSaveSystemConfig = async () => {
    if (!systemConfig) return
    setSavingSystemConfig(true)
    try {
      const res = await fetch('/api/admin/system-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: systemConfig.geminiApiKey,
          minimaxApiKey: systemConfig.minimaxApiKey,
          metaAppId: systemConfig.metaAppId,
          metaAppSecret: systemConfig.metaAppSecret,
          metaRedirectUri: systemConfig.metaRedirectUri,
          googleClientId: systemConfig.googleClientId,
          googleClientSecret: systemConfig.googleClientSecret,
          googleRedirectUri: systemConfig.googleRedirectUri,
          tiktokClientKey: systemConfig.tiktokClientKey,
          tiktokClientSecret: systemConfig.tiktokClientSecret,
          tiktokRedirectUri: systemConfig.tiktokRedirectUri,
          useDirectPublishing: systemConfig.useDirectPublishing,
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

  // Helper copy modal link utils
  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const CopyField = ({ label, value, fieldKey }: { label: string; value: string; fieldKey: string }) => (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-655 dark:text-gray-400">{label}</label>
      <div className="flex gap-2">
        <input readOnly value={value} className="flex-1 border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 dark:text-white rounded-xl px-3 py-2 font-mono text-xs min-w-0" />
        <button onClick={() => copyText(value, fieldKey)} className="px-3 py-2 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300 rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-all flex-shrink-0 cursor-pointer">
          {copied === fieldKey ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )

  const renderInviteModal = ({ title, data, onClose }: { title: string; data: { email: string; temporaryPassword: string; invitationLink: string; apiKey?: string | null }; onClose: () => void }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-5 border border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white">{title}</h2>
          <p className="text-xs text-slate-400 mt-1">请复制邀请凭证并发送给相应用户登录：</p>
        </div>
        <div className="space-y-4">
          <CopyField label="注册邮箱" value={data.email} fieldKey="modal_email" />
          <CopyField label="临时初始密码 (7 天有效期)" value={data.temporaryPassword} fieldKey="modal_pw" />
          <CopyField label="系统邀请登录链接" value={data.invitationLink} fieldKey="modal_link" />
          {data.apiKey && (
            <CopyField label="智能体委任 API 密钥 (Initial API Key)" value={data.apiKey} fieldKey="modal_apikey" />
          )}
        </div>
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-955/20 border border-amber-200 dark:border-amber-900 text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
          ⚠️ 临时密码与 API 密钥只会展示一次，请务必在关闭弹窗前完成复制。
        </div>
        <div className="flex justify-between items-center gap-3 pt-2">
          <button
            onClick={() => {
              let copyStr = `邮箱: ${data.email}\n临时密码: ${data.temporaryPassword}\n邀请链接: ${data.invitationLink}`
              if (data.apiKey) copyStr += `\nAPI Key: ${data.apiKey}`
              copyText(copyStr, 'all')
            }}
            className="px-4 py-2 text-xs border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 rounded-xl hover:bg-slate-105 dark:hover:bg-gray-800 transition-all flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900"
          >
            {copied === 'all' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />} 
            <span>复制全部信息</span>
          </button>
          <button onClick={onClose} className="px-5 py-2 text-xs bg-blue-650 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-sm cursor-pointer">完成</button>
        </div>
      </div>
    </div>
  )

  const humans = users.filter(u => u.type === 'HUMAN')
  const agents = users.filter(u => u.type === 'AI_AGENT')

  // Grouped Navigation Definition (Refactored to 4 Main Menus)
  const navigationGroups = [
    {
      title: '日常运营管理 (Operations)',
      items: [
        { id: 'users' as const, label: '用户与权限管理', icon: Users },
        { id: 'brands' as const, label: '托管品牌与派单', icon: Store },
      ]
    },
    {
      title: '系统架构配置 (Infrastructure)',
      items: [
        { id: 'system' as const, label: '系统服务与设置', icon: Settings },
        { id: 'platform-ai' as const, label: '平台AI与语料学习', icon: MessageSquare },
      ]
    }
  ]

  return (
    <div className="admin-page min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row text-slate-800 dark:text-slate-200">
      <style>{`
        .admin-page {
          --admin-border: rgb(226 232 240);
          --admin-muted: rgb(100 116 139);
          --admin-panel: #ffffff;
          --admin-soft: rgb(248 250 252);
          --admin-accent: rgb(37 99 235);
        }
        .dark .admin-page {
          --admin-border: rgb(30 41 59);
          --admin-muted: rgb(148 163 184);
          --admin-panel: rgb(15 23 42);
          --admin-soft: rgb(2 6 23);
          --admin-accent: rgb(96 165 250);
        }
        .admin-toolbar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          border: 1px solid var(--admin-border);
          background: var(--admin-panel);
          padding: 0.75rem;
          border-radius: 0.5rem;
        }
        .admin-list {
          overflow-x: auto;
          border: 1px solid var(--admin-border);
          background: var(--admin-panel);
          border-radius: 0.5rem;
        }
        .admin-list table th,
        .admin-list table td {
          padding: 0.75rem 1rem;
          vertical-align: middle;
          white-space: nowrap;
        }
        .admin-list table th {
          border-bottom: 1px solid var(--admin-border);
          background: var(--admin-soft);
          color: var(--admin-muted);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .admin-list table tbody tr {
          border-bottom: 1px solid color-mix(in srgb, var(--admin-border) 70%, transparent);
        }
        .admin-list table tbody tr:last-child {
          border-bottom: 0;
        }
        .admin-list table tbody tr:hover {
          background: color-mix(in srgb, var(--admin-soft) 72%, transparent);
        }
        .admin-input {
          width: 100%;
          min-height: 2.25rem;
          border: 1px solid var(--admin-border);
          border-radius: 0.375rem;
          background: var(--admin-panel);
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          outline: none;
        }
        .admin-input:focus {
          border-color: var(--admin-accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--admin-accent) 16%, transparent);
        }
        .admin-primary-button,
        .admin-secondary-button,
        .admin-danger-button,
        .admin-icon-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.375rem;
          min-height: 2.25rem;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 700;
          transition: background-color .15s ease, border-color .15s ease, color .15s ease, opacity .15s ease;
          cursor: pointer;
        }
        .admin-primary-button {
          border: 1px solid rgb(37 99 235);
          background: rgb(37 99 235);
          color: white;
          padding: 0.5rem 0.875rem;
        }
        .admin-primary-button:hover {
          background: rgb(29 78 216);
        }
        .admin-primary-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .admin-secondary-button {
          border: 1px solid var(--admin-border);
          background: var(--admin-panel);
          color: rgb(51 65 85);
          padding: 0.5rem 0.875rem;
        }
        .dark .admin-secondary-button {
          color: rgb(203 213 225);
        }
        .admin-secondary-button:hover,
        .admin-icon-button:hover {
          background: var(--admin-soft);
        }
        .admin-danger-button {
          border: 1px solid rgb(225 29 72);
          background: rgb(225 29 72);
          color: white;
          padding: 0.5rem 0.875rem;
        }
        .admin-danger-button:hover {
          background: rgb(190 18 60);
        }
        .admin-icon-button {
          width: 2.25rem;
          border: 1px solid var(--admin-border);
          background: var(--admin-panel);
          color: rgb(71 85 105);
        }
        .dark .admin-icon-button {
          color: rgb(203 213 225);
        }
        .admin-danger-icon {
          color: rgb(225 29 72);
        }
        .admin-badge {
          display: inline-flex;
          align-items: center;
          border-radius: 0.25rem;
          border: 1px solid transparent;
          padding: 0.125rem 0.4rem;
          font-size: 0.65rem;
          font-weight: 800;
        }
        .admin-badge-indigo {
          border-color: rgb(199 210 254);
          background: rgb(238 242 255);
          color: rgb(79 70 229);
        }
        .admin-badge-blue {
          border-color: rgb(191 219 254);
          background: rgb(239 246 255);
          color: rgb(37 99 235);
        }
        .admin-badge-green {
          border-color: rgb(187 247 208);
          background: rgb(240 253 244);
          color: rgb(22 101 52);
        }
        .dark .admin-badge-indigo,
        .dark .admin-badge-blue,
        .dark .admin-badge-green {
          background: rgb(15 23 42);
          border-color: rgb(51 65 85);
          color: rgb(203 213 225);
        }
        .admin-check {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          color: rgb(71 85 105);
          font-size: 0.75rem;
          font-weight: 700;
        }
        .dark .admin-check {
          color: rgb(203 213 225);
        }
        .admin-field {
          display: grid;
          gap: 0.375rem;
        }
        .admin-field > span {
          color: var(--admin-muted);
          font-size: 0.7rem;
          font-weight: 800;
        }
        .admin-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgb(15 23 42 / 0.55);
          padding: 1rem;
        }
        .admin-modal {
          width: 100%;
          overflow: hidden;
          border: 1px solid var(--admin-border);
          border-radius: 0.5rem;
          background: var(--admin-panel);
          box-shadow: 0 18px 48px rgb(15 23 42 / 0.18);
        }
        .admin-modal-header,
        .admin-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border-bottom: 1px solid var(--admin-border);
          padding: 1rem 1.25rem;
        }
        .admin-modal-header h2 {
          font-size: 0.9rem;
          font-weight: 800;
          color: rgb(15 23 42);
        }
        .dark .admin-modal-header h2 {
          color: white;
        }
        .admin-modal-header p {
          margin-top: 0.125rem;
          color: var(--admin-muted);
          font-size: 0.75rem;
        }
        .admin-modal-footer {
          border-top: 1px solid var(--admin-border);
          border-bottom: 0;
          padding: 1rem 0 0;
        }
        .admin-page .rounded-2xl,
        .admin-page .rounded-3xl,
        .admin-page .rounded-xl {
          border-radius: 0.5rem !important;
        }
        .admin-page .shadow-sm,
        .admin-page .shadow-md,
        .admin-page .shadow-xl,
        .admin-page .shadow-2xl {
          box-shadow: none !important;
        }
        .admin-page p.leading-relaxed,
        .admin-page .tracking-widest {
          letter-spacing: 0 !important;
        }
        html:not(.dark) .admin-page,
        html:not(.dark) .admin-page input,
        html:not(.dark) .admin-page select,
        html:not(.dark) .admin-page textarea {
          color: #000000;
        }
        html:not(.dark) .admin-page .text-slate-900,
        html:not(.dark) .admin-page .text-slate-800,
        html:not(.dark) .admin-page .text-slate-700,
        html:not(.dark) .admin-page .text-slate-655,
        html:not(.dark) .admin-page .text-slate-600,
        html:not(.dark) .admin-page .text-slate-500 {
          color: #000000 !important;
        }
        html:not(.dark) .admin-page .text-slate-400 {
          color: rgba(0, 0, 0, 0.65) !important;
        }
        html:not(.dark) .admin-page .text-slate-450 {
          color: rgba(0, 0, 0, 0.70) !important;
        }
      `}</style>

      {/* Sidebar navigation */}
      <aside className="w-full md:w-64 bg-white dark:bg-slate-900 border-r border-b md:border-b-0 border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0">
        {/* Logo Branding */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-wider text-slate-900 dark:text-white leading-none">AMC Console</h1>
              <span className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mt-1 block">System Admin Panel</span>
            </div>
          </div>
          <button 
            onClick={() => router.push('/board')} 
            className="p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-550 dark:text-slate-400 hover:text-blue-650 dark:hover:text-blue-450 transition-colors"
            title="返回看板"
          >
            <ArrowLeft size={14} />
          </button>
        </div>

        {/* Group Navigation */}
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto scrollbar-thin">
          {navigationGroups.map((group) => (
            <div key={group.title} className="space-y-1.5">
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-3">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const IconComponent = item.icon
                  const isActive = activeAdminTab === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveAdminTab(item.id)
                        if (item.id === 'system') {
                          void fetchSystemConfig()
                          void fetchSystemLogs()
                          void fetchLLMConfigs()
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-650 text-white shadow-sm ring-1 ring-blue-500/10'
                          : 'text-slate-655 hover:bg-slate-50 dark:text-slate-350 dark:hover:bg-slate-850/40'
                      }`}
                    >
                      <IconComponent size={14} className={isActive ? 'text-white' : 'text-slate-450'} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer overview count */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[10px] text-slate-450 leading-relaxed font-semibold space-y-3">
          <button
            onClick={() => router.push('/admin/content-lab')}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-black text-white shadow-sm hover:bg-indigo-700 transition-all cursor-pointer"
          >
            <Sparkles size={14} />
            Content Lab
          </button>
          <p>人类用户: {humans.length} | AI: {agents.length}</p>
          <p>管理品牌: {brands.length} | 模型: {llmConfigs.length}</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-6 overflow-y-auto max-w-7xl mx-auto w-full">
        {activeAdminTab === 'users' && (
          <UsersTab 
            users={users}
            loading={loading}
            creating={creating}
            actionLoading={actionLoading}
            onCreateUser={handleCreateUser}
            onRoleToggle={handleRoleToggle}
            onToggleBusinessRole={toggleBusinessRole}
            onResetPassword={handleResetPassword}
            onDeleteUser={handleDeleteUser}
            onSavePermissions={handleSavePermissions}
            savingPerms={savingPerms}
            brands={brands}
            onFetchBrands={fetchBrands}
            
            // AI Agent specific props
            poolMembers={poolMembers}
            poolDrafts={poolDrafts}
            onUpdatePoolDraft={handleUpdatePoolDraft}
            onPatchPoolMember={handlePatchPoolMember}
            onDeletePoolMember={handleDeletePoolMember}
            onCreatePoolMember={handleCreatePoolMember}
            onSaveAgentPrincipals={handleSaveAgentPrincipals}
            onSaveAgentDraft={handleSaveAgentDraft}
            onFetchUsers={fetchUsers}
          />
        )}

        {activeAdminTab === 'brands' && (
          <BrandsTab 
            brands={brands}
            brandsLoading={brandsLoading}
            humans={humans}
            agents={agents}
            brandDrafts={brandDrafts}
            actionLoading={actionLoading}
            onUpdateBrandDraft={handleUpdateBrandDraft}
            onSaveBrandDraft={handleSaveBrandDraft}
            onFetchBrands={fetchBrands}
            onCreateBrand={handleCreateBrand}

            // Dispatch Pool props
            poolConfig={poolConfig}
            poolMembers={poolMembers}
            poolDecisions={poolDecisions}
            poolLoading={poolLoading}
            onFetchPoolData={fetchPoolData}
            onFetchDecisionLogs={fetchDecisionLogs}
            onPatchPoolMember={handlePatchPoolMember}
            onDeletePoolMember={handleDeletePoolMember}
            onCreatePoolMember={handleCreatePoolMember}
          />
        )}

        {activeAdminTab === 'system' && (
          <SystemTab 
            systemConfig={systemConfig}
            onUpdateSystemConfig={setSystemConfig}
            onSaveSystemConfig={handleSaveSystemConfig}
            savingSystemConfig={savingSystemConfig}
            systemLogs={systemLogs}
            systemLogsLoading={systemLogsLoading}
            onFetchSystemLogs={fetchSystemLogs}

            // LLM configs props
            llmConfigs={llmConfigs}
            llmConfigsLoading={llmConfigsLoading}
            onFetchLLMConfigs={fetchLLMConfigs}
          />
        )}

        {activeAdminTab === 'platform-ai' && (
          <PlatformAiTab 
            users={users}
            brands={brands.map(b => ({ id: b.id, name: b.name }))}
            loading={loading}
            actionLoading={actionLoading}
            onSaveAgentDraft={handleSaveAgentDraft}
            onCreateUser={handleCreateUser}
            onFetchUsers={fetchUsers}
          />
        )}
      </main>

      {/* Global Modals */}
      {invitationData && (
        renderInviteModal({ 
          title: '🎉 用户凭证创建成功！', 
          data: { 
            email: invitationData.user.email, 
            temporaryPassword: invitationData.temporaryPassword, 
            invitationLink: invitationData.invitationLink 
          }, 
          onClose: () => setInvitationData(null) 
        })
      )}
      {resetData && (
        <div>
          {/* Simple result panel — the reset link was emailed, no need to show it in admin UI */}
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setResetData(null)}>
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">密码重置链接已生成</h3>
                  <p className="text-xs text-slate-500">{resetData.email}</p>
                </div>
              </div>
              {resetData.emailSent ? (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 leading-relaxed">
                  ✅ 密码重置邮件已发送至用户邮箱。用户点击邮件中的链接即可设置新密码，有效期 24 小时。
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 leading-relaxed">
                    ⚠️ SMTP 未配置，邮件未发出。请手动将以下重置链接发给用户（有效期 24h）：
                  </p>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 text-xs font-mono text-slate-600 dark:text-slate-300 break-all select-all border border-slate-200 dark:border-slate-700">
                    {resetData.resetLink}
                  </div>
                </div>
              )}
              <button onClick={() => setResetData(null)} className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm transition-colors">
                关闭
              </button>
            </div>
          </div>
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
