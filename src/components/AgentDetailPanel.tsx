'use client'

import { useState } from 'react'
import { Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildAgentInitPrompt } from '@/lib/agentInitPrompt'

const markdownComponents = {
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

export type AgentDetailPanelAgent = {
  id: string
  apiKey?: string | null
  introduction?: string | null
  workflow?: string | null
}

export default function AgentDetailPanel({ agent }: { agent: AgentDetailPanelAgent }) {
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState(false)

  const getCopyCommand = (apiKey: string | null = null) => {
    const hostFromEnv = process.env.NEXT_PUBLIC_KANBAN_HOST
    const hostFromWindow = typeof window !== 'undefined' ? window.location.origin : null
    const baseHost = hostFromEnv || hostFromWindow || 'https://amc-kanban.immedi.ai'
    return buildAgentInitPrompt({ apiKey, apiBaseUrl: `${baseHost}/api` })
  }

  return (
    <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-5 animate-in fade-in slide-in-from-top-2">
      {agent.apiKey && (
        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-3">🔑 凭证管理</span>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={agent.apiKey}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 font-mono text-xs focus:outline-none"
              />
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  navigator.clipboard.writeText(agent.apiKey ?? '')
                  setCopiedKey(true)
                  setTimeout(() => setCopiedKey(false), 2000)
                }}
                className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex-shrink-0"
              >
                {copiedKey ? '已复制 Key' : '复制 Key'}
              </button>
            </div>
            <button
              onClick={(event) => {
                event.stopPropagation()
                navigator.clipboard.writeText(getCopyCommand(agent.apiKey ?? null))
                setCopiedCommand(true)
                setTimeout(() => setCopiedCommand(false), 2000)
              }}
              className="w-full px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 mt-1"
            >
              📜 {copiedCommand ? 'Skill 已复制' : '一键复制完整初始化 Skill'}
            </button>
          </div>
        </div>
      )}

      {agent.introduction && (
        <div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2 flex items-center gap-2">
            <Bot size={14} /> 个人简介
          </span>
          <div className="text-sm text-slate-600 dark:text-slate-400 prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {agent.introduction}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {agent.workflow && (
        <div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">执行流</span>
          <div className="text-sm text-slate-600 dark:text-slate-400 prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {agent.workflow}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}