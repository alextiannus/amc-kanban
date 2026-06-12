'use client'

import { Bot, Sparkles, Store, KeyRound, ArrowRight, ExternalLink } from 'lucide-react'
import AgentSequenceView from '../AgentSequenceView'

export const COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'pending', title: 'Require Input', highlight: true },
  { id: 'done', title: 'Done' },
  { id: 'void', title: 'Void' },
]

interface WorkflowTask {
  id: string
  status: string
  priority?: string | null
  assigneeId?: string | null
  deadline?: string | null
  updatedAt?: string | null
  createdAt?: string | null
  title?: string | null
  description?: string | null
  materials?: string | null
  tags?: string[] | null
  assignee?: {
    nickname?: string | null
    email?: string | null
  } | null
}

interface AgentsWorkflowViewProps {
  onOpenDashboard: () => void
  onCreateAgent: () => void | Promise<void>
}

export default function AgentsWorkflowView({
  onOpenDashboard,
  onCreateAgent,
}: AgentsWorkflowViewProps) {
  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.10),transparent_38%)]" />
        <div className="relative p-6 md:p-8 lg:p-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 dark:border-sky-900/60 bg-sky-50/80 dark:bg-sky-900/20 px-4 py-2 text-xs font-bold text-sky-700 dark:text-sky-300">
              <Sparkles className="h-4 w-4" /> AMC 主理人工作台
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                让 AMC Agent 帮你经营多个品牌
              </h1>
              <p className="max-w-2xl text-sm md:text-base leading-7 text-slate-600 dark:text-slate-300">
                这里只展示当前用户的 AMC Agent 序列。你可以先添加品牌，再为每个品牌绑定对应的 AMC Agent，随后通过 API 和 MCP 加载 Skill，按时间、按顺序推进内容生成任务。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onOpenDashboard}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/10 transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-slate-900"
              >
                <Store className="h-4 w-4" /> 开始添加品牌
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={onCreateAgent}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950 px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300"
              >
                <KeyRound className="h-4 w-4" /> 新增 AMC Agent
              </button>
              <a
                href="/connect"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950 px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300"
              >
                <ExternalLink className="h-4 w-4" /> 查看 AI 连接方式
              </a>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-4 md:p-5">
            {[
              '品牌信息统一存在 amc-kanban：上下文、素材库路径、连接方式都可追踪。',
              '主理人可管理多个 AMC Agent，每个品牌可自动对应一个 Agent。',
              'Skill 可通过 API / MCP 加载，支持品牌运营与内容执行。',
            ].map((text) => (
              <div key={text} className="flex items-start gap-3 rounded-2xl bg-white dark:bg-slate-900 px-4 py-3 text-sm leading-6 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 md:p-8 space-y-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">AMC Agent 序列</p>
            <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-slate-50">当前用户的 AMC Agent</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            这里展示你当前可见的 Agent 序列。打开任一 Agent 可查看 Skill 正文、执行流和身份密钥。
          </p>
        </div>
        <AgentSequenceView />
      </section>
    </div>
  )
}
