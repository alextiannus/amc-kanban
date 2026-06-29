'use client'

import React, { useState } from 'react'
import { Shield, Key, Save, RefreshCw, Layers, ShieldCheck, Mail, CalendarClock, History, Settings } from 'lucide-react'
import EmailConfigPanel from './EmailConfigPanel'
import SchedulerPanel from './SchedulerPanel'

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
}

export default function SystemTab({
  systemConfig,
  onUpdateSystemConfig,
  onSaveSystemConfig,
  savingSystemConfig,
  systemLogs,
  systemLogsLoading,
  onFetchSystemLogs
}: SystemTabProps) {
  const [activeAccordion, setActiveAccordion] = useState<'ai' | 'smtp' | 'scheduler'>('ai')

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Tab Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Settings size={18} className="text-blue-500" /> 全局系统服务设置
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            在此管理大模型主 API 秘钥、微软 Azure TTS 语音生成参数、邮件发送网关，以及监控定时任务与系统的敏感操作日志。
          </p>
        </div>
      </div>

      {/* Accordion Panels */}
      <div className="space-y-4">
        {/* Panel 1: AI Keys */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
            onClick={() => setActiveAccordion(activeAccordion === 'ai' ? 'ai' : 'ai')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <Key size={15} className="text-indigo-500" />
              <span>全局 AI 模型与语音服务 (LLM & TTS Keys)</span>
            </span>
            {systemConfig?.geminiConfigured && systemConfig?.azureSpeechConfigured && (
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-900/30">服务均已就绪</span>
            )}
          </button>

          {activeAccordion === 'ai' && (
            <div className="px-6 pb-6 pt-1 space-y-5 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-150">
              {/* Gemini API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Gemini API Key</label>
                  {systemConfig?.geminiConfigured && (
                    <span className="text-[9px] font-bold text-emerald-500">● 秘钥已配置</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={systemConfig?.geminiApiKey ?? ''}
                    onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, geminiApiKey: e.target.value } : { geminiApiKey: e.target.value })}
                    placeholder="请输入全局 Gemini API Key"
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    onClick={onSaveSystemConfig}
                    disabled={savingSystemConfig || !systemConfig}
                    className="px-4 py-2 bg-blue-650 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex-shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    {savingSystemConfig ? '保存中...' : '保存全局 AI 秘钥'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  说明：系统调用 AI 模块时优先使用此 Key。留空则退回 process.env.GEMINI_API_KEY。
                </p>
              </div>

              {/* Azure TTS */}
              <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                    Microsoft Azure Speech TTS
                  </label>
                  {systemConfig?.azureSpeechConfigured && (
                    <span className="text-[9px] font-bold text-emerald-500">● 语音服务已就绪</span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="password"
                    value={systemConfig?.azureSpeechKey ?? ''}
                    onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, azureSpeechKey: e.target.value } : null)}
                    placeholder="请输入 Azure Speech Key 1 (留空则默认回滚使用浏览器原生 TTS)"
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <select
                    value={systemConfig?.azureSpeechRegion ?? 'eastasia'}
                    onChange={e => onUpdateSystemConfig(prev => prev ? { ...prev, azureSpeechRegion: e.target.value } : null)}
                    className="w-full sm:w-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="eastasia">East Asia (香港)</option>
                    <option value="southeastasia">Southeast Asia (新加坡)</option>
                    <option value="eastus">East US (美国东部)</option>
                    <option value="westeurope">West Europe (西欧)</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  配置后，amc-mm 商家语音小助手将使用高拟真度 Azure XiaoxiaoNeural 中文女声。免费层每月提供 5 小时 Neural TTS 音频。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Panel 2: SMTP Mail */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
            onClick={() => setActiveAccordion(activeAccordion === 'smtp' ? 'smtp' : 'smtp')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/40 dark:hover:bg-slate-850/10 transition-all focus:outline-none"
          >
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <Mail size={15} className="text-indigo-500" />
              <span>邮件发送网关配置 (SMTP Services)</span>
            </span>
            {systemConfig?.smtpConfigured && (
              <span className="text-[10px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-950/20 px-2.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-900/30">邮件通道已激活</span>
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

        {/* Panel 3: Cron Scheduler */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button 
            onClick={() => setActiveAccordion(activeAccordion === 'scheduler' ? 'scheduler' : 'scheduler')}
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
      </div>

      {/* System Audit logs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <History size={15} className="text-slate-500" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">全局系统操作审计日志 (Audit Trail)</h3>
          </div>
          <button
            onClick={onFetchSystemLogs}
            disabled={systemLogsLoading}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-350 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 transition-all disabled:opacity-50 cursor-pointer"
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
                <th className="text-left px-4 py-3">经办操作人</th>
                <th className="text-left px-4 py-3">动作行为 (Action)</th>
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
                    details = '变更数据解析失败';
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
    </div>
  )
}
