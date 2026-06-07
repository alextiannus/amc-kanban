import { useState, useMemo } from 'react'
import { X } from 'lucide-react'

type ArchiveTask = {
  assignee?: {
    nickname?: string | null
    email?: string | null
    workflow?: string | null
  } | null
}

export default function ArchiveFilters({ tasks, onFilter }: { tasks: ArchiveTask[], onFilter: (params: { agent: string; workflow: string; dateFrom: string; dateTo: string }) => void }) {
  // 自动聚合选项
  const agentOptions = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach((t) => {
      const label = t.assignee?.nickname ?? t.assignee?.email
      if (typeof label === 'string' && label.trim()) set.add(label)
    })
    return Array.from(set).sort()
  }, [tasks])
  const workflowOptions = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach(t => t.assignee?.workflow && set.add(t.assignee.workflow))
    return Array.from(set).sort()
  }, [tasks])

  // 筛选状态
  const [agent, setAgent] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const handleFilter = () => {
    onFilter({ agent, workflow, dateFrom, dateTo })
  }

  const handleReset = () => {
    setAgent('')
    setWorkflow('')
    setDateFrom('')
    setDateTo('')
    onFilter({ agent: '', workflow: '', dateFrom: '', dateTo: '' })
  }

  const isFiltered = agent || workflow || dateFrom || dateTo

  return (
    <div className="flex flex-wrap gap-2 items-end bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
      <div>
        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">日期从</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">到</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Agent</label>
        <select value={agent} onChange={e => setAgent(e.target.value)} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm min-w-[140px] focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          <option value="">全部</option>
          {agentOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">流程</label>
        <select value={workflow} onChange={e => setWorkflow(e.target.value)} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm min-w-[140px] focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          <option value="">全部</option>
          {workflowOptions.map(w => <option key={w} value={w}>{w.substring(0, 40)}{w.length > 40 ? '...' : ''}</option>)}
        </select>
      </div>
      <button onClick={handleFilter} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-1.5 rounded-lg text-sm transition-colors">筛选</button>
      {isFiltered && (
        <button onClick={handleReset} className="flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900 transition-colors">
          <X size={14} /> 重置
        </button>
      )}
    </div>
  )
}
