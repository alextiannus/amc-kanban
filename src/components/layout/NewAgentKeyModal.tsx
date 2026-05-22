'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { buildAgentInitPrompt } from '@/lib/agentInitPrompt'

interface NewAgentKeyModalProps {
  newApiKey: string
  onClose: () => void
}

export default function NewAgentKeyModal({ newApiKey, onClose }: NewAgentKeyModalProps) {
  const [copied, setCopied] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)

  const getCopyCommand = (apiKey: string | null = null) => {
    const hostFromEnv = process.env.NEXT_PUBLIC_KANBAN_HOST
    const hostFromWindow = typeof window !== 'undefined' ? window.location.origin : null
    const baseHost = hostFromEnv || hostFromWindow || 'https://amc-kanban.immedi.ai'
    return buildAgentInitPrompt({ apiKey, apiBaseUrl: `${baseHost}/api` })
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 p-8 relative animate-in fade-in zoom-in duration-300">
        <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">🎉 新龙虾已孵化</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">我们已在系统中为您预注册了一只新的 AI 员工，并为其分配了专属的身份密钥。</p>
        
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-2">⚠️ 唯一显示机会</p>
          <p className="text-xs text-amber-700 dark:text-amber-500">
            系统已为您预注册了新的 AI 身份。你有两种接入方式：<br/>
            <b>方式一：</b> 单独复制 Key 填入底层 MCP 配置（推荐，最稳定）。<br/>
            <b>方式二：</b> 一键复制包含 Key 的完整指令发给 AI，让它动态携带。
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">🔑 独立 API Key</label>
          <div className="relative">
            <input 
              type="text" 
              readOnly 
              value={newApiKey} 
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-slate-800 dark:text-slate-100 font-mono text-sm shadow-inner" 
            />
            <button 
              onClick={() => {
                navigator.clipboard.writeText(newApiKey);
                setKeyCopied(true);
                setTimeout(() => setKeyCopied(false), 2000);
              }}
              className="absolute right-2 top-2 p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-500 transition-colors"
              title="Copy API Key"
            >
              {keyCopied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">📜 包含 Key 的完整初始化指令</label>
          <div className="relative">
            <textarea 
              readOnly 
              value={getCopyCommand(newApiKey)} 
              className="w-full h-40 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-slate-800 dark:text-slate-100 font-mono text-xs shadow-inner resize-none focus:outline-none" 
            />
            <button 
              onClick={() => {
                navigator.clipboard.writeText(getCopyCommand(newApiKey));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="absolute right-2 top-2 p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-500 transition-colors"
              title="Copy Full Command"
            >
              {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        <button 
          onClick={onClose} 
          className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3.5 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all shadow-md hover:shadow-lg"
        >
          我已经复制完毕，确认关闭
        </button>
      </div>
    </div>
  )
}
