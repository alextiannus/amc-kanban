'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FileSearch, RefreshCw, Search, Tag } from 'lucide-react'

type HotTopicItem = {
  id: string
  title: string
  markdown: string
  summary: string | null
  tags: string[]
  sourceUrl: string | null
  status: string
  createdByType: string
  updatedAt: string
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知时间'
  return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function HotTopicsView({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const [topics, setTopics] = useState<HotTopicItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedTopic = useMemo(() => topics.find((topic) => topic.id === selectedId) || topics[0] || null, [topics, selectedId])
  const tags = useMemo(() => Array.from(new Set(topics.flatMap((topic) => topic.tags))).sort(), [topics])

  const loadTopics = async () => {
    if (!brandId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (tag.trim()) params.set('tag', tag.trim())
      const res = await fetch(`/api/brands/${brandId}/topics${params.toString() ? `?${params}` : ''}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Hot Topics 加载失败')
      const nextTopics = json.topics || []
      setTopics(nextTopics)
      setSelectedId((current) => current && nextTopics.some((topic: HotTopicItem) => topic.id === current) ? current : nextTopics[0]?.id || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hot Topics 加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTopics()
  }, [brandId, tag])

  if (!brandId) return <div className="p-8 text-sm text-slate-400">请先选择品牌</div>

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Analytics Library</p>
            <h3 className="mt-1 flex items-center gap-2 text-xl font-black text-slate-900 dark:text-slate-50">
              <FileSearch className="h-5 w-5 text-emerald-500" /> Hot Topics
            </h3>
            <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
              {brandName || '当前品牌'} 的热点选题、趋势观察和竞品记录。页面只读，内容由 Research Agent 通过 API/MCP 写入。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void loadTopics() }}
                placeholder="搜索 topic / markdown / tag"
                className="h-10 w-64 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>
            <button onClick={loadTopics} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <RefreshCw className="h-4 w-4" /> 刷新
            </button>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              onClick={() => setTag('')}
              className={`rounded-full px-3 py-1 text-xs font-black transition-colors ${!tag ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
            >
              全部标签
            </button>
            {tags.map((topicTag) => (
              <button
                key={topicTag}
                onClick={() => setTag(topicTag)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black transition-colors ${tag === topicTag ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                <Tag className="h-3 w-3" /> #{topicTag}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="max-h-[640px] space-y-2 overflow-y-auto rounded-3xl border border-slate-100 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">加载 Hot Topics 中...</div>
          ) : topics.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">暂无 Hot Topics</div>
          ) : topics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => setSelectedId(topic.id)}
              className={`w-full rounded-2xl border p-3 text-left transition-colors ${selectedTopic?.id === topic.id ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/25' : 'border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60'}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">{topic.createdByType}</span>
                <span className="text-[10px] text-slate-400">{formatDate(topic.updatedAt)}</span>
              </div>
              <p className="line-clamp-2 text-sm font-black text-slate-800 dark:text-slate-100">{topic.title}</p>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{topic.summary || topic.markdown}</p>
              <p className="mt-2 truncate text-xs font-bold text-slate-400">{topic.tags.map((topicTag) => `#${topicTag}`).join(' ') || '无标签'}</p>
            </button>
          ))}
        </div>

        <div className="min-h-[640px] rounded-3xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {selectedTopic ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Hot Topic</p>
                  <h4 className="mt-1 text-xl font-black text-slate-900 dark:text-slate-50">{selectedTopic.title}</h4>
                  <p className="mt-1 text-xs font-medium text-slate-400">更新于 {formatDate(selectedTopic.updatedAt)}</p>
                </div>
                {selectedTopic.sourceUrl && (
                  <a href={selectedTopic.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <ExternalLink className="h-4 w-4" /> 来源
                  </a>
                )}
              </div>

              {selectedTopic.summary && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm font-semibold leading-7 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
                  {selectedTopic.summary}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {selectedTopic.tags.map((topicTag) => (
                  <span key={topicTag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">#{topicTag}</span>
                ))}
              </div>

              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-100 bg-slate-50 p-5 font-mono text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">{selectedTopic.markdown}</pre>
            </div>
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-slate-400">选择一个 Hot Topic 查看详情</div>
          )}
        </div>
      </div>
    </div>
  )
}
