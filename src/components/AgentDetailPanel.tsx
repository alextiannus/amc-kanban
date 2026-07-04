import { Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const markdownComponents = {
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

export type AgentDetailPanelAgent = {
  id: string
  introduction?: string | null
  workflow?: string | null
}

export default function AgentDetailPanel({ agent }: { agent: AgentDetailPanelAgent }) {
  return (
    <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-5 animate-in fade-in slide-in-from-top-2">
      <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">🔑 凭证管理</span>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Agent API Key 只在创建或轮换时显示一次；系统不会在详情页读取或展示已保存的密钥。
          如需重新配置外部 Agent，请使用「生成 / 重置 API Key」流程。
        </p>
      </div>

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
