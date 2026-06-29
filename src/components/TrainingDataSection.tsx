'use client'

import { useState } from 'react'
import { MessageSquare, PenTool, Download } from 'lucide-react'
import ConversationLogPanel from '@/components/ConversationLogPanel'
import CopywriterLogPanel from '@/components/CopywriterLogPanel'

type SubTab = 'companion' | 'copywriter'

interface TrainingDataSectionProps {
  brands: { id: string; name: string }[]
}

const ExportPanel = ({ brands }: { brands: { id: string; name: string }[] }) => {
  const [exportType,    setExportType]    = useState<'all' | 'companion' | 'copywriter'>('all')
  const [exportTag,     setExportTag]     = useState<'include' | 'any'>('include')
  const [exportFormat,  setExportFormat]  = useState<'jsonl' | 'csv'>('jsonl')
  const [exportBrand,   setExportBrand]   = useState('')
  const [exportStart,   setExportStart]   = useState('')
  const [exportEnd,     setExportEnd]     = useState('')
  const [exporting,     setExporting]     = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({
        type:        exportType,
        trainingTag: exportTag,
        format:      exportFormat,
        ...(exportBrand ? { brandId: exportBrand } : {}),
        ...(exportStart ? { startDate: exportStart } : {}),
        ...(exportEnd   ? { endDate:   exportEnd   } : {}),
      })
      const res = await fetch(`/api/admin/training-export?${params}`)
      if (!res.ok) { alert('导出失败'); return }

      const blob = await res.blob()
      const count = res.headers.get('X-Total-Records')
      const ext   = exportFormat === 'jsonl' ? '.jsonl' : '.csv'
      const name  = `training_${exportType}_${new Date().toISOString().slice(0, 10)}${ext}`
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
      if (count) alert(`✅ 已导出 ${count} 条训练样本 (${name})`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Download size={16} className="text-indigo-500" />
        <span className="text-sm font-black text-slate-800 dark:text-slate-100">导出训练数据</span>
        <span className="text-[10px] text-slate-400 ml-1">JSONL / CSV</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">数据类型</label>
          <select value={exportType} onChange={e => setExportType(e.target.value as typeof exportType)} className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none">
            <option value="all">全部（对话 + 文案）</option>
            <option value="companion">仅对话日志</option>
            <option value="copywriter">仅文案日志</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">训练标签筛选</label>
          <select value={exportTag} onChange={e => setExportTag(e.target.value as typeof exportTag)} className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none">
            <option value="include">✅ 仅 include（推荐）</option>
            <option value="any">全部已标注</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">导出格式</label>
          <select value={exportFormat} onChange={e => setExportFormat(e.target.value as typeof exportFormat)} className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none">
            <option value="jsonl">JSONL（Fine-tuning 用）</option>
            <option value="csv">CSV（人工审阅用）</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">品牌（可选）</label>
          <select value={exportBrand} onChange={e => setExportBrand(e.target.value)} className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none">
            <option value="">全部品牌</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">开始日期</label>
          <input type="date" value={exportStart} onChange={e => setExportStart(e.target.value)} className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">结束日期</label>
          <input type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)} className="w-full border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition"
        >
          <Download size={14} />
          {exporting ? '正在生成…' : `导出 ${exportFormat.toUpperCase()}`}
        </button>
        <p className="text-[10px] text-slate-400">
          仅导出 trainingTag = include 的已标注记录。correctedContent 优先替换 AI 原始输出。
        </p>
      </div>
    </div>
  )
}

/**
 * TrainingDataSection
 *
 * Admin-only wrapper that combines:
 * 1. Export panel (JSONL/CSV download)
 * 2. Sub-tabs: Companion conversation logs | Copywriter prompt logs
 */
export default function TrainingDataSection({ brands }: TrainingDataSectionProps) {
  const [subTab, setSubTab] = useState<SubTab>('companion')

  return (
    <div className="space-y-5">
      {/* Export panel */}
      <ExportPanel brands={brands} />

      {/* Sub-tab switcher */}
      <div className="flex gap-2">
        {([
          ['companion',  MessageSquare, 'AI 伴侣对话'],
          ['copywriter', PenTool,       'Copywriter 文案'],
        ] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition ${
              subTab === id
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {subTab === 'companion'  && <ConversationLogPanel brands={brands} />}
      {subTab === 'copywriter' && <CopywriterLogPanel brands={brands} />}
    </div>
  )
}
