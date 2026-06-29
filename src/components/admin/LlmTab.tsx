'use client'

import React, { useState } from 'react'
import { Sparkles, Plus, RefreshCw, Save, Trash2, Edit3, Loader2, Check, Clock, AlertTriangle, Key } from 'lucide-react'

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

interface LlmTabProps {
  llmConfigs: LLMConfigRecord[]
  llmConfigsLoading: boolean
  onFetchLLMConfigs: () => Promise<void>
  onFetchSystemLogs?: () => Promise<void>
}

export default function LlmTab({
  llmConfigs,
  llmConfigsLoading,
  onFetchLLMConfigs,
  onFetchSystemLogs
}: LlmTabProps) {
  const [llmConfigModalOpen, setLlmConfigModalOpen] = useState(false)
  const [editingLLMConfig, setEditingLLMConfig] = useState<LLMConfigRecord | null>(null)
  const [savingLLMConfig, setSavingLLMConfig] = useState(false)
  const [llmFormError, setLlmFormError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

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

  const handleOpenNewModal = () => {
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

  const handleOpenEditModal = (config: LLMConfigRecord) => {
    setEditingLLMConfig(config)
    setLlmForm({
      provider: config.provider,
      displayName: config.displayName,
      modelName: config.modelName,
      apiKey: '', // don't pre-fill secret key in client
      baseUrl: config.baseUrl || '',
      isEnabled: config.isEnabled,
      isDefault: config.isDefault,
      taskTagsStr: config.taskTags.join(', '),
    })
    setLlmFormError(null)
    setLlmConfigModalOpen(true)
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
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
      
      // Only send apiKey if it's filled (allows updating other fields without changing key)
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
        if (onFetchSystemLogs) {
          await onFetchSystemLogs()
        }
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

  const handleDeleteConfig = async (id: string) => {
    if (!confirm('确定要删除这个大模型配置吗？此操作不可撤销。')) return
    try {
      const res = await fetch(`/api/admin/llm-configs/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await onFetchLLMConfigs()
        if (onFetchSystemLogs) {
          await onFetchSystemLogs()
        }
      } else {
        alert('删除失败')
      }
    } catch (e) {
      console.error('[deleteLLMConfig error]', e)
      alert('删除失败')
    }
  }

  const handleToggleEnabled = async (config: LLMConfigRecord) => {
    try {
      const res = await fetch(`/api/admin/llm-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !config.isEnabled }),
      })
      if (res.ok) {
        await onFetchLLMConfigs()
        if (onFetchSystemLogs) {
          await onFetchSystemLogs()
        }
      }
    } catch (e) {
      console.error('[toggleLLMConfigEnabled error]', e)
    }
  }

  const handleToggleDefault = async (config: LLMConfigRecord) => {
    try {
      const res = await fetch(`/api/admin/llm-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: !config.isDefault }),
      })
      if (res.ok) {
        await onFetchLLMConfigs()
        if (onFetchSystemLogs) {
          await onFetchSystemLogs()
        }
      }
    } catch (e) {
      console.error('[toggleLLMConfigDefault error]', e)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles size={18} className="text-blue-500" /> 多模型配置与容灾路由
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed max-w-2xl">
            在此配置平台运行所需的各个 AI API 接口。当调用首选模型遇到故障（如触发 429 频率限制、Token 额度用完、接口密钥失效等）时，
            系统会自动启动容灾路由，按顺序尝试下一个匹配标签的配置或默认配置，直至成功，最大程度保证文案创作与后台任务的连续性。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button 
            onClick={onFetchLLMConfigs} 
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-350 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 transition-all cursor-pointer"
          >
            <RefreshCw size={13} className={llmConfigsLoading ? 'animate-spin' : ''} />
            <span>刷新</span>
          </button>
          <button
            onClick={handleOpenNewModal}
            className="inline-flex items-center gap-1.5 bg-blue-650 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>新增大模型</span>
          </button>
        </div>
      </div>

      {/* Config list grid */}
      {llmConfigsLoading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-450 shadow-sm">
          <RefreshCw className="animate-spin inline-block mr-2 text-slate-450" size={18} />
          加载大模型配置中...
        </div>
      ) : llmConfigs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-450 shadow-sm leading-relaxed">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3 opacity-80" />
          <p className="font-extrabold text-slate-750 dark:text-slate-200">暂无大模型接口配置</p>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">系统目前将回退使用全局设置或服务器环境变量中的默认大模型密钥。请点击右上角「新增大模型」进行配置。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {llmConfigs.map((config) => {
            const isEnabled = config.isEnabled

            return (
              <div 
                key={config.id} 
                className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-all duration-200 ${
                  isEnabled 
                    ? 'border-slate-200 dark:border-slate-800' 
                    : 'border-slate-150/60 dark:border-slate-850 opacity-60'
                }`}
              >
                <div className="space-y-4">
                  {/* Top Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-850 dark:text-white text-sm leading-tight flex items-center gap-1.5">
                        {config.displayName}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-1 font-mono uppercase tracking-widest font-black">
                        {config.provider} / {config.modelName}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {config.isDefault && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                          默认
                        </span>
                      )}
                      <button
                        onClick={() => handleToggleEnabled(config)}
                        className={`text-[9px] px-2 py-0.5 rounded-full font-black border transition-all cursor-pointer ${
                          isEnabled
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border-emerald-100 dark:border-emerald-900/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {isEnabled ? '已启用' : '已禁用'}
                      </button>
                    </div>
                  </div>

                  {/* Detail specifications */}
                  <div className="text-xs space-y-1.5 border-t border-slate-100 dark:border-slate-800/80 pt-3.5 text-slate-650 dark:text-slate-400 font-medium">
                    {config.baseUrl && (
                      <div className="flex gap-2">
                        <span className="text-slate-400 w-16 flex-shrink-0">代理地址:</span>
                        <span className="font-mono break-all text-[11px]">{config.baseUrl}</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span className="text-slate-400 w-16 flex-shrink-0">API 秘钥:</span>
                      <span className="font-mono text-[11px]">
                        {config.apiKey ? `••••••••${config.apiKey.slice(-6)}` : '未配置 (继承全局或环境变量)'}
                      </span>
                    </div>
                    {config.taskTags.length > 0 && (
                      <div className="flex gap-2 items-center">
                        <span className="text-slate-400 w-16 flex-shrink-0">专属标签:</span>
                        <div className="flex flex-wrap gap-1">
                          {config.taskTags.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 rounded bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card footer action buttons */}
                <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-4">
                  <span className="text-[10px] text-slate-400 font-mono">创建时间: {new Date(config.createdAt).toLocaleDateString('zh-CN')}</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleToggleDefault(config)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-black border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-350 transition-all bg-white dark:bg-slate-900 cursor-pointer"
                    >
                      {config.isDefault ? '取消默认' : '设为默认'}
                    </button>
                    <button 
                      onClick={() => handleOpenEditModal(config)}
                      className="p-1 rounded-lg text-slate-450 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-all cursor-pointer"
                      title="编辑模型参数"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteConfig(config.id)}
                      className="p-1 rounded-lg text-slate-450 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                      title="删除配置"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {llmConfigModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-5 scrollbar-thin">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                {editingLLMConfig ? '编辑大模型连接配置' : '新增大模型连接配置'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                配置平台大模型调度。系统会基于专属标签匹配特定创作任务，无法连接时将自动切换至备用模型。
              </p>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              {llmFormError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-xl leading-relaxed animate-in fade-in duration-150">
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
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
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
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block flex items-center gap-1"><Key size={11} /> API Key (私有秘钥)</span>
                  <input
                    type="password"
                    value={llmForm.apiKey}
                    onChange={e => setLlmForm(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={editingLLMConfig ? "•••••••••••••••• (留空保持原秘钥)" : "请输入对接 API Key"}
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">代理根地址 (API Base URL / Endpoint)</span>
                  <input
                    value={llmForm.baseUrl}
                    onChange={e => setLlmForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder="例: https://api.openai.com/v1 (缺省则使用厂商默认端点)"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                </label>

                <label className="space-y-1.5 md:col-span-2 block">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">专属分派任务标签 (Task Tags)</span>
                  <input
                    value={llmForm.taskTagsStr}
                    onChange={e => setLlmForm(prev => ({ ...prev, taskTagsStr: e.target.value }))}
                    placeholder="英文逗号分隔，例如: copywriter, summary"
                    className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-505"
                  />
                  <p className="text-[10px] text-slate-400 leading-normal">
                    说明：系统匹配任务标签（如 copywriter）的调用会优先匹配包含该标签的接口配置，以方便对特定核心任务指定大模型。
                  </p>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setLlmConfigModalOpen(false)
                    setEditingLLMConfig(null)
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-550 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
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
