'use client'

import React, { useEffect, useState, useRef } from 'react'
import {
  Shield, Key, Save, RefreshCw, Layers, ShieldCheck, Mail, CalendarClock, History, Settings,
  Sparkles, Plus, Trash2, Edit3, Loader2, Check, Clock, AlertTriangle, MessageSquare, Volume2, Info
} from 'lucide-react'
import EmailConfigPanel from './EmailConfigPanel'
import SchedulerPanel from './SchedulerPanel'
import MessageTemplatesPanel from './MessageTemplatesPanel'

export interface SystemLog {
  id: string
  timestamp: string
  actorId: string | null
  actorName: string | null
  action: string
  resourceType: string
  resourceId: string
  oldValue: any
  newValue: any
}

export interface LLMConfigRecord {
  id: string
  provider: string
  displayName: string
  modelName: string
  apiKey: string | null
  baseUrl: string | null
  isEnabled: boolean
  isDefault: boolean
  taskTags: string[]
  contentGenerationTypes: string[]
  capabilities: string[]
  priority: number
  timeoutMs: number
  maxRetries: number
  fallbackProfileIds: string[]
  costMetadata: Record<string, unknown> | null
  secretRef: string | null
  createdAt: string
  updatedAt: string
}

export interface PromptTemplateRecord {
  id: string
  taskKey: string
  name: string
  description: string | null
  template: string
  variables: string[]
  isEnabled: boolean
  updatedById: string | null
  createdAt: string
  updatedAt: string
}

const MARKETING_PLAN_PROMPT_TOOLTIP = [
  '品牌营销方案生成认知：',
  '1. 目标不是泛泛涨粉/曝光，而是让顾客找得到、看得懂、愿意来。',
  '2. 先看品牌当前状态、门店资料、评论/菜单/素材/活动/订阅范围；缺数据就保守，不编成绩、爆款、折扣或评价。',
  '3. 平台分工要清楚：Google Business/Profile 管搜索可见、营业信息、路线/预约/订单和评价信任；Instagram 管视觉识别、Reels/Stories/Carousel 和产品场景；TikTok 管短视频发现、真实人物/员工/顾客视角和平台原生表达；Facebook 管社区感、老客触达、本地活动和实用更新；小红书管中文用户搜索种草、真实体验、场景化笔记和收藏决策。',
  '4. 如果店内有有效营销互动，内容发布必须配合活动窗口：提前预热、活动期间解释参与方式和到店理由、活动后复盘口碑/UGC/回访。',
  '5. 如果没有活动或数据不支撑活动，不要强行生成节假日/折扣/campaign。',
  '6. 当前订阅内只写可执行策略，超出范围只写升级讨论；不要保证流量、排名、销售额或到店人数。',
].join('\n')

function promptTemplateTooltip(taskKey?: string) {
  return taskKey === 'marketing_plan_generation'
    ? MARKETING_PLAN_PROMPT_TOOLTIP
    : '编辑这个 Prompt 会影响对应 LLM 任务下一次生成结果。请保留必要变量占位符。'
}

function formatSystemLogDetails(log: SystemLog) {
  if (log.resourceType === 'BusinessPathLog' && log.newValue) {
    const value = log.newValue || {}
    const llm = value.llm || {}
    const prompt = value.prompt || {}
    const inputSummary = value.inputSummary || {}
    const route = llm.routeDiagnostics || {}
    const attempts = Array.isArray(llm.attempts) ? llm.attempts : []
    const attemptText = attempts.length
      ? attempts.map((attempt: any, index: number) => {
        const label = `${index + 1}.${attempt.provider || 'unknown'}/${attempt.modelName || 'unknown'}`
        return `${label}:${attempt.status || 'unknown'}${attempt.error ? `(${attempt.error})` : ''}`
      }).join(' | ')
      : 'none'
    return [
      `path=${value.businessPath || '-'}`,
      `stage=${value.stage || '-'}`,
      `status=${value.status || '-'}`,
      `reason=${value.reason || '-'}`,
      `provider=${llm.provider || 'none'}/${llm.modelName || 'none'}`,
      `parse=${llm.parseStatus || '-'}`,
      `timeout=${llm.timedOut ? 'yes' : 'no'}`,
      `jsonMode=${route.jsonModeRequested ? 'requested' : 'off'}`,
      `promptChars=${prompt.promptCharCount || 0}`,
      `quarters=${inputSummary.planningQuarters || 0}`,
      `marketEvents=${inputSummary.marketEvents || 0}`,
      `activityRounds=${inputSummary.storeActivityRounds || 0}`,
      `attempts=${attemptText}`,
    ].join(' | ')
  }

  if (log.oldValue || log.newValue) {
    try {
      const changes: string[] = [];
      const oldObj = log.oldValue || {};
      const newObj = log.newValue || {};
      
      const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
      for (const key of allKeys) {
        if (key === 'createdAt' || key === 'updatedAt' || key === 'id' || key === 'passwordHash' || key === 'temporaryPassword') continue;
        const oldVal = oldObj[key];
        const newVal = newObj[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes.push(`${key}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`);
        }
      }
      return changes.length > 0 ? changes.join(' | ') : '无字段变更';
    } catch {
      return '数据解析失败';
    }
  }

  return '-'
}

type ModelTaskRouteRecord = {
  task: string
  executionDomain: 'amc-content' | 'amc-kanban'
  requiredCapabilities: string[]
  primaryProfileId?: string
  primaryModelName?: string
  fallbackProfileIds: string[]
}

interface PostfastKeyRecord {
  id: string
  label: string | null
  maskedKey: string | null
  status: 'AVAILABLE' | 'ASSIGNED' | 'RETIRED'
  assignedBrandId: string | null
  assignedUserId: string | null
  assignedAt: string | null
  notes: string | null
  createdAt: string
  assignedBrand?: {
    id: string
    name: string
    owners: { user: { id: string; email: string; nickname: string | null } }[]
  } | null
}

interface SystemTabProps {
  systemConfig: {
    geminiApiKey: string
    geminiConfigured: boolean
    minimaxApiKey: string
    minimaxConfigured: boolean
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
  } | null
  onUpdateSystemConfig: (updater: (prev: any) => any) => void
  onSaveSystemConfig: () => Promise<void>
  savingSystemConfig: boolean
  systemLogs: SystemLog[]
  systemLogsLoading: boolean
  onFetchSystemLogs: () => Promise<void>

  // LLM configs props
  llmConfigs: LLMConfigRecord[]
  llmConfigsLoading: boolean
  onFetchLLMConfigs: () => Promise<void>
  promptTemplates: PromptTemplateRecord[]
  promptTemplatesLoading: boolean
  onFetchPromptTemplates: () => Promise<void>
}

export default function SystemTab({
  systemConfig,
  onUpdateSystemConfig,
  onSaveSystemConfig,
  savingSystemConfig,
  systemLogs,
  systemLogsLoading,
  onFetchSystemLogs,
  llmConfigs,
  llmConfigsLoading,
  onFetchLLMConfigs,
  promptTemplates,
  promptTemplatesLoading,
  onFetchPromptTemplates
}: SystemTabProps) {
  const [activeAccordion, setActiveAccordion] = useState<'llm' | 'prompts' | 'ai' | 'postfast' | 'smtp' | 'scheduler' | 'templates' | 'direct_oauth' | ''>('llm')
  
  // LLM Config inner states
  const [llmConfigModalOpen, setLlmConfigModalOpen] = useState(false)
  const [editingLLMConfig, setEditingLLMConfig] = useState<LLMConfigRecord | null>(null)
  const [savingLLMConfig, setSavingLLMConfig] = useState(false)
  const [llmFormError, setLlmFormError] = useState<string | null>(null)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplateRecord | null>(null)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [promptFormError, setPromptFormError] = useState<string | null>(null)
  const [promptForm, setPromptForm] = useState({
    taskKey: '',
    name: '',
    description: '',
    template: '',
    variablesStr: '',
    isEnabled: true,
  })

  // MiniMax TTS test
  const [testingTts, setTestingTts] = useState(false)
  const [ttsTestResult, setTtsTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [modelTaskRoutes, setModelTaskRoutes] = useState<ModelTaskRouteRecord[]>([])
  const [modelTaskServices, setModelTaskServices] = useState<Record<string, string>>({})
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const [postfastKeys, setPostfastKeys] = useState<PostfastKeyRecord[]>([])
  const [postfastKeysLoading, setPostfastKeysLoading] = useState(false)
  const [savingPostfastKeys, setSavingPostfastKeys] = useState(false)
  const [postfastForm, setPostfastForm] = useState({ label: '', tokensText: '', notes: '' })
  const [postfastMessage, setPostfastMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const fetchPostfastKeys = async () => {
    setPostfastKeysLoading(true)
    try {
      const res = await fetch('/api/admin/postfast-keys')
      if (res.ok) {
        const data = await res.json()
        setPostfastKeys(data.keys || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setPostfastKeysLoading(false)
    }
  }

  const handleSavePostfastKeys = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPostfastKeys(true)
    setPostfastMessage(null)
    try {
      const res = await fetch('/api/admin/postfast-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postfastForm),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPostfastMessage({ ok: false, text: data.error || '保存失败，请检查 key 格式' })
        return
      }
      setPostfastForm({ label: '', tokensText: '', notes: '' })
      const duplicateNote = data.duplicates?.length ? `，跳过 ${data.duplicates.length} 个重复 key` : ''
      setPostfastMessage({ ok: true, text: `已新增 ${data.created?.length || 0} 个 PostFast key${duplicateNote}` })
      await fetchPostfastKeys()
      await onFetchSystemLogs()
    } catch (e) {
      console.error(e)
      setPostfastMessage({ ok: false, text: '网络错误，请稍后重试' })
    } finally {
      setSavingPostfastKeys(false)
    }
  }

  const handleRetirePostfastKey = async (key: PostfastKeyRecord) => {
    if (key.status === 'ASSIGNED') {
      const brandName = key.assignedBrand?.name || key.assignedBrandId || '当前品牌'
      const message = `不能删除：这个 PostFast key 已分配给「${brandName}」。请先更换该品牌的 PostFast 配置，或解除占用后再退役。`
      setPostfastMessage({ ok: false, text: message })
      alert(message)
      return
    }
    if (key.status === 'RETIRED') {
      setPostfastMessage({ ok: false, text: '这个 PostFast key 已经是 RETIRED 状态。' })
      return
    }
    if (!confirm('确认将这个 PostFast key 标记为 RETIRED？')) return
    try {
      const res = await fetch('/api/admin/postfast-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key.id, status: 'RETIRED' }),
      })
      if (res.ok) {
        await fetchPostfastKeys()
        await onFetchSystemLogs()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || '更新失败')
      }
    } catch (e) {
      console.error(e)
      alert('网络错误，请稍后重试')
    }
  }

  const handleTestTts = async () => {
    setTestingTts(true)
    setTtsTestResult(null)
    try {
      const res = await fetch('/api/mm/tts-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '你好！MiniMax 语音配置测试成功，语音合成功能正常！' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setTtsTestResult({ ok: false, msg: err?.error ?? `HTTP ${res.status}` })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      ttsAudioRef.current = audio
      audio.play()
      audio.onended = () => URL.revokeObjectURL(url)
      setTtsTestResult({ ok: true, msg: '✅ 语音合成成功，正在播放...' })
    } catch (e: any) {
      setTtsTestResult({ ok: false, msg: e?.message ?? '请求失败' })
    } finally {
      setTestingTts(false)
    }
  }

  const [llmForm, setLlmForm] = useState({
    provider: 'google',
    displayName: '',
    modelName: 'gemini-2.0-flash',
    apiKey: '',
    baseUrl: '',
    isEnabled: true,
    isDefault: false,
    taskTagsStr: '',
    contentGenerationTypesStr: '',
    capabilitiesStr: 'text_input, structured_json',
    priority: 0,
    timeoutMs: 120000,
    maxRetries: 1,
    fallbackProfileIdsStr: '',
    costMetadataStr: '',
    secretRef: '',
  })

  const handleOpenNewLLM = () => {
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
      contentGenerationTypesStr: '',
      capabilitiesStr: 'text_input, structured_json',
      priority: 0,
      timeoutMs: 120000,
      maxRetries: 1,
      fallbackProfileIdsStr: '',
      costMetadataStr: '',
      secretRef: '',
    })
    setLlmFormError(null)
    setLlmConfigModalOpen(true)
  }

  const handleOpenEditLLM = (config: LLMConfigRecord) => {
    setEditingLLMConfig(config)
    setLlmForm({
      provider: config.provider,
      displayName: config.displayName,
      modelName: config.modelName,
      apiKey: '',
      baseUrl: config.baseUrl || '',
      isEnabled: config.isEnabled,
      isDefault: config.isDefault,
      taskTagsStr: config.taskTags.join(', '),
      contentGenerationTypesStr: (config.contentGenerationTypes || []).join(', '),
      capabilitiesStr: (config.capabilities || []).join(', '),
      priority: config.priority || 0,
      timeoutMs: config.timeoutMs || 120000,
      maxRetries: config.maxRetries || 0,
      fallbackProfileIdsStr: (config.fallbackProfileIds || []).join(', '),
      costMetadataStr: config.costMetadata ? JSON.stringify(config.costMetadata, null, 2) : '',
      secretRef: config.secretRef || '',
    })
    setLlmFormError(null)
    setLlmConfigModalOpen(true)
  }

  const handleSaveLLM = async (e: React.FormEvent) => {
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
        .map(t => t.trim().toLowerCase().replace(/[\s-]+/g, '_'))
        .filter(Boolean)
      const capabilities = llmForm.capabilitiesStr
        .split(',')
        .map(t => t.trim().toLowerCase().replace(/[\s-]+/g, '_'))
        .filter(Boolean)
      const contentGenerationTypes = llmForm.contentGenerationTypesStr
        .split(',')
        .map(t => t.trim().toLowerCase().replace(/[\s-]+/g, '_'))
        .filter(Boolean)
      const fallbackProfileIds = llmForm.fallbackProfileIdsStr
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
      let costMetadata: Record<string, unknown> | null = null
      if (llmForm.costMetadataStr.trim()) costMetadata = JSON.parse(llmForm.costMetadataStr)

      const body: any = {
        provider: llmForm.provider,
        displayName: llmForm.displayName,
        modelName: llmForm.modelName,
        baseUrl: llmForm.baseUrl || null,
        isEnabled: llmForm.isEnabled,
        isDefault: llmForm.isDefault,
        taskTags: tags,
        contentGenerationTypes,
        capabilities,
        priority: llmForm.priority,
        timeoutMs: llmForm.timeoutMs,
        maxRetries: llmForm.maxRetries,
        fallbackProfileIds,
        costMetadata,
        secretRef: llmForm.secretRef || null,
      }
      
      if (llmForm.apiKey.trim()) {
        body.apiKey = llmForm.apiKey
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
        await onFetchLLMConfigs()
        await onFetchSystemLogs()
      } else {
        const errData = await res.json().catch(() => ({}))
        setLlmFormError(errData.error || '保存失败，请检查输入')
      }
    } catch (e) {
      console.error(e)
      setLlmFormError('发生未知网络错误，请稍后重试')
    } finally {
      setSavingLLMConfig(false)
    }
  }

  const handleOpenNewPrompt = () => {
    setEditingPrompt(null)
    setPromptForm({
      taskKey: '',
      name: '',
      description: '',
      template: '',
      variablesStr: 'schemaInstruction, inputJson',
      isEnabled: true,
    })
    setPromptFormError(null)
    setPromptModalOpen(true)
  }

  const handleOpenEditPrompt = (template: PromptTemplateRecord) => {
    setEditingPrompt(template)
    setPromptForm({
      taskKey: template.taskKey,
      name: template.name,
      description: template.description || '',
      template: template.template,
      variablesStr: (template.variables || []).join(', '),
      isEnabled: template.isEnabled,
    })
    setPromptFormError(null)
    setPromptModalOpen(true)
  }

  const handleSavePrompt = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingPrompt(true)
    setPromptFormError(null)
    try {
      const variables = promptForm.variablesStr
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
      const body = {
        taskKey: promptForm.taskKey,
        name: promptForm.name,
        description: promptForm.description,
        template: promptForm.template,
        variables,
        isEnabled: promptForm.isEnabled,
      }
      const res = await fetch(editingPrompt ? `/api/admin/prompt-templates/${editingPrompt.id}` : '/api/admin/prompt-templates', {
        method: editingPrompt ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPromptFormError(data.error || 'Prompt 保存失败')
        return
      }
      setPromptModalOpen(false)
      setEditingPrompt(null)
      await onFetchPromptTemplates()
      await onFetchSystemLogs()
    } catch (error) {
      console.error(error)
      setPromptFormError('网络错误，请稍后重试')
    } finally {
      setSavingPrompt(false)
    }
  }

  const handleTogglePrompt = async (template: PromptTemplateRecord) => {
    try {
      const res = await fetch(`/api/admin/prompt-templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !template.isEnabled }),
      })
      if (res.ok) {
        await onFetchPromptTemplates()
        await onFetchSystemLogs()
      }
    } catch (error) {
      console.error(error)
    }
  }

  const handleDeletePrompt = async (template: PromptTemplateRecord) => {
    if (!confirm(`确定删除 Prompt「${template.name}」吗？`)) return
    try {
      const res = await fetch(`/api/admin/prompt-templates/${template.id}`, { method: 'DELETE' })
      if (res.ok) {
        await onFetchPromptTemplates()
        await onFetchSystemLogs()
      } else {
        alert('删除失败')
      }
    } catch (error) {
      console.error(error)
    }
  }

  const handleDeleteLLM = async (id: string) => {
    if (!confirm('确定要删除这个大模型配置吗？此操作不可撤销。')) return
    try {
      const res = await fetch(`/api/admin/llm-configs/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await onFetchLLMConfigs()
        await onFetchSystemLogs()
      } else {
        alert('删除失败')
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (activeAccordion === 'postfast' && postfastKeys.length === 0 && !postfastKeysLoading) {
      void fetchPostfastKeys()
    }
    if (activeAccordion === 'llm') {
      void fetch('/api/admin/model-tasks').then(async (response) => {
        if (!response.ok) return
        const data = await response.json()
        setModelTaskRoutes(Array.isArray(data.items) ? data.items : [])
        setModelTaskServices(data.services || {})
      }).catch(() => undefined)
    }
    if (activeAccordion === 'prompts') {
      void onFetchPromptTemplates()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccordion])

  const handleToggleLLMEnabled = async (config: LLMConfigRecord) => {
    try {
      const res = await fetch(`/api/admin/llm-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !config.isEnabled }),
      })
      if (res.ok) {
        await onFetchLLMConfigs()
        await onFetchSystemLogs()
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleToggleLLMDefault = async (config: LLMConfigRecord) => {
    try {
      const res = await fetch(`/api/admin/llm-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: !config.isDefault }),
      })
      if (res.ok) {
        await onFetchLLMConfigs()
        await onFetchSystemLogs()
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200 font-sans">
      {/* Tab Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Settings size={18} className="text-blue-500" /> 系统服务与全局配置
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            在此管理 Kanban 模型路由、邮件发送网关、监控定时任务与系统审计日志。TTS 与视频执行会按任务路由对接 amc-content Content Lab。
          </p>
        </div>
      </div>

      {/* Accordion Panels */}
      <div className="space-y-4">
        {/* Section 1: LLM configs */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
            onClick={() => setActiveAccordion(activeAccordion === 'llm' ? '' : 'llm')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <Sparkles size={15} className="text-indigo-500" />
              <span>Kanban 模型配置与多路容灾路由</span>
            </span>
            <span className="text-[10px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-950/20 px-2.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-900/30">
              Kanban 模型：{llmConfigs.length} 路由
            </span>
          </button>

          {activeAccordion === 'llm' && (
            <div className="px-6 pb-6 pt-1 space-y-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              <div className="flex justify-between items-start gap-4 pt-2">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                    这里显示 Kanban 的文本 LLM、MiniMax TTS 与视频模型路由；TTS 和视频任务会通过 amc-content Content Lab 执行。
                  </p>
                  <a
                    href="/admin/content-lab"
                    className="inline-flex text-[11px] font-bold text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
                  >
                    打开 amc-content Content Lab 查看执行侧模型与 TTS 配置
                  </a>
                </div>
                <button
                  onClick={handleOpenNewLLM}
                  className="inline-flex items-center gap-1 bg-blue-650 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                >
                  <Plus size={12} />
                  <span>添加模型路由</span>
                </button>
              </div>

              {llmConfigsLoading ? (
                <div className="p-8 text-center text-xs text-slate-450">加载模型配置中...</div>
              ) : llmConfigs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                  暂无 AI 模型配置。请在 AI 模型配置 中添加至少一个模型。
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {llmConfigs.map((config) => (
                    <div 
                      key={config.id}
                      className={`p-4 rounded-xl border flex flex-col justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/10 ${
                        config.isEnabled ? 'border-slate-200 dark:border-slate-800' : 'border-slate-150/60 dark:border-slate-850 opacity-60'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-black text-slate-850 dark:text-white leading-tight">{config.displayName}</p>
                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">{config.provider} / {config.modelName}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {config.isDefault && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-black border border-blue-100">默认</span>}
                            <button 
                              onClick={() => handleToggleLLMEnabled(config)}
                              className={`text-[9px] px-1.5 py-0.5 rounded font-black border ${
                                config.isEnabled 
                                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {config.isEnabled ? '开' : '关'}
                            </button>
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-450 space-y-0.5 pt-1 font-medium">
                          {config.baseUrl && <p className="truncate"><span className="text-slate-400">端点:</span> {config.baseUrl}</p>}
                          <p><span className="text-slate-400">秘钥:</span> {config.apiKey ? `••••••••${config.apiKey.slice(-4)}` : '继承全局'}</p>
                          {config.taskTags.length > 0 && (
                            <p className="flex items-center gap-1 flex-wrap"><span className="text-slate-400">标签:</span> 
                              {config.taskTags.map(t => <span key={t} className="bg-indigo-50/50 text-indigo-600 px-1 rounded text-[8px] border border-indigo-100">{t}</span>)}
                            </p>
                          )}
                          {(config.contentGenerationTypes || []).length > 0 && (
                            <p className="flex items-center gap-1 flex-wrap"><span className="text-slate-400">内容:</span>
                              {config.contentGenerationTypes.map(type => <span key={type} className="bg-amber-50/70 text-amber-700 px-1 rounded text-[8px] border border-amber-100">{type}</span>)}
                            </p>
                          )}
                          {(config.capabilities || []).length > 0 && (
                            <p className="flex items-center gap-1 flex-wrap"><span className="text-slate-400">能力:</span>
                              {config.capabilities.map(capability => <span key={capability} className="bg-cyan-50/60 text-cyan-700 px-1 rounded text-[8px] border border-cyan-100">{capability}</span>)}
                            </p>
                          )}
                          <p><span className="text-slate-400">路由:</span> priority {config.priority} · timeout {config.timeoutMs}ms · retry {config.maxRetries}</p>
                          {(config.fallbackProfileIds || []).length > 0 && <p className="truncate"><span className="text-slate-400">Fallback:</span> {config.fallbackProfileIds.join(' → ')}</p>}
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800/80 pt-2 text-[10px]">
                        <span className="text-slate-400 font-mono">{new Date(config.createdAt).toLocaleDateString('zh-CN')}</span>
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={() => handleToggleLLMDefault(config)}
                            className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-white hover:bg-slate-50 text-slate-650"
                          >
                            默认
                          </button>
                          <button onClick={() => handleOpenEditLLM(config)} className="p-1 text-slate-400 hover:text-indigo-500"><Edit3 size={12} /></button>
                          <button onClick={() => handleDeleteLLM(config.id)} className="p-1 text-slate-400 hover:text-rose-500"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2: Prompt templates */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'prompts' ? '' : 'prompts')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <MessageSquare size={15} className="text-violet-500" />
              <span>Prompt Management</span>
            </span>
            <span className="text-[10px] font-bold text-violet-600 bg-violet-50 dark:bg-violet-950/20 px-2.5 py-0.5 rounded-full border border-violet-100 dark:border-violet-900/30">
              {promptTemplates.length} 个 Prompt
            </span>
          </button>

          {activeAccordion === 'prompts' && (
            <div className="px-6 pb-6 pt-1 space-y-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              <div className="flex items-start justify-between gap-4 pt-2">
                <p className="max-w-3xl text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
                  管理 AMC-Kanban 调用 LLM 时使用的 Prompt。品牌营销方案使用 <span className="font-mono text-violet-600">marketing_plan_generation</span>，内容计划创意审核使用 <span className="font-mono text-violet-600">calendar_creative_review</span>，保存后下一次生成即生效。
                </p>
                <button
                  type="button"
                  onClick={handleOpenNewPrompt}
                  className="inline-flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                >
                  <Plus size={12} />
                  <span>新增 Prompt</span>
                </button>
              </div>

              {promptTemplatesLoading ? (
                <div className="p-8 text-center text-xs text-slate-450">加载 Prompt 中...</div>
              ) : promptTemplates.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                  暂无 Prompt 模板。
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {promptTemplates.map((template) => (
                    <div key={template.id} className={`rounded-xl border p-4 bg-slate-50/60 dark:bg-slate-950/20 ${template.isEnabled ? 'border-slate-200 dark:border-slate-800' : 'border-slate-150 opacity-60 dark:border-slate-850'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 dark:text-white">{template.name}</p>
                          <p className="mt-0.5 font-mono text-[9px] text-violet-600 truncate">{template.taskKey}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTogglePrompt(template)}
                          className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black ${template.isEnabled ? 'border-emerald-100 bg-emerald-50 text-emerald-650' : 'border-slate-200 bg-slate-100 text-slate-500'}`}
                        >
                          {template.isEnabled ? '启用' : '停用'}
                        </button>
                      </div>
                      {template.description && (
                        <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-relaxed text-slate-500 dark:text-slate-400">{template.description}</p>
                      )}
                      <pre className="mt-3 max-h-28 overflow-hidden whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        {template.template}
                      </pre>
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <div className="flex flex-wrap gap-1">
                          {(template.variables || []).map(variable => (
                            <span key={variable} className="rounded bg-violet-50 px-1.5 py-0.5 font-mono text-[8px] font-bold text-violet-600">{`{{${variable}}}`}</span>
                          ))}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditPrompt(template)}
                            title={promptTemplateTooltip(template.taskKey)}
                            aria-label={`编辑 Prompt：${template.name}`}
                            className="p-1 text-slate-400 hover:text-violet-600"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button type="button" onClick={() => handleDeletePrompt(template)} className="p-1 text-slate-400 hover:text-rose-500"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 3: AI Keys */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
            onClick={() => setActiveAccordion(activeAccordion === 'ai' ? '' : 'ai')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <Key size={15} className="text-indigo-500" />
              <span>全局 AI 模型配置</span>
            </span>
          </button>

          {activeAccordion === 'ai' && (
            <div className="px-6 pb-6 pt-1 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              <div className="mt-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/20 p-4 space-y-2">
                <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                  <Key size={14} />
                  AI 模型与 API Key 已迁移至 AI 模型配置
                </p>
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 leading-relaxed">
                  Kanban 已恢复本地模型路由可见性；MiniMax TTS、amc-content Copywriter、参考视频分析与视频生成的实际执行由 <strong>amc-content Content Lab</strong> 承接。
                </p>
                <p className="text-[10px] text-indigo-500 dark:text-indigo-500">
                  MiniMax TTS：Content Lab / 模型与路由 / tts_generation<br/>
                  Copywriter：Content Lab / 模型与路由 / body_composition 与 quality_rewrite<br/>
                  视频生成：Content Lab / 模型与路由 / video_generation
                </p>
                <a
                  href="/admin/content-lab"
                  className="inline-flex text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:underline"
                >
                  前往 Content Lab
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Section: PostFast API Key Pool */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'postfast' ? '' : 'postfast')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <Key size={15} className="text-emerald-500" />
              <span>PostFast API Key 预配置池</span>
            </span>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-900/30">
              可用 {postfastKeys.filter(key => key.status === 'AVAILABLE').length} / 已分配 {postfastKeys.filter(key => key.status === 'ASSIGNED').length}
            </span>
          </button>

          {activeAccordion === 'postfast' && (
            <div className="px-6 pb-6 pt-1 space-y-5 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              <form onSubmit={handleSavePostfastKeys} className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 pt-4">
                <div className="space-y-3">
                  <label className="space-y-1.5 block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">批次标签</span>
                    <input
                      type="text"
                      value={postfastForm.label}
                      onChange={e => setPostfastForm(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="例：2026-08 新用户池"
                      className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1.5 block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">备注</span>
                    <input
                      type="text"
                      value={postfastForm.notes}
                      onChange={e => setPostfastForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="来源、采购批次或使用范围"
                      className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <label className="space-y-1.5 block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">PostFast API Keys（每行一个，也支持逗号分隔）</span>
                    <textarea
                      value={postfastForm.tokensText}
                      onChange={e => setPostfastForm(prev => ({ ...prev, tokensText: e.target.value }))}
                      placeholder="pf_live_xxx..."
                      rows={4}
                      className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs dark:text-white focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono resize-y"
                    />
                  </label>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      新品牌创建时会自动领取一个 AVAILABLE key，并写入品牌 PostFast 配置；列表仅显示掩码和分配关系。
                    </p>
                    <button
                      type="submit"
                      disabled={savingPostfastKeys || !postfastForm.tokensText.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-sm cursor-pointer"
                    >
                      {savingPostfastKeys ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      <span>加入池子</span>
                    </button>
                  </div>
                  {postfastMessage && (
                    <div className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                      postfastMessage.ok
                        ? 'bg-emerald-50 text-emerald-650 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
                        : 'bg-rose-50 text-rose-650 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30'
                    }`}>
                      {postfastMessage.text}
                    </div>
                  )}
                </div>
              </form>

              <div className="admin-list">
                <table className="w-full min-w-[860px] table-fixed text-xs">
                  <colgroup>
                    <col className="w-[220px]" />
                    <col className="w-[120px]" />
                    <col className="w-[260px]" />
                    <col className="w-[190px]" />
                    <col className="w-[110px]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="text-left px-4 py-3">Key</th>
                      <th className="text-left px-4 py-3">状态</th>
                      <th className="text-left px-4 py-3">分配品牌</th>
                      <th className="text-left px-4 py-3">标签 / 备注</th>
                      <th className="text-right px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postfastKeysLoading ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">加载 PostFast key 池...</td></tr>
                    ) : postfastKeys.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">暂无预配置 key</td></tr>
                    ) : postfastKeys.map((key) => {
                      const owner = key.assignedBrand?.owners?.[0]?.user
                      return (
                        <tr key={key.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/40 transition-all">
                          <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{key.maskedKey || '••••••••'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 rounded-lg border text-[10px] font-black ${
                              key.status === 'AVAILABLE'
                                ? 'bg-emerald-50 text-emerald-650 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
                                : key.status === 'ASSIGNED'
                                ? 'bg-blue-50 text-blue-650 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30'
                                : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-850 dark:text-slate-400 dark:border-slate-700'
                            }`}>
                              {key.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {key.assignedBrand ? (
                              <div className="min-w-0">
                                <p className="font-black text-slate-850 dark:text-white truncate">{key.assignedBrand.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">{owner?.nickname || owner?.email || key.assignedBrandId}</p>
                              </div>
                            ) : (
                              <span className="text-slate-400">未分配</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-650 dark:text-slate-300 truncate">{key.label || '未命名批次'}</p>
                            <p className="text-[10px] text-slate-400 truncate">{key.notes || new Date(key.createdAt).toLocaleDateString('zh-CN')}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRetirePostfastKey(key)}
                              disabled={key.status === 'RETIRED'}
                              className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-200 disabled:opacity-40 disabled:hover:text-slate-500 disabled:hover:border-slate-200 cursor-pointer"
                              title={key.status === 'ASSIGNED' ? '不能删除：已分配给品牌，点击查看原因' : key.status === 'RETIRED' ? '已退役' : '标记为退役'}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Section: Direct Social Media OAuth Credentials */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'direct_oauth' ? '' : 'direct_oauth')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <Shield size={15} className="text-indigo-500" />
              <span>直连社媒应用授权秘钥 (Direct Meta, Google & TikTok Developers)</span>
            </span>
            {systemConfig?.useDirectPublishing && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-0.5 rounded-full border border-amber-100 dark:border-amber-900/30">直连模式已启用</span>
            )}
          </button>

          {activeAccordion === 'direct_oauth' && (
            <div className="px-6 pb-6 pt-1 space-y-6 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              
              {/* Toggle Switch */}
              <div className="flex items-center justify-between pt-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">启用直连发布代理 (跳过 PostFast)</label>
                  <p className="text-[10px] text-slate-400 mt-1">开启后，系统将直接使用下方配置的官方应用证书进行授权与推送发布。</p>
                </div>
                <input
                  type="checkbox"
                  checked={systemConfig?.useDirectPublishing ?? false}
                  onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, useDirectPublishing: e.target.checked } : null)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {/* Meta Developer Config */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <span>📱 Meta Developer App (Facebook, Instagram, Threads, WhatsApp)</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Facebook App ID</label>
                    <input
                      type="text"
                      value={systemConfig?.metaAppId ?? ''}
                      onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, metaAppId: e.target.value } : null)}
                      placeholder="请输入 App ID"
                      className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Facebook App Secret</label>
                    <input
                      type="password"
                      value={systemConfig?.metaAppSecret ?? ''}
                      onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, metaAppSecret: e.target.value } : null)}
                      placeholder={systemConfig?.metaAppSecretConfigured ? "•••••••• (已配置)" : "请输入 App Secret"}
                      className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">OAuth Redirect URI</label>
                  <input
                    type="text"
                    value={systemConfig?.metaRedirectUri ?? ''}
                    onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, metaRedirectUri: e.target.value } : null)}
                    placeholder="如 https://your-domain.com/api/integrations/facebook/callback"
                    className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono text-xs"
                  />
                </div>
              </div>

              {/* Google Developer Config */}
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/85">
                <h4 className="text-xs font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <span>🔑 Google Cloud Console (Google Business Profile, YouTube)</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Google Client ID</label>
                    <input
                      type="text"
                      value={systemConfig?.googleClientId ?? ''}
                      onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, googleClientId: e.target.value } : null)}
                      placeholder="请输入 Client ID"
                      className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Google Client Secret</label>
                    <input
                      type="password"
                      value={systemConfig?.googleClientSecret ?? ''}
                      onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, googleClientSecret: e.target.value } : null)}
                      placeholder={systemConfig?.googleClientSecretConfigured ? "•••••••• (已配置)" : "请输入 Client Secret"}
                      className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">OAuth Redirect URI</label>
                  <input
                    type="text"
                    value={systemConfig?.googleRedirectUri ?? ''}
                    onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, googleRedirectUri: e.target.value } : null)}
                    placeholder="如 https://your-domain.com/api/integrations/google/callback"
                    className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono text-xs"
                  />
                </div>
              </div>

              {/* TikTok Developer Config */}
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/85">
                <h4 className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <span>🎵 TikTok Developer Portal (TikTok Posting API)</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">TikTok Client Key</label>
                    <input
                      type="text"
                      value={systemConfig?.tiktokClientKey ?? ''}
                      onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, tiktokClientKey: e.target.value } : null)}
                      placeholder="请输入 Client Key"
                      className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">TikTok Client Secret</label>
                    <input
                      type="password"
                      value={systemConfig?.tiktokClientSecret ?? ''}
                      onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, tiktokClientSecret: e.target.value } : null)}
                      placeholder={systemConfig?.tiktokClientSecretConfigured ? "•••••••• (已配置)" : "请输入 Client Secret"}
                      className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">OAuth Redirect URI</label>
                  <input
                    type="text"
                    value={systemConfig?.tiktokRedirectUri ?? ''}
                    onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, tiktokRedirectUri: e.target.value } : null)}
                    placeholder="如 https://your-domain.com/api/integrations/tiktok/callback"
                    className="w-full rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono text-xs"
                  />
                </div>
              </div>

              {/* Submit Buttons Row */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={onSaveSystemConfig}
                  disabled={savingSystemConfig || !systemConfig}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  {savingSystemConfig ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>正在保存...</span>
                    </>
                  ) : (
                    <>
                      <Save size={13} />
                      <span>保存直连接口配置</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          )}
        </div>

        {/* Section 3: SMTP */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'smtp' ? '' : 'smtp')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <Mail size={15} className="text-indigo-500" />
              <span>邮件发送网关设置 (SMTP Settings)</span>
            </span>
            {systemConfig?.smtpConfigured && (
              <span className="text-[10px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-950/20 px-2.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-900/30">SMTP 服务已激活</span>
            )}
          </button>

          {activeAccordion === 'smtp' && (
            <div className="px-6 pb-6 pt-1 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              <EmailConfigPanel
                config={systemConfig}
                onSaved={(smtp) => onUpdateSystemConfig(prev => prev ? { ...prev, ...smtp } : null)}
              />
            </div>
          )}
        </div>

        {/* Section 4: Cron Scheduler */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
            onClick={() => setActiveAccordion(activeAccordion === 'scheduler' ? '' : 'scheduler')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <CalendarClock size={15} className="text-indigo-500" />
              <span>智能排期与巡检服务 (Cron Scheduler Monitor)</span>
            </span>
          </button>

          {activeAccordion === 'scheduler' && (
            <div className="px-6 pb-6 pt-1 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              <SchedulerPanel />
            </div>
          )}
        </div>

        {/* Section 5: Message Templates */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
            onClick={() => setActiveAccordion(activeAccordion === 'templates' ? '' : 'templates')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <MessageSquare size={15} className="text-indigo-500" />
              <span>消息与通知模板管理 (Notification & Message Templates)</span>
            </span>
          </button>

          {activeAccordion === 'templates' && (
            <div className="px-6 pb-6 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              <MessageTemplatesPanel />
            </div>
          )}
        </div>
      </div>

      {/* System Audit Trail Logs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <History size={15} className="text-slate-550" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">系统操作审计日志 (Audit Trail)</h3>
          </div>
          <button
            onClick={onFetchSystemLogs}
            disabled={systemLogsLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-350 bg-slate-50 hover:bg-slate-100 dark:bg-slate-805 dark:hover:bg-slate-750 transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={11} className={systemLogsLoading ? 'animate-spin' : ''} />
            <span>刷新日志</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-150 dark:border-slate-800">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-905 text-slate-400 font-extrabold uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">操作时间</th>
                <th className="text-left px-4 py-3">操作经办人</th>
                <th className="text-left px-4 py-3">动作行为</th>
                <th className="text-left px-4 py-3">关联实体</th>
                <th className="text-left px-4 py-3">变更细则 (Old → New)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-300">
              {systemLogs.map(log => {
                const displayActor = log.actorName || log.actorId || '系统后台';
                const displayResource = `${log.resourceType}:${log.resourceId.slice(0, 8)}...`;
                const details = formatSystemLogDetails(log);
                
                return (
                  <tr key={log.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-2.5 font-black">{displayActor}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-700 dark:text-slate-350">{log.action}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400" title={`${log.resourceType}:${log.resourceId}`}>{displayResource}</td>
                    <td className="px-2.5 py-2.5 leading-relaxed text-slate-450 max-w-sm truncate" title={details}>{details}</td>
                  </tr>
                );
              })}
              {systemLogs.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={5}>暂无操作日志记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Prompt Template Modal Dialog */}
      {promptModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-5 scrollbar-thin">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                {editingPrompt ? '编辑 Prompt 模板' : '新增 Prompt 模板'}
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-400">
                可使用变量占位符，例如 <span className="font-mono text-violet-600">{'{{schemaInstruction}}'}</span> 和 <span className="font-mono text-violet-600">{'{{inputJson}}'}</span>。
              </p>
            </div>

            <form onSubmit={handleSavePrompt} className="space-y-4">
              {promptFormError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-600 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-400">
                  {promptFormError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-1.5 block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">任务 Key</span>
                  <input
                    required
                    value={promptForm.taskKey}
                    disabled={Boolean(editingPrompt)}
                    onChange={event => setPromptForm(prev => ({ ...prev, taskKey: event.target.value }))}
                    placeholder="marketing_plan_generation"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>

                <label className="space-y-1.5 block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">显示名称</span>
                  <input
                    required
                    value={promptForm.name}
                    onChange={event => setPromptForm(prev => ({ ...prev, name: event.target.value }))}
                    placeholder="品牌营销方案生成"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">用途说明</span>
                  <input
                    value={promptForm.description}
                    onChange={event => setPromptForm(prev => ({ ...prev, description: event.target.value }))}
                    placeholder="这个 Prompt 被哪个功能调用，改动会影响什么。"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">变量列表</span>
                  <input
                    value={promptForm.variablesStr}
                    onChange={event => setPromptForm(prev => ({ ...prev, variablesStr: event.target.value }))}
                    placeholder="schemaInstruction, inputJson"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white font-mono"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Prompt 正文
                    <Info
                      size={12}
                      className="text-violet-500"
                      aria-label="Prompt 编辑提示"
                    >
                      <title>{promptTemplateTooltip(promptForm.taskKey)}</title>
                    </Info>
                  </span>
                  <textarea
                    required
                    value={promptForm.template}
                    onChange={event => setPromptForm(prev => ({ ...prev, template: event.target.value }))}
                    rows={16}
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-xs leading-6 text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={promptForm.isEnabled}
                    onChange={event => setPromptForm(prev => ({ ...prev, isEnabled: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-violet-600"
                  />
                  启用这个 Prompt
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setPromptModalOpen(false)
                    setEditingPrompt(null)
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-350 hover:bg-slate-105 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingPrompt}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {savingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{savingPrompt ? '保存中...' : '保存 Prompt'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LLM Config Modal Dialog */}
      {llmConfigModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-5 scrollbar-thin">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                {editingLLMConfig ? '编辑大模型连接配置' : '新增大模型连接配置'}
              </h2>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                配置外部大模型路由参数。系统会基于专属标签匹配特定创作任务，无法连接时将自动切换至备用模型。
              </p>
            </div>

            <form onSubmit={handleSaveLLM} className="space-y-4">
              {llmFormError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-955/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-xl leading-relaxed animate-in fade-in duration-150">
                  {llmFormError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">配置显示名称</span>
                  <input
                    required
                    value={llmForm.displayName}
                    onChange={e => setLlmForm(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="例: OpenAI GPT-4o 生产链路 / 备用文案创作"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <label className="space-y-1.5 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">厂商协议 (Provider)</span>
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
                          minimax: 'speech-2.8-hd',
                          custom_shim: 'custom-model',
                          seedance: 'dreamina-seedance-2-0-fast-260128',
                          fal: 'bytedance/seedance-2.0/image-to-video',
                          kieai: 'veo3_fast',
                          volcengine: 'seedance-2.0',
                        }
                        const currentDefaults = [
                          'gemini-2.0-flash',
                          'gpt-4o',
                          'claude-3-5-sonnet-20241022',
                          'deepseek-chat',
                          'speech-2.8-hd',
                          'custom-model',
                          'seedance-2.0-fast',
                          'seedance-2-0',
                          'dreamina-seedance-2-0-fast-260128',
                          'dreamina-seedance-2-0-260128',
                          'bytedance/seedance-2.0/image-to-video',
                          'veo3_fast',
                          'seedance-2.0',
                          ''
                        ]
                        const modelName = (!prev.modelName || currentDefaults.includes(prev.modelName))
                          ? (defaults[newProvider] || '')
                          : prev.modelName

                        const taskTagsStr = newProvider === 'minimax' && !prev.taskTagsStr.trim()
                          ? 'tts_generation'
                          : ['seedance', 'fal', 'kieai', 'volcengine'].includes(newProvider) && !prev.taskTagsStr.trim()
                            ? 'video_generation'
                            : prev.taskTagsStr
                        const capabilitiesStr = ['seedance', 'fal', 'kieai', 'volcengine'].includes(newProvider)
                          && (!prev.capabilitiesStr.trim() || prev.capabilitiesStr === 'text_input, structured_json')
                          ? 'video_output, reference_video, reference_image, reference_audio'
                          : newProvider === 'minimax' && (!prev.capabilitiesStr.trim() || prev.capabilitiesStr === 'text_input, structured_json')
                            ? 'text_input, audio_output'
                            : prev.capabilitiesStr

                        return {
                          ...prev,
                          provider: newProvider,
                          modelName,
                          taskTagsStr,
                          capabilitiesStr,
                        }
                      })
                    }}
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  >
                    <option value="google">Google Gemini</option>
                    <option value="openai">OpenAI compatible</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="deepseek">DeepSeek API</option>
                    <option value="minimax">MiniMax TTS / Chat</option>
                    <option value="seedance">Seedance Video</option>
                    <option value="fal">Fal Video</option>
                    <option value="kieai">Kie.ai Video</option>
                    <option value="volcengine">Volcengine Video</option>
                    <option value="custom_shim">自定义格式 (Shim)</option>
                  </select>
                </label>

                <label className="space-y-1.5 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">模型标识 (Model Name)</span>
                  <input
                    required
                    value={llmForm.modelName}
                    onChange={e => setLlmForm(prev => ({ ...prev, modelName: e.target.value }))}
                    placeholder="例: gemini-2.0-flash"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">API Key (私有秘钥)</span>
                  <input
                    type="password"
                    value={llmForm.apiKey}
                    onChange={e => setLlmForm(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={editingLLMConfig ? "•••••••••••••••• (留空保持原秘钥)" : "请输入对接 API Key"}
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">代理根地址 (API Base URL)</span>
                  <input
                    value={llmForm.baseUrl}
                    onChange={e => setLlmForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder="Seedance 例: https://ark.ap-southeast.bytepluses.com (缺省则使用厂商默认端点)"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">专属任务标签 (Task Tags)</span>
                  <input
                    value={llmForm.taskTagsStr}
                    onChange={e => setLlmForm(prev => ({ ...prev, taskTagsStr: e.target.value }))}
                    placeholder="英文逗号分隔，例如: copywriting, companion, video_generation, image_to_video"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">适用内容生成类型</span>
                  <input
                    value={llmForm.contentGenerationTypesStr}
                    onChange={e => setLlmForm(prev => ({ ...prev, contentGenerationTypesStr: e.target.value }))}
                    placeholder="英文逗号分隔，例如: marketing_plan, instagram_content, tiktok_content, google_map_content"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">能力标签 (Capabilities)</span>
                  <input
                    value={llmForm.capabilitiesStr}
                    onChange={e => setLlmForm(prev => ({ ...prev, capabilitiesStr: e.target.value }))}
                    placeholder="video_output, reference_video, reference_image"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:col-span-2">
                  <label className="space-y-1.5 block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Priority</span>
                    <input type="number" value={llmForm.priority} onChange={e => setLlmForm(prev => ({ ...prev, priority: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white" />
                  </label>
                  <label className="space-y-1.5 block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timeout ms</span>
                    <input type="number" min={1000} value={llmForm.timeoutMs} onChange={e => setLlmForm(prev => ({ ...prev, timeoutMs: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white" />
                  </label>
                  <label className="space-y-1.5 block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Max retries</span>
                    <input type="number" min={0} max={5} value={llmForm.maxRetries} onChange={e => setLlmForm(prev => ({ ...prev, maxRetries: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white" />
                  </label>
                </div>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Fallback profile IDs</span>
                  <input value={llmForm.fallbackProfileIdsStr} onChange={e => setLlmForm(prev => ({ ...prev, fallbackProfileIdsStr: e.target.value }))} placeholder="逗号分隔的 LLMConfig ID" className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white" />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Cost metadata (JSON)</span>
                  <textarea value={llmForm.costMetadataStr} onChange={e => setLlmForm(prev => ({ ...prev, costMetadataStr: e.target.value }))} placeholder='{"currency":"USD","perSecond":0.02}' rows={3} className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white" />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Secret reference</span>
                  <input value={llmForm.secretRef} onChange={e => setLlmForm(prev => ({ ...prev, secretRef: e.target.value }))} placeholder="内部密钥引用标识；不填写真实 key" className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white" />
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black text-slate-700 dark:text-slate-200">统一任务路由状态</p>
                  <p className="text-[9px] text-slate-400">Content: {modelTaskServices.amcContent || 'loading'} · Kanban: {modelTaskServices.amcKanban || 'loading'}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {modelTaskRoutes.map((route) => (
                    <div key={route.task} className="rounded-lg border border-slate-100 dark:border-slate-800 p-2 text-[9px] text-slate-500">
                      <p className="font-bold text-slate-700 dark:text-slate-200">{route.task} <span className="font-normal text-slate-400">· {route.executionDomain}</span></p>
                      <p>primary: {route.primaryModelName || route.primaryProfileId || 'unconfigured'}</p>
                      <p>fallback: {route.fallbackProfileIds?.join(' → ') || 'none'}</p>
                      <p>requires: {route.requiredCapabilities?.join(' + ') || 'none'}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setLlmConfigModalOpen(false)
                    setEditingLLMConfig(null)
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-350 hover:bg-slate-105 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingLLMConfig}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-blue-650 hover:bg-blue-700 text-white disabled:opacity-50 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {savingLLMConfig ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>保存中...</span>
                    </>
                  ) : (
                    <span>保存大模型</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
