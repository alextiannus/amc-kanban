'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildAmcSkillText, buildLaunchInstruction } from '../../lib/agentInitPrompt'

type ProfileData = {
  type: string
  dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
  userRoles?: string[]
}

const baseUrl = 'https://amc-kanban.immedi.ai'

interface OperationItem {
  id: string
  action: string
  actionCn: string
  mcpName: string
  mcpParams: string
  restMethod?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  restUrl?: string
  restParams?: string
  desc: string
  payloadExample: string
}

const ASSET_OPERATIONS: OperationItem[] = [
  {
    id: 'list_assets',
    action: 'List Assets',
    actionCn: '获取素材列表',
    mcpName: 'board_list_assets',
    mcpParams: 'brandId, q?, folder?, readyOnly?, limit?',
    restMethod: 'GET',
    restUrl: '/api/brands/[id]/assets',
    restParams: 'q?, folder?',
    desc: 'List brand media assets uploaded to the asset library, with optional filtering by categories, ready status, or text search.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "folder": "素材库",
  "readyOnly": true
}`
  },
  {
    id: 'upload_asset',
    action: 'Upload Asset',
    actionCn: '上传素材',
    mcpName: 'board_upload_asset',
    mcpParams: 'brandId, filename, fileBase64?, imageUrl?, mimeType?, folder?, aiTags?, aiCaption?',
    restMethod: 'POST',
    restUrl: '/api/brands/[id]/assets',
    restParams: 'filename, fileBase64?, imageUrl?, mimeType?, folder?, aiTags?, aiCaption?',
    desc: 'Upload a media asset (e.g. image) into the brand\'s library. Provide either a base64 encoded string OR a direct imageUrl to download. The backend resolves storage automatically.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "filename": "ziwei-kaoyu.jpg",
  "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/.../Grilled_Fish.jpg",
  "folder": "素材库",
  "aiTags": ["烤鱼", "美食"],
  "aiCaption": "Chinese Grilled Fish"
}`
  },
  {
    id: 'get_asset',
    action: 'Get Asset Details',
    actionCn: '读取单张素材',
    mcpName: 'board_get_asset',
    mcpParams: 'brandId, assetId',
    restMethod: 'GET',
    restUrl: '/api/brands/[id]/assets/[assetId]',
    desc: 'Retrieve metadata details and public/storage URL of a specific media asset from the brand\'s asset library by ID.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "assetId": "asset_id_here"
}`
  },
  {
    id: 'update_asset',
    action: 'Update Asset',
    actionCn: '更新素材属性',
    mcpName: 'board_update_asset',
    mcpParams: 'brandId, assetId, filename?, folder?, aiCaption?, aiTags?, aiReady?',
    restMethod: 'PATCH',
    restUrl: '/api/brands/[id]/assets/[assetId]',
    restParams: 'filename?, folder?, aiCaption?, aiTags?, aiReady?',
    desc: 'Update specific properties of a brand media asset, such as renaming it, changing its category, tags, or ready status.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "assetId": "asset_id_here",
  "aiReady": true,
  "folder": "已发布素材"
}`
  },
  {
    id: 'delete_asset',
    action: 'Archive Asset',
    actionCn: '下架/归档素材',
    mcpName: 'board_delete_asset',
    mcpParams: 'brandId, assetId',
    restMethod: 'DELETE',
    restUrl: '/api/brands/[id]/assets/[assetId]',
    desc: 'Soft-delete (archive) a brand media asset by setting its folder to \'archived\' and ready status to false.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "assetId": "asset_id_here"
}`
  }
]

const DRAFT_OPERATIONS: OperationItem[] = [
  {
    id: 'list_drafts',
    action: 'List Drafts',
    actionCn: '草稿列表',
    mcpName: 'board_list_drafts',
    mcpParams: 'brandId, status?, q?, limit?',
    restMethod: 'GET',
    restUrl: '/api/brands/[id]/drafts',
    restParams: 'status?, q?',
    desc: 'List content drafts for a brand. Use status filters (draft, pending_review, scheduled, published, failed) or keyword search.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "status": "draft"
}`
  },
  {
    id: 'save_draft',
    action: 'Create/Update Draft',
    actionCn: '保存/更新草稿',
    mcpName: 'board_save_draft',
    mcpParams: 'brandId, draftId?, caption?, hashtags?, accountId?, scheduledAt?, mediaUrls?, assetIds?, agentNote?, captionLang?',
    restMethod: 'POST',
    restUrl: '/api/brands/[id]/drafts or PATCH /api/brands/[id]/drafts/[draftId]',
    restParams: 'caption?, hashtags?, accountId?, scheduledAt?, mediaUrls?, assetIds?, agentNote?, captionLang?',
    desc: 'Create or update a content draft. Supports partial updates: if draftId is passed, omitted fields are preserved (e.g. to modify only scheduledAt).',
    payloadExample: `{
  "brandId": "brand_id_here",
  "draftId": "draft_id_here",
  "scheduledAt": "2026-06-15T09:00:00Z",
  "agentNote": "Scheduled for Monday morning peak traffic."
}`
  },
  {
    id: 'get_draft',
    action: 'Get Draft Details',
    actionCn: '读取单篇草稿',
    mcpName: 'board_get_draft',
    mcpParams: 'brandId, draftId',
    restMethod: 'GET',
    restUrl: '/api/brands/[id]/drafts/[draftId]',
    desc: 'Retrieve full details of a specific content draft, including associated social account and linked media asset records.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "draftId": "draft_id_here"
}`
  },
  {
    id: 'submit_draft',
    action: 'Submit/Publish Draft',
    actionCn: '提交发布排期',
    mcpName: 'board_submit_draft',
    mcpParams: 'brandId, draftId, note?',
    restMethod: 'PATCH',
    restUrl: '/api/brands/[id]/drafts/[draftId]/submit',
    restParams: 'note?',
    desc: 'Submit a draft. Auto-pilot brands will publish or schedule directly. Boss-approval brands create a pending review action item.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "draftId": "draft_id_here",
  "note": "Submitting for review."
}`
  },
  {
    id: 'delete_draft',
    action: 'Delete Draft',
    actionCn: '删除/取消草稿',
    mcpName: 'board_delete_draft',
    mcpParams: 'brandId, draftId',
    desc: 'Delete a draft from the database. If it is scheduled but not yet published, the scheduling on the PostFast backend is canceled first.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "draftId": "draft_id_here"
}`
  }
]

const CORE_OPERATIONS: OperationItem[] = [
  {
    id: 'get_brand_config',
    action: 'Get Brand Settings',
    actionCn: '获取品牌配置',
    mcpName: 'get_brand_config',
    mcpParams: 'brandId?',
    restMethod: 'GET',
    restUrl: '/api/agent/brand-config',
    restParams: 'brandId?',
    desc: 'Retrieve brand profile details and linked social channels for linked brands.',
    payloadExample: `{
  "brandId": "brand_id_here"
}`
  },
  {
    id: 'get_brand_profile_md',
    action: 'Get Brand Profile MD',
    actionCn: '读取品牌详情 Markdown',
    mcpName: 'get_brand_profile_markdown',
    mcpParams: 'brandId, refresh?',
    restMethod: 'GET',
    restUrl: '/api/brands/[id]/profile',
    restParams: 'refresh?',
    desc: 'Read brand context profile markdown (basics, positioning, platform configurations) for AI context pre-read.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "refresh": true
}`
  },
  {
    id: 'update_brand_config',
    action: 'Update Brand Settings',
    actionCn: '更新品牌配置',
    mcpName: 'update_brand_config',
    mcpParams: 'brandId, name?, description?, website?, location?, timezone?, postfastApiKey?, larkAppId?, larkAppSecret?, ...',
    restMethod: 'PATCH',
    restUrl: '/api/agent/brand-config',
    desc: 'Modify brand configuration or update integration credentials (like Lark Drive folder or PostFast API keys).',
    payloadExample: `{
  "brandId": "brand_id_here",
  "description": "Updated brand tagline and positioning details."
}`
  },
  {
    id: 'list_tasks',
    action: 'List Kanban Tasks',
    actionCn: '获取任务列表',
    mcpName: 'list_tasks',
    mcpParams: 'brandId?, status?, assignedToMe?, limit?',
    desc: 'Query Kanban work units assigned to the agent or filtered by brand/status.',
    payloadExample: `{
  "brandId": "brand_id_here",
  "status": "todo",
  "assignedToMe": true
}`
  },
  {
    id: 'create_task',
    action: 'Create Kanban Task',
    actionCn: '创建看板任务',
    mcpName: 'create_task',
    mcpParams: 'title, description?, status?, priority?, weight?, requiredInput?, deadline?, brandId?',
    restMethod: 'POST',
    restUrl: '/api/tasks',
    desc: 'Log action items, draft notifications, or other deliverables on the Kanban board.',
    payloadExample: `{
  "title": "Analyze competitor summer designs",
  "brandId": "brand_id_here",
  "status": "todo",
  "priority": "high"
}`
  },
  {
    id: 'update_task',
    action: 'Update Kanban Task',
    actionCn: '更新看板任务',
    mcpName: 'update_task',
    mcpParams: 'taskId, title?, description?, status?, priority?, requiredInput?, deadline?, brandId?',
    restMethod: 'PATCH',
    restUrl: '/api/tasks/[id]',
    desc: 'Modify status (todo/in_progress/pending/done), record logs, or request human input on blockages.',
    payloadExample: `{
  "taskId": "task_id_here",
  "status": "pending",
  "requiredInput": "Please provide the latest brand guidelines PDF."
}`
  }
]

export default function ConnectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [isPublicOnly, setIsPublicOnly] = useState(false)
  const [copiedMcp, setCopiedMcp] = useState(false)
  const [activeCategory, setActiveCategory] = useState<'assets' | 'drafts' | 'core'>('assets')
  const [expandedOperation, setExpandedOperation] = useState<string | null>(null)
  const [skillTab, setSkillTab] = useState<'onboarding' | 'skill'>('onboarding')
  const [copiedSkill, setCopiedSkill] = useState(false)

  const amcSkillText = useMemo(() => {
    const hostFromWindow = typeof window !== 'undefined' ? window.location.origin : 'https://amc-kanban.immedi.ai'
    return buildAmcSkillText({ apiBaseUrl: `${hostFromWindow}/api` })
  }, [])

  const onboardingPrompt = useMemo(() => {
    const hostFromWindow = typeof window !== 'undefined' ? window.location.origin : 'https://amc-kanban.immedi.ai'
    const mockContext = {
      subscription: { planId: 'essential', planName: 'Essential Plan', platforms: 'Xiaohongshu, Instagram' },
      user: { id: 'usr_id_here', email: 'owner@example.com', role: 'BRAND_OWNER', nickname: 'Brand Owner', timezone: 'Asia/Singapore' },
      brand: { id: 'brand_id_here', name: 'Example Brand Name', location: 'Singapore', timezone: 'Asia/Singapore', website: 'https://example.com', phone: null, address: null },
      stores: [],
      socialAccounts: [],
      ownedBrands: [],
      agent: { id: 'agent_id_here', apiKey: '<YOUR_AGENT_API_KEY>' }
    }
    return buildLaunchInstruction({ context: mockContext, apiBaseUrl: `${hostFromWindow}/api` })
  }, [])

  const copySkillText = async () => {
    try {
      const textToCopy = skillTab === 'onboarding' ? onboardingPrompt : amcSkillText
      await navigator.clipboard.writeText(textToCopy)
      setCopiedSkill(true)
      window.setTimeout(() => setCopiedSkill(false), 1800)
    } catch {
      setCopiedSkill(false)
    }
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/profile')
        if (!res.ok) {
          if (active) {
            setAllowed(true)
            setIsPublicOnly(true)
            setLoading(false)
          }
          return
        }
        const data = await res.json() as ProfileData
        const roles = data.userRoles || (
          data.dashboardRole === 'ADMIN'
            ? ['ADMIN']
            : data.dashboardRole === 'BRAND_OWNER'
              ? ['BRAND_OWNER']
              : data.dashboardRole === 'BRAND_DIRECTOR'
                ? ['AMC_PRINCIPAL']
                : []
        )

        const canAccess = data.type === 'HUMAN' && (roles.includes('ADMIN') || roles.includes('BRAND_OWNER'))
        if (!active) return
        setAllowed(true)
        setIsPublicOnly(!canAccess)
      } catch {
        if (active) {
          setAllowed(true)
          setIsPublicOnly(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [router])

  const pageTitle = useMemo(() => 'Connect to AMC Kanban (Owner Setup)', [])
  const mcpConfig = useMemo(() => `{
  "mcpServers": {
    "amc-kanban": {
      "url": "${baseUrl}/api/mcp",
      "headers": {
        "Authorization": "Bearer <AGENT_API_KEY>"
      }
    }
  }
}`, [])

  const copyMcpConfig = async () => {
    try {
      await navigator.clipboard.writeText(mcpConfig)
      setCopiedMcp(true)
      window.setTimeout(() => setCopiedMcp(false), 1800)
    } catch {
      setCopiedMcp(false)
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-950 p-8 text-slate-200">Loading access...</main>
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h1 className="text-3xl font-bold">Access Restricted</h1>
          <p className="mt-4 text-slate-300">
            This page is only available to Brand Owners (and Admin users). Please contact your AMC admin if you need access.
          </p>
          <div className="mt-6">
            <Link href="/board" className="text-cyan-300 underline hover:text-cyan-200">
              Back to Board
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-12">
        {isPublicOnly && (
          <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
            <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
              ⚠️ Public View (AI-Agent Friendly Mode / 访客接入模式)
            </h3>
            <p className="mt-1 text-xs text-amber-300/90 leading-relaxed">
              您当前正在以公开访客身份访问 AMC 接入指南。下方显示的所有 API 密钥与品牌 context ID 均为通用占位符。
              若要获取您真实的 API 密钥与定制化 SOP 指令，请登录 AMC 看板后台。
            </p>
          </div>
        )}
        <header className="mb-10">
          <div className="inline-block rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
            Owner-Only Integration Guide
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            For Brand Owners to connect their own AI tools to AMC Kanban with their own Agent API Key.
            You can use REST API, MCP protocol, and Skill/SOP metadata endpoints.
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-6">
          <h2 className="text-2xl font-semibold">Before You Start</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-200">
            <li>Create or select your AI agent in AMC dashboard.</li>
            <li>Use your own Agent API Key (do not share keys across teams).</li>
            <li>Bind your agent to the brands you own before running write operations.</li>
          </ol>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-2xl font-semibold">1. REST API (HTTP)</h2>
          <p className="mt-2 text-slate-300">
            Best for scripts, backend services, Dify HTTP nodes, and systems that do not support MCP.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950 p-4">
            <pre className="text-sm text-slate-200">
{`curl -X GET "${baseUrl}/api/agent/brand-config" \
  -H "Authorization: Bearer <AGENT_API_KEY>" \
  -H "Content-Type: application/json"`}
            </pre>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Core docs endpoint: <code className="text-cyan-300">{baseUrl}/api/meta/openapi</code>
          </p>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-2xl font-semibold">2. MCP (Recommended)</h2>
          <p className="mt-2 text-slate-300">
            Best for Claude Desktop/OpenClaw/Hermes and any runtime with remote MCP support.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={copyMcpConfig}
              className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700 cursor-pointer"
            >
              {copiedMcp ? 'Copied' : 'Copy MCP Config'}
            </button>
            <span className="text-xs text-slate-400">Paste into your MCP client config and replace &lt;AGENT_API_KEY&gt;.</span>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950 p-4">
            <pre className="text-sm text-slate-200">
{mcpConfig}
            </pre>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            MCP endpoint: <code className="text-cyan-300">{baseUrl}/api/mcp</code>
          </p>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h2 className="text-2xl font-semibold">3. Onboarding & SOP Skills (AI 接入与规范正文)</h2>
            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
              <button
                onClick={() => setSkillTab('onboarding')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  skillTab === 'onboarding'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/20 shadow'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent cursor-pointer'
                }`}
              >
                初始化指令 (Onboarding)
              </button>
              <button
                onClick={() => setSkillTab('skill')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  skillTab === 'skill'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/20 shadow'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent cursor-pointer'
                }`}
              >
                协作规范 (Skill SOP)
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-300">
            {skillTab === 'onboarding' 
              ? '将此指令完整复制并发送给您的 AI Agent，用于引导其配置 KANBAN_BASE_URL 环境变量并初始化 REST/MCP 客户端。'
              : '将此规范作为 Custom Instruction 或 Skill 提示词导入您的 AI Agent，以规范其与 AMC 看板系统的操作和协作流程。'}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={copySkillText}
              className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700 cursor-pointer"
            >
              {copiedSkill ? '已复制 (Copied!)' : '一键复制正文 (Copy Prompt)'}
            </button>
            <span className="text-xs text-slate-400">
              {skillTab === 'onboarding' ? '包含环境配置、API 根端点和初始化任务列表。' : '包含 Agent 核心协作约束、日常工作 SOP 及 MCP 工具定义。'}
            </span>
          </div>
          <div className="mt-4 max-h-[300px] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap select-all">
            {skillTab === 'onboarding' ? onboardingPrompt : amcSkillText}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-semibold">4. Capabilities Catalog (接口与操作目录)</h2>
              <p className="mt-1 text-sm text-slate-300">
                Detailed listing of supported brand operations. Toggle between categories and click any action to view parameter schemas and payload examples.
              </p>
            </div>
            {/* Category tabs */}
            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start">
              <button
                onClick={() => { setActiveCategory('assets'); setExpandedOperation(null) }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  activeCategory === 'assets'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/20 shadow'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent cursor-pointer'
                }`}
              >
                素材库 (Assets)
              </button>
              <button
                onClick={() => { setActiveCategory('drafts'); setExpandedOperation(null) }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  activeCategory === 'drafts'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/20 shadow'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent cursor-pointer'
                }`}
              >
                内容草稿与排期 (Drafts)
              </button>
              <button
                onClick={() => { setActiveCategory('core'); setExpandedOperation(null) }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  activeCategory === 'core'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/20 shadow'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent cursor-pointer'
                }`}
              >
                核心任务与配置 (Core)
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {(activeCategory === 'assets' ? ASSET_OPERATIONS : activeCategory === 'drafts' ? DRAFT_OPERATIONS : CORE_OPERATIONS).map((op) => {
              const isExpanded = expandedOperation === op.id
              return (
                <div
                  key={op.id}
                  className={`group rounded-xl border transition-all duration-200 ${
                    isExpanded
                      ? 'border-cyan-500/40 bg-slate-950/60 shadow-lg shadow-cyan-950/20'
                      : 'border-slate-800/80 bg-slate-900/30 hover:border-slate-700/80 hover:bg-slate-900/60'
                  }`}
                >
                  {/* Collapsible Header */}
                  <div
                    onClick={() => setExpandedOperation(isExpanded ? null : op.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 cursor-pointer select-none"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-xs font-bold text-slate-400 group-hover:border-slate-600 group-hover:text-slate-200">
                        {isExpanded ? '−' : '+'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-100">{op.actionCn}</span>
                          <span className="text-xs text-slate-400">({op.action})</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400 line-clamp-1 group-hover:text-slate-300 transition-colors">
                          {op.desc}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap sm:self-center">
                      <div className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                        MCP: {op.mcpName}
                      </div>
                      {op.restMethod && op.restUrl && (
                        <div className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-500/20 flex items-center gap-1">
                          <span className="font-bold">{op.restMethod}</span>
                          <span className="font-mono text-slate-300">{op.restUrl}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Collapsible Body */}
                  {isExpanded && (
                    <div className="border-t border-slate-800/80 p-4 bg-slate-950/40 space-y-4">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Function Description</h4>
                        <p className="mt-1 text-sm text-slate-300">{op.desc}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">MCP Parameter Signature</h4>
                          <div className="rounded-lg bg-slate-950 p-2.5 border border-slate-800 font-mono text-xs text-cyan-300 overflow-x-auto">
                            {op.mcpName}(<span className="text-slate-300">{op.mcpParams}</span>)
                          </div>
                        </div>

                        {op.restMethod && op.restUrl && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">REST API Signature</h4>
                            <div className="rounded-lg bg-slate-950 p-2.5 border border-slate-800 font-mono text-xs overflow-x-auto flex items-center gap-1.5">
                              <span className="rounded bg-sky-500/20 px-1 text-sky-300 font-bold">{op.restMethod}</span>
                              <span className="text-slate-300">{op.restUrl}</span>
                              {op.restParams && (
                                <span className="text-slate-400">? {op.restParams}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Example Payload (JSON)</h4>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                await navigator.clipboard.writeText(op.payloadExample)
                              } catch {}
                            }}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold underline cursor-pointer"
                          >
                            Copy Example
                          </button>
                        </div>
                        <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
                          <pre>{op.payloadExample}</pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-2xl font-semibold">5. Skill/SOP Metadata (技能与 SOP 元数据)</h2>
          <p className="mt-2 text-slate-300">
            Use these endpoints to bootstrap agent behavior, execution constraints, and integration context.
          </p>
          <ul className="mt-4 space-y-2 text-slate-200">
            <li>
              OpenAPI: <code className="text-cyan-300">{baseUrl}/api/meta/openapi</code>
            </li>
            <li>
              SOP: <code className="text-cyan-300">{baseUrl}/api/meta/sop</code>
            </li>
            <li>
              Integrations Skill: <code className="text-cyan-300">{baseUrl}/api/meta/skills/amc-integrations</code>
            </li>
            <li>
              Avatar Guide: <code className="text-cyan-300">{baseUrl}/api/meta/avatar-guide</code>
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-6">
          <h2 className="text-xl font-semibold text-amber-200">Security Notes</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-amber-100">
            <li>Never expose full API keys in logs, browser console, or public docs.</li>
            <li>All brand-level operations should pass explicit brandId.</li>
            <li>Prefer MCP first; use REST as fallback when MCP is unavailable.</li>
          </ul>
        </section>

        <footer className="mt-10 flex items-center justify-between text-sm text-slate-400">
          <span>Owner setup complete, then connect your own AI runtime with the same key.</span>
          <Link href="/board" className="text-cyan-300 hover:text-cyan-200 underline">
            Back to Board
          </Link>
        </footer>
      </div>
    </main>
  )
}
