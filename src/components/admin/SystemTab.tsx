'use client'

import React, { useState } from 'react'
import {
  Shield, Key, Save, RefreshCw, Layers, ShieldCheck, Mail, CalendarClock, History, Settings,
  Sparkles, Plus, Trash2, Edit3, Loader2, Check, Clock, AlertTriangle, MessageSquare
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
  createdAt: string
  updatedAt: string
}

interface SystemTabProps {
  systemConfig: {
    geminiApiKey: string
    geminiConfigured: boolean
    azureSpeechKey: string
    azureSpeechRegion: string
    azureSpeechConfigured: boolean
    smtpHost: string
    smtpPort: number | null
    smtpUser: string
    smtpPassword: string
    smtpFrom: string
    smtpFromName: string
    smtpSecure: boolean
    smtpConfigured: boolean
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
  onFetchLLMConfigs
}: SystemTabProps) {
  const [activeAccordion, setActiveAccordion] = useState<'llm' | 'ai' | 'smtp' | 'scheduler' | 'templates' | ''>('llm')
  
  // LLM Config inner states
  const [llmConfigModalOpen, setLlmConfigModalOpen] = useState(false)
  const [editingLLMConfig, setEditingLLMConfig] = useState<LLMConfigRecord | null>(null)
  const [savingLLMConfig, setSavingLLMConfig] = useState(false)
  const [llmFormError, setLlmFormError] = useState<string | null>(null)

  const [llmForm, setLlmForm] = useState({
    provider: 'google',
    displayName: '',
    modelName: 'gemini-2.0-flash',
    apiKey: '',
    baseUrl: '',
    isEnabled: true,
    isDefault: false,
    taskTagsStr: '',
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
        .map(t => t.trim())
        .filter(Boolean)

      const body: any = {
        provider: llmForm.provider,
        displayName: llmForm.displayName,
        modelName: llmForm.modelName,
        baseUrl: llmForm.baseUrl || null,
        isEnabled: llmForm.isEnabled,
        isDefault: llmForm.isDefault,
        taskTags: tags,
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
            在此集中管理大模型多路容灾路由、主 API 秘钥、微软 Azure TTS 语音生成、邮件发送网关，以及监控定时任务与系统审计日志。
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
              <span>外部大模型配置与多路容灾路由 (LLM Configs)</span>
            </span>
            <span className="text-[10px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-950/20 px-2.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-900/30">
              已注册 {llmConfigs.length} 路由
            </span>
          </button>

          {activeAccordion === 'llm' && (
            <div className="px-6 pb-6 pt-1 space-y-4 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs text-slate-400 font-bold">配置当首选模型响应超时或遭遇频率限制时，系统按顺序容灾路由调用的备用模型。</span>
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
                  暂无备用大模型路由配置。将直接退回主 Gemini 秘钥或环境变量。
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

        {/* Section 2: AI Keys */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
            onClick={() => setActiveAccordion(activeAccordion === 'ai' ? '' : 'ai')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <Key size={15} className="text-indigo-500" />
              <span>全局默认 AI 秘钥与语音 (Gemini & Azure keys)</span>
            </span>
            {systemConfig?.geminiConfigured && systemConfig?.azureSpeechConfigured && (
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-900/30">主控秘钥已配置</span>
            )}
          </button>

          {activeAccordion === 'ai' && (
            <div className="px-6 pb-6 pt-1 space-y-5 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              {/* Gemini API Key */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Gemini API Key</label>
                  {systemConfig?.geminiConfigured && (
                    <span className="text-[9px] font-bold text-emerald-500">● 秘钥已就绪</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={systemConfig?.geminiApiKey ?? ''}
                    onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, geminiApiKey: e.target.value } : { geminiApiKey: e.target.value })}
                    placeholder="请输入全局 Gemini API Key"
                    className="flex-1 rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    onClick={onSaveSystemConfig}
                    disabled={savingSystemConfig || !systemConfig}
                    className="px-4 py-2 bg-blue-650 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex-shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    {savingSystemConfig ? '保存中...' : '保存默认 API'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-405 leading-normal">
                  说明：系统调用 AI 模块时优先使用此 Key。若未配置任何外部大模型路由且此处留空，系统将退回取服务器环境变量 `GEMINI_API_KEY`。
                </p>
              </div>

              {/* Azure Speech TTS */}
              <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                    Microsoft Azure Speech TTS
                  </label>
                  {systemConfig?.azureSpeechConfigured && (
                    <span className="text-[9px] font-bold text-emerald-500">● 语音服务已配置</span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="password"
                    value={systemConfig?.azureSpeechKey ?? ''}
                    onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, azureSpeechKey: e.target.value } : null)}
                    placeholder="请输入 Azure Speech Key 1 (留空则使用浏览器自带原生语音)"
                    className="flex-1 rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <select
                    value={systemConfig?.azureSpeechRegion ?? 'eastasia'}
                    onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, azureSpeechRegion: e.target.value } : null)}
                    className="w-full sm:w-44 rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="eastasia">East Asia (香港)</option>
                    <option value="southeastasia">Southeast Asia (新加坡)</option>
                    <option value="eastus">East US (美国东部)</option>
                    <option value="westeurope">West Europe (西欧)</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-405 leading-normal">
                  配置后，商家端语音播报将使用 Azure XiaoxiaoNeural（高保真中文女声）。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: SMTP */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
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
                
                let details = '-';
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
                    details = changes.length > 0 ? changes.join(' | ') : '无字段变更';
                  } catch {
                    details = '数据解析失败';
                  }
                }
                
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
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  >
                    <option value="google">Google Gemini</option>
                    <option value="openai">OpenAI compatible</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="deepseek">DeepSeek API</option>
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
                    placeholder="例: https://api.openai.com/v1 (缺省则使用厂商默认端点)"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">专属任务标签 (Task Tags)</span>
                  <input
                    value={llmForm.taskTagsStr}
                    onChange={e => setLlmForm(prev => ({ ...prev, taskTagsStr: e.target.value }))}
                    placeholder="英文逗号分隔，例如: copywriter, summary"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>
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
